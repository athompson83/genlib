// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, segment, record, array, string, strings, nullableString, type PublicDataOptions, type ReadOptions } from "./http.js";
export type OsvQuery = ({ package: { name: string; ecosystem: string }; version: string; commit?: never } | { commit: string; package?: never; version?: never }) & { pageToken?: string };
export interface OsvFinding { id: string; modified: string }
export interface OsvAdvisory extends OsvFinding { published: string | null; withdrawn: string | null; summary: string | null; aliases: string[]; references: { type: string; url: string }[]; affected: { name: string; ecosystem: string; purl: string | null; versions: string[]; ranges: { type: string; repository: string | null; events: Record<string, string>[] }[] }[] }
function query(input: OsvQuery): Record<string, unknown> {
  const pageToken = input.pageToken === undefined ? undefined : inputText(input.pageToken, 8000);
  if (input.commit !== undefined) {
    if (input.package !== undefined || input.version !== undefined || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(input.commit)) throw new PublicDataError("INVALID_INPUT");
    return { commit: input.commit.toLowerCase(), ...(pageToken ? { page_token: pageToken } : {}) };
  }
  if (!input.package) throw new PublicDataError("INVALID_INPUT");
  return { package: { name: inputText(input.package.name, 214), ecosystem: inputText(input.package.ecosystem, 80) }, version: inputText(input.version, 200), ...(pageToken ? { page_token: pageToken } : {}) };
}
function finding(value: unknown): OsvFinding { const r = record(value); return { id: string(r.id), modified: string(r.modified) }; }
function advisory(value: unknown): OsvAdvisory {
  const r = record(value);
  return { ...finding(r), published: nullableString(r.published), withdrawn: nullableString(r.withdrawn), summary: nullableString(r.summary), aliases: strings(r.aliases ?? [], 1000),
    references: array(r.references ?? [], 1000).map(v => { const ref = record(v); return { type: string(ref.type), url: string(ref.url) }; }),
    affected: array(r.affected ?? [], 10000).map(v => { const a = record(v), pkg = record(a.package); return { name: string(pkg.name), ecosystem: string(pkg.ecosystem), purl: nullableString(pkg.purl), versions: strings(a.versions ?? [], 10000),
      ranges: array(a.ranges ?? [], 1000).map(v => { const range = record(v); return { type: string(range.type), repository: nullableString(range.repo), events: array(range.events, 1000).map(v => {
        const event = record(v), keys = Object.keys(event); if (keys.length !== 1 || !["introduced", "fixed", "last_affected", "limit"].includes(keys[0]!)) throw new PublicDataError("INVALID_RESPONSE");
        return Object.fromEntries(keys.map(key => [key, string(event[key])]));
      }) }; }) }; }),
  };
}
export function createOsvClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.osv.dev", provider: "osv-api",
    source: "https://google.github.io/osv.dev/api/", attribution: "OSV and the originating vulnerability databases; preserve advisory provenance and source terms." });
  return Object.freeze({
    query(input: OsvQuery, read: Pick<ReadOptions, "signal"> = {}) {
      const body = JSON.stringify(query(input));
      return http.request("/v1/query", value => { const r = record(value); return { advisories: array(r.vulns ?? [], 10000).map(advisory), nextPageToken: nullableString(r.next_page_token) }; },
        { ...read, method: "POST", contentType: "application/json", body });
    },
    queryBatch(inputs: readonly OsvQuery[], read: Pick<ReadOptions, "signal"> = {}) {
      if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) throw new PublicDataError("INVALID_INPUT");
      const queries = inputs.map(query), body = JSON.stringify({ queries });
      return http.request("/v1/querybatch", value => {
        const results = array(record(value).results, 100); if (results.length !== queries.length) throw new PublicDataError("INVALID_RESPONSE");
        return results.map(value => { const r = record(value); return { findings: array(r.vulns ?? [], 10000).map(finding), nextPageToken: nullableString(r.next_page_token) }; });
      }, { ...read, method: "POST", contentType: "application/json", body });
    },
    getAdvisory(id: string, read: ReadOptions = {}) { return http.request(`/v1/vulns/${segment(inputText(id, 200))}`, advisory, read); },
  });
}
