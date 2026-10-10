// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, inputInteger, queryPath, record, array, string, strings, number, nullableString, nullableNumber, boolean, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface ResearchOrganization { id: string; displayName: string; names: { value: string; language: string | null; types: string[] }[]; status: string; types: string[]; locations: { name: string | null; country: string | null; latitude: number | null; longitude: number | null }[]; relationships: { id: string; type: string; label: string }[] }
function rorId(value: unknown): string { const s = inputText(value, 100).replace(/^https:\/\/ror\.org\//u, ""); if (!/^0[a-z0-9]{6}[0-9]{2}$/u.test(s)) throw new PublicDataError("INVALID_INPUT"); return s; }
function organization(value: unknown): ResearchOrganization {
  const r = record(value), names = array(r.names, 1000).map(value => { const n = record(value); return { value: string(n.value), language: nullableString(n.lang), types: strings(n.types, 10) }; });
  const display = names.filter(n => n.types.includes("ror_display")); if (display.length !== 1) throw new PublicDataError("INVALID_RESPONSE");
  return { id: `https://ror.org/${rorId(r.id)}`, displayName: display[0]!.value, names, status: string(r.status), types: strings(r.types, 30),
    locations: array(r.locations, 1000).map(value => { const l = record(record(value).geonames_details); return { name: nullableString(l.name), country: nullableString(l.country_code), latitude: nullableNumber(l.lat), longitude: nullableNumber(l.lng) }; }),
    relationships: array(r.relationships ?? [], 1000).map(value => { const rel = record(value); return { id: `https://ror.org/${rorId(rel.id)}`, type: string(rel.type), label: string(rel.label) }; }) };
}
export function createRorClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.ror.org", provider: "ror",
    source: "https://ror.readme.io/docs/rest-api", attribution: "ROR identifiers/metadata CC0; retain GeoNames attribution for geographic source material." });
  return Object.freeze({
    getOrganization(identifier: string, read: ReadOptions = {}) { return http.request(`/v2/organizations/${rorId(identifier)}`, organization, read); },
    search(input: ReadOptions & { query: string; page?: number; country?: string; status?: "active" | "inactive" | "withdrawn" }) {
      const page = inputInteger(input.page ?? 1, 1, 500), filters: string[] = [];
      if (input.country !== undefined) { const c = inputText(input.country, 2).toUpperCase(); if (!/^[A-Z]{2}$/u.test(c)) throw new PublicDataError("INVALID_INPUT"); filters.push(`locations.geonames_details.country_code:${c}`); }
      if (input.status !== undefined) { if (!["active", "inactive", "withdrawn"].includes(input.status)) throw new PublicDataError("INVALID_INPUT"); filters.push(`status:${input.status}`); }
      return http.request(queryPath("/v2/organizations", { query: inputText(input.query, 500), page, filter: filters.length ? filters.join(",") : undefined }), value => {
        const r = record(value), total = number(r.number_of_results), items = array(r.items, 20).map(organization);
        return { items, total, page, nextPage: items.length === 20 && page * 20 < Math.min(total, 10000) ? page + 1 : null, resultCap: 10000 };
      }, input);
    },
    matchAffiliation(affiliation: string, read: ReadOptions = {}) {
      return http.request(queryPath("/v2/organizations", { affiliation: inputText(affiliation, 1000) }), value => array(record(value).items, 100).map(value => {
        const r = record(value); return { chosen: boolean(r.chosen), score: number(r.score), matchingType: string(r.matching_type), organization: organization(r.organization) };
      }), read);
    },
  });
}
