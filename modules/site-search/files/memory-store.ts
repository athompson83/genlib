// SPDX-License-Identifier: Apache-2.0
// In-memory SearchStore: a per-tenant inverted index with BM25 ranking, for tests, prototypes and small datasets
// that fit in one process. Lost on restart; production uses schema.sql with createSqlSearchStore or your own store.
//
// Tokenizer (shared with core.ts `tokenize`): runs of letters and digits, Unicode NFKD with combining marks removed
// (crème -> creme), lowercased. Each token is then stemmed by `stem` (Porter-lite, English): plural -ies -> -y,
// -sses -> -ss, -es after s/x/z/ch/sh, final -s (not -ss, -us, -is); then -eed -> -ee, -ing and -ed when a vowel
// remains, undoubling a final double consonant (running -> run) or restoring a final e on short words (making ->
// make). Words of three letters or fewer are left alone. There are no stop words.
//
// Ranking: BM25 (k1 1.2, b 0.75, idf ln(1 + (N - n + 0.5) / (n + 0.5))) over weighted fields: term frequency and
// document length are sums of per-field counts times the field weight (A 1, B 0.4, C 0.2, D 0.1). A phrase scores
// as the sum of its words; a prefix term scores as its best matching word in the document.
import { MARK_END, MARK_START, WEIGHT_VALUES, tokenize } from "./core.js";
import type { AttrFilter, FacetValue, IndexedDocument, QueryTerm, SearchSchema, SearchStore, SortPosition, StoreHit, StoreQuery, StoreResult, Token } from "./core.js";

const K1 = 1.2;
const B = 0.75;
/** Most vocabulary words one prefix term expands to. */
const MAX_PREFIX_EXPANSIONS = 100;
const FRAGMENT_CHARS = 200;

const VOWEL = /[aeiouy]/;
const isConsonant = (c: string | undefined) => c !== undefined && /[a-z]/.test(c) && !/[aeiou]/.test(c);

/** Porter-lite English stemmer for folded, lowercased words. */
export function stem(word: string): string {
  if (word.length <= 3 || !/^[a-z]+$/.test(word)) return word;
  let w = word;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (/(?:[sxz]|ch|sh)es$/.test(w) && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);

  if (w.endsWith("eed")) {
    if (w.length > 4) w = w.slice(0, -1);
  } else {
    const suffix = w.endsWith("ing") ? 3 : w.endsWith("ed") ? 2 : 0;
    const base = w.slice(0, w.length - suffix);
    if (suffix > 0 && base.length >= 3 && VOWEL.test(base)) {
      w = base;
      const last = w[w.length - 1];
      if (last === w[w.length - 2] && isConsonant(last) && !"lsz".includes(last!)) w = w.slice(0, -1);
      else if (w.length === 3 && isConsonant(w[0]) && !isConsonant(w[1]) && isConsonant(w[2]) && !"wxy".includes(w[2]!)) w += "e";
    }
  }
  return w;
}

interface FieldTokens { readonly stems: string[]; readonly tokens: Token[] }
interface Entry {
  readonly doc: IndexedDocument;
  readonly fields: Map<string, FieldTokens>;
  /** stem -> weighted term frequency */
  readonly tf: Map<string, number>;
  readonly length: number;
}
interface TenantIndex {
  readonly docs: Map<string, Entry>;
  /** stem -> document ids */
  readonly postings: Map<string, Set<string>>;
  /** surface word -> stem -> occurrences (for prefix expansion) */
  readonly surfaces: Map<string, Map<string, number>>;
  totalLength: number;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function copyDoc(doc: IndexedDocument): IndexedDocument {
  const attrs: Record<string, IndexedDocument["attrs"][string]> = {};
  for (const [key, value] of Object.entries(doc.attrs)) attrs[key] = Array.isArray(value) ? [...value] : value;
  return { ...doc, fields: { ...doc.fields }, attrs, visibility: [...doc.visibility] };
}

function matchesFilter(doc: IndexedDocument, filter: AttrFilter): boolean {
  const value = doc.attrs[filter.attr];
  if (filter.kind === "keyword") return Array.isArray(value) && filter.values.some((item) => value.includes(item));
  if (filter.kind === "boolean") return value === filter.value;
  if (typeof value !== "number") return false;
  return (filter.gte === undefined || value >= filter.gte) && (filter.gt === undefined || value > filter.gt) &&
    (filter.lte === undefined || value <= filter.lte) && (filter.lt === undefined || value < filter.lt);
}

function containsPhrase(entry: Entry, stems: readonly string[]): boolean {
  for (const { stems: field } of entry.fields.values()) {
    for (let i = 0; i + stems.length <= field.length; i++) {
      if (stems.every((item, offset) => field[i + offset] === item)) return true;
    }
  }
  return false;
}

export class MemorySearchStore implements SearchStore {
  readonly #tenants = new Map<string, TenantIndex>();

  #tenant(tenantId: string): TenantIndex {
    let index = this.#tenants.get(tenantId);
    if (!index) {
      index = { docs: new Map(), postings: new Map(), surfaces: new Map(), totalLength: 0 };
      this.#tenants.set(tenantId, index);
    }
    return index;
  }

  #unlink(index: TenantIndex, entry: Entry): void {
    index.docs.delete(entry.doc.id);
    index.totalLength -= entry.length;
    for (const stemmed of entry.tf.keys()) {
      const set = index.postings.get(stemmed);
      set?.delete(entry.doc.id);
      if (set && set.size === 0) index.postings.delete(stemmed);
    }
    for (const field of entry.fields.values()) {
      field.tokens.forEach((token, i) => {
        const stems = index.surfaces.get(token.text);
        const stemmed = field.stems[i]!;
        const count = (stems?.get(stemmed) ?? 0) - 1;
        if (!stems) return;
        if (count > 0) stems.set(stemmed, count);
        else stems.delete(stemmed);
        if (stems.size === 0) index.surfaces.delete(token.text);
      });
    }
  }

  async upsert(document: IndexedDocument, schema: SearchSchema): Promise<void> {
    const index = this.#tenant(document.tenantId);
    const previous = index.docs.get(document.id);
    if (previous && previous.doc.updatedAt > document.updatedAt) return;
    if (previous) this.#unlink(index, previous);
    const doc = copyDoc(document);
    const fields = new Map<string, FieldTokens>();
    const tf = new Map<string, number>();
    let length = 0;
    for (const [name, weightName] of Object.entries(schema.fields)) {
      const text = doc.fields[name];
      if (text === undefined) continue;
      const tokens = tokenize(text);
      const stems = tokens.map((token) => stem(token.text));
      const weight = WEIGHT_VALUES[weightName];
      fields.set(name, { stems, tokens });
      length += weight * stems.length;
      stems.forEach((stemmed, i) => {
        tf.set(stemmed, (tf.get(stemmed) ?? 0) + weight);
        const surface = tokens[i]!.text;
        const map = index.surfaces.get(surface) ?? new Map<string, number>();
        map.set(stemmed, (map.get(stemmed) ?? 0) + 1);
        index.surfaces.set(surface, map);
      });
    }
    for (const stemmed of tf.keys()) {
      const set = index.postings.get(stemmed) ?? new Set<string>();
      set.add(doc.id);
      index.postings.set(stemmed, set);
    }
    index.docs.set(doc.id, { doc, fields, tf, length });
    index.totalLength += length;
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const index = this.#tenants.get(tenantId);
    const entry = index?.docs.get(id);
    if (!index || !entry) return false;
    this.#unlink(index, entry);
    return true;
  }

  async search(query: StoreQuery): Promise<StoreResult> {
    const index = this.#tenants.get(query.tenantId);
    const facets: Record<string, FacetValue[]> = Object.fromEntries(query.facets.map((facet) => [facet, []]));
    if (!index) return { hits: [], total: 0, facets };
    const N = index.docs.size;
    const avgLength = N > 0 ? index.totalLength / N : 0;
    const idf = (stemmed: string) => {
      const n = index.postings.get(stemmed)?.size ?? 0;
      return Math.log(1 + (N - n + 0.5) / (n + 0.5));
    };
    const bm25 = (entry: Entry, stemmed: string) => {
      const f = entry.tf.get(stemmed) ?? 0;
      if (f === 0) return 0;
      const norm = avgLength > 0 ? entry.length / avgLength : 0;
      return idf(stemmed) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * norm));
    };

    // Resolve terms into stems once.
    const expand = (prefix: string): string[] => {
      const stems = new Set<string>();
      const surfaces = [...index.surfaces.keys()].filter((surface) => surface.startsWith(prefix)).sort(compareText).slice(0, MAX_PREFIX_EXPANSIONS);
      for (const surface of surfaces) for (const stemmed of index.surfaces.get(surface)!.keys()) stems.add(stemmed);
      return [...stems];
    };
    type Resolved = { term: QueryTerm; stems: string[] };
    const resolved: Resolved[] = query.terms.map((term) => ({
      term,
      stems: term.kind === "phrase" ? term.words.map(stem) : term.prefix ? expand(term.word) : [stem(term.word)],
    }));
    const positive = resolved.filter((item) => !item.term.exclude);

    const has = (entry: Entry, item: Resolved): boolean => {
      if (item.term.kind === "phrase") return containsPhrase(entry, item.stems);
      return item.stems.some((stemmed) => entry.tf.has(stemmed));
    };
    const principals = new Set(query.principals);
    const visible = (doc: IndexedDocument) => doc.visibility.length === 0 || doc.visibility.some((item) => principals.has(item));

    // Candidates come from the postings of the rarest positive word or phrase; with none, every document.
    let candidates: Iterable<Entry> = index.docs.values();
    const anchor = positive.filter((item) => item.term.kind === "phrase" || !(item.term as { prefix: boolean }).prefix)
      .map((item) => item.stems.map((stemmed) => index.postings.get(stemmed) ?? new Set<string>()))
      .flat().sort((a, b) => a.size - b.size)[0];
    if (anchor) candidates = [...anchor].map((id) => index.docs.get(id)!);

    const matched: { entry: Entry; score: number; sortValue: number | null }[] = [];
    for (const entry of candidates) {
      if (!visible(entry.doc)) continue;
      if (!query.filters.every((filter) => matchesFilter(entry.doc, filter))) continue;
      if (!resolved.every((item) => has(entry, item) !== item.term.exclude)) continue;
      let score = 0;
      for (const item of positive) {
        if (item.term.kind === "word" && item.term.prefix) score += Math.max(0, ...item.stems.map((stemmed) => bm25(entry, stemmed)));
        else for (const stemmed of item.stems) score += bm25(entry, stemmed);
      }
      let sortValue: number | null = score;
      if (query.sort.by === "attr") {
        const value = entry.doc.attrs[query.sort.attr];
        sortValue = typeof value === "number" ? value : null;
      }
      matched.push({ entry, score, sortValue });
    }

    const sort = query.sort;
    const compare = (a: { sortValue: number | null; id: string }, b: { sortValue: number | null; id: string }): number => {
      if (sort.by === "relevance") return (b.sortValue! - a.sortValue!) || compareText(a.id, b.id);
      if (a.sortValue === null || b.sortValue === null) {
        return a.sortValue === b.sortValue ? compareText(a.id, b.id) : a.sortValue === null ? 1 : -1;
      }
      return (sort.descending ? b.sortValue - a.sortValue : a.sortValue - b.sortValue) || compareText(a.id, b.id);
    };
    const rows = matched.map((item) => ({ ...item, id: item.entry.doc.id })).sort(compare);

    for (const facet of query.facets) {
      const counts = new Map<string, { value: string | boolean; count: number }>();
      for (const { entry } of rows) {
        const value = entry.doc.attrs[facet];
        const values = Array.isArray(value) ? value : typeof value === "boolean" ? [value] : [];
        for (const item of values) {
          const key = String(item);
          const slot = counts.get(key) ?? { value: item, count: 0 };
          slot.count++;
          counts.set(key, slot);
        }
      }
      facets[facet] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || compareText(a[0], b[0]))
        .slice(0, query.facetLimit).map(([, slot]) => slot);
    }

    const after: SortPosition | null = query.after;
    const page = (after ? rows.filter((row) => compare(row, { sortValue: after.value, id: after.id }) > 0) : rows).slice(0, query.limit);
    const hits: StoreHit[] = page.map((row) => ({
      id: row.id, score: row.score, sortValue: row.sortValue, highlights: highlight(row.entry, positive),
    }));
    return { hits, total: rows.length, facets };
  }
}

function highlight(entry: Entry, positive: readonly { term: QueryTerm; stems: string[] }[]): Record<string, string> {
  const stems = new Set<string>();
  const prefixes: string[] = [];
  for (const { term, stems: list } of positive) {
    if (term.kind === "word" && term.prefix) prefixes.push(term.word);
    else list.forEach((item) => stems.add(item));
  }
  const out: Record<string, string> = {};
  if (stems.size === 0 && prefixes.length === 0) return out;
  for (const [name, field] of entry.fields) {
    const text = entry.doc.fields[name] ?? "";
    const marks: Token[] = [];
    field.tokens.forEach((token, i) => {
      if (stems.has(field.stems[i]!) || prefixes.some((prefix) => token.text.startsWith(prefix))) {
        const previous = marks[marks.length - 1];
        if (!previous || previous.start !== token.start) marks.push(token);
      }
    });
    if (marks.length === 0) continue;
    let start = 0;
    let end = text.length;
    if (text.length > FRAGMENT_CHARS) {
      start = Math.max(0, marks[0]!.start - 60);
      if (start > 0) { const space = text.indexOf(" ", start); start = space === -1 || space > marks[0]!.start ? start : space + 1; }
      end = Math.min(text.length, start + FRAGMENT_CHARS);
      if (end < text.length) { const space = text.lastIndexOf(" ", end); end = space > marks[0]!.end ? space : Math.max(end, marks[0]!.end); }
    }
    let fragment = start > 0 ? "…" : "";
    let cursor = start;
    for (const mark of marks) {
      if (mark.start < cursor || mark.end > end) continue;
      fragment += text.slice(cursor, mark.start) + MARK_START + text.slice(mark.start, mark.end) + MARK_END;
      cursor = mark.end;
    }
    fragment += text.slice(cursor, end) + (end < text.length ? "…" : "");
    out[name] = fragment;
  }
  return out;
}
