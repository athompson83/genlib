// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, applicationAgent, inputText, inputInteger, segment, queryPath, record, array, string, strings, number, nullableString, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface CrossrefWork { doi: string; titles: string[]; type: string | null; publisher: string | null; authors: { given: string | null; family: string | null; orcid: string | null }[]; published: number[] | null; abstract: string | null }
export interface CrossrefPage { items: CrossrefWork[]; total: number; nextCursor: string | null }
function doi(value: string): string {
  const id = inputText(value, 1024).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").replace(/^doi:\s*/iu, "").toLowerCase();
  if (!/^10\.\d{4,9}\/\S+$/u.test(id)) throw new PublicDataError("INVALID_INPUT"); return id;
}
function work(value: unknown, includeAbstract: boolean): CrossrefWork {
  const r = record(value), published = r.published == null ? null : record(r.published)["date-parts"];
  const dates = published == null ? [] : array(published, 10);
  return { doi: doi(string(r.DOI)), titles: strings(r.title ?? [], 100), type: nullableString(r.type), publisher: nullableString(r.publisher),
    authors: array(r.author ?? [], 10000).map(value => { const a = record(value); return { given: nullableString(a.given), family: nullableString(a.family), orcid: nullableString(a.ORCID) }; }),
    published: dates.length ? array(dates[0], 3).map(number) : null, abstract: includeAbstract ? nullableString(r.abstract) : null };
}
export function createCrossrefClient(options: PublicDataOptions & { userAgent: string; mailto?: string; includeAbstract?: boolean }) {
  const mailto = options.mailto === undefined ? undefined : inputText(options.mailto, 254);
  if (mailto !== undefined && !/^[^\s@]+@[^\s@]+$/u.test(mailto)) throw new PublicDataError("INVALID_CONFIG");
  const includeAbstract = options.includeAbstract === true;
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.crossref.org", provider: "crossref",
    headers: { "user-agent": applicationAgent(options.userAgent) }, source: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/",
    attribution: "Crossref and the depositing publishers; abstracts retain their author/publisher rights." });
  return Object.freeze({
    getWork(identifier: string, read: ReadOptions = {}) {
      return http.request(queryPath(`/works/${segment(doi(identifier))}`, { mailto }), value => work(record(value).message, includeAbstract), read);
    },
    listWorks(input: ReadOptions & { query: string; cursor?: string; rows?: number }) {
      const rows = inputInteger(input.rows ?? 20, 1, 100), cursor = input.cursor === undefined ? "*" : inputText(input.cursor, 8000);
      const select = ["DOI", "title", "type", "publisher", "author", "published", ...(includeAbstract ? ["abstract"] : [])].join(",");
      return http.request(queryPath("/works", { query: inputText(input.query, 500), cursor, rows, select, mailto }), value => {
        const message = record(record(value).message), items = array(message.items, rows).map(v => work(v, includeAbstract));
        return { items, total: number(message["total-results"]), nextCursor: items.length < rows ? null : nullableString(message["next-cursor"]) } satisfies CrossrefPage;
      }, input);
    },
  });
}
