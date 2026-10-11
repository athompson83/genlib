// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, inputInteger, queryPath, record, array, string, nullableString, number, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface LegalEntity { lei: string; legalName: string; otherNames: string[]; jurisdiction: string | null; country: string | null; entityStatus: string; registrationStatus: string; updatedAt: string | null; relationships: { kind: string; relation: string; url: string }[] }
export interface LegalEntityPage { items: LegalEntity[]; page: number; total: number; nextPage: number | null; sourcePublishedAt: string | null }
function lei(value: unknown): string { const s = inputText(value, 20).toUpperCase(); if (!/^[A-Z0-9]{18}[0-9]{2}$/u.test(s)) throw new PublicDataError("INVALID_INPUT"); return s; }
function entity(value: unknown): LegalEntity {
  const r = record(value), a = record(r.attributes), e = record(a.entity), registration = record(a.registration);
  const relationships: LegalEntity["relationships"] = [];
  for (const [kind, relation] of Object.entries(record(r.relationships ?? {}))) {
    for (const [name, target] of Object.entries(record(record(relation).links ?? {}))) {
      const url = string(target); if (!url.startsWith("https://")) throw new PublicDataError("INVALID_RESPONSE");
      relationships.push({ kind, relation: name, url });
    }
  }
  return { lei: lei(a.lei), legalName: string(record(e.legalName).name), otherNames: array(e.otherNames ?? [], 1000).map(v => string(record(v).name)),
    jurisdiction: nullableString(e.jurisdiction), country: e.legalAddress == null ? null : nullableString(record(e.legalAddress).country), entityStatus: string(e.status),
    registrationStatus: string(registration.status), updatedAt: nullableString(registration.lastUpdateDate), relationships };
}
export function createGleifClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.gleif.org", provider: "gleif",
    headers: { accept: "application/vnd.api+json" }, source: "https://www.gleif.org/en/lei-data/gleif-api", attribution: "GLEIF LEI reference data, CC0." });
  return Object.freeze({
    getEntity(identifier: string, read: ReadOptions = {}) { return http.request(`/api/v1/lei-records/${lei(identifier)}`, value => entity(record(value).data), read); },
    search(input: ReadOptions & { name: string; country?: string; page?: number; pageSize?: number }) {
      const page = inputInteger(input.page ?? 1, 1, 10000), pageSize = inputInteger(input.pageSize ?? 20, 1, 100);
      const country = input.country === undefined ? undefined : inputText(input.country, 2).toUpperCase();
      if (country !== undefined && !/^[A-Z]{2}$/u.test(country)) throw new PublicDataError("INVALID_INPUT");
      return http.request(queryPath("/api/v1/lei-records", { "filter[fulltext]": inputText(input.name, 250), "filter[entity.legalAddress.country]": country, "page[number]": page, "page[size]": pageSize }), value => {
        const r = record(value), meta = record(r.meta), pagination = record(meta.pagination), currentPage = number(pagination.currentPage), lastPage = number(pagination.lastPage);
        return { items: array(r.data, pageSize).map(entity), page: currentPage, total: number(pagination.total), nextPage: currentPage < lastPage ? currentPage + 1 : null,
          sourcePublishedAt: meta.goldenCopy == null ? null : nullableString(record(meta.goldenCopy).publishDate) } satisfies LegalEntityPage;
      }, input);
    },
  });
}
