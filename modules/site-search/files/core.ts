// SPDX-License-Identifier: Apache-2.0
// Full-text search with filters for a multi-tenant app's own records (products, articles, tickets): weighted text
// fields, declared filter attributes (keyword, number, date, boolean), a small safe query language (words AND,
// "quoted phrases", -excluded, prefix* on the last word), facets, highlights and keyset paging. Framework-neutral;
// the receiving application supplies persistence (SearchStore) and authorization (authorize).
//
// Query text is parsed here into plain lexeme terms. Stores receive terms, never raw query syntax.

export type FieldWeight = "A" | "B" | "C" | "D";
export type FilterType = "keyword" | "number" | "date" | "boolean";
/** Relative field weights used for ranking (the PostgreSQL ts_rank defaults). */
export const WEIGHT_VALUES: Readonly<Record<FieldWeight, number>> = { A: 1, B: 0.4, C: 0.2, D: 0.1 };

export type SearchErrorCode =
  | "forbidden" | "not-found" | "invalid-tenant" | "invalid-id" | "invalid-field" | "invalid-attr" | "invalid-visibility"
  | "invalid-query" | "invalid-filter" | "invalid-sort" | "invalid-cursor" | "invalid-limit" | "invalid-facet"
  | "invalid-highlight" | "bad-request";

export class SearchError extends Error {
  readonly code: SearchErrorCode;
  constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.name = "SearchError";
    this.code = code;
  }
}

export interface SearchSchema {
  /** Text fields and their weights, in a fixed order, e.g. { title: "A", body: "C" }. */
  readonly fields: Readonly<Record<string, FieldWeight>>;
  /** Filterable attributes and their types. */
  readonly filters: Readonly<Record<string, FilterType>>;
}

/** Normalized attribute values: keyword is always a string array; date is epoch milliseconds. */
export type StoredAttr = readonly string[] | number | boolean;

export interface IndexedDocument {
  readonly tenantId: string;
  readonly id: string;
  /** Plain text per declared field (control characters removed). */
  readonly fields: Readonly<Record<string, string>>;
  readonly attrs: Readonly<Record<string, StoredAttr>>;
  /** Principals allowed to see the document; empty means every reader in the tenant. */
  readonly visibility: readonly string[];
  readonly updatedAt: number;
}

/** A parsed query term. Words are accent-folded and lowercased but not stemmed; stores stem them. */
export type QueryTerm =
  | { readonly kind: "word"; readonly word: string; readonly prefix: boolean; readonly exclude: boolean }
  | { readonly kind: "phrase"; readonly words: readonly string[]; readonly exclude: boolean };

export type AttrFilter =
  | { readonly attr: string; readonly kind: "keyword"; readonly values: readonly string[] }
  | { readonly attr: string; readonly kind: "boolean"; readonly value: boolean }
  | { readonly attr: string; readonly kind: "range"; readonly gte?: number; readonly gt?: number; readonly lte?: number; readonly lt?: number };

export type SortSpec = { readonly by: "relevance" } | { readonly by: "attr"; readonly attr: string; readonly descending: boolean };

/** Keyset position: the sort value (score for relevance; null when the sort attribute is missing) and the id. */
export interface SortPosition { readonly value: number | null; readonly id: string }

export interface StoreQuery {
  readonly schema: SearchSchema;
  readonly tenantId: string;
  /** The reader's principals; documents with a non-empty visibility list must share at least one. */
  readonly principals: readonly string[];
  readonly terms: readonly QueryTerm[];
  readonly filters: readonly AttrFilter[];
  readonly sort: SortSpec;
  /** Return only hits strictly after this position in sort order. */
  readonly after: SortPosition | null;
  /** Maximum hits to return. */
  readonly limit: number;
  /** keyword or boolean attributes to count over the whole filtered set. */
  readonly facets: readonly string[];
  readonly facetLimit: number;
}

export interface StoreHit {
  readonly id: string;
  readonly score: number;
  /** The sort key: equal to score for relevance, the attribute value (or null) for attribute sorts. */
  readonly sortValue: number | null;
  /** Per field: a fragment with each match wrapped in MARK_START and MARK_END; raw, unescaped text. */
  readonly highlights: Readonly<Record<string, string>>;
}

export interface FacetValue { readonly value: string | boolean; readonly count: number }

export interface StoreResult {
  readonly hits: readonly StoreHit[];
  readonly total: number;
  readonly facets: Readonly<Record<string, readonly FacetValue[]>>;
}

export interface SearchStore {
  /** Insert or replace (tenantId, id). A write older than the stored updatedAt may be ignored. */
  upsert(document: IndexedDocument, schema: SearchSchema): Promise<void>;
  /** Returns false when (tenantId, id) did not exist. */
  remove(tenantId: string, id: string): Promise<boolean>;
  search(query: StoreQuery): Promise<StoreResult>;
}

/** Highlight markers stores put around matches; field text never contains them (control characters are removed). */
export const MARK_START = "\u0002";
export const MARK_END = "\u0003";

export interface Actor { readonly userId: string }
export type SearchAction = "search" | "index";

export interface SearchOptions {
  readonly store: SearchStore;
  /**
   * Decide whether `actor` may `search` or `index` (index and remove) in `tenantId`. Return false to deny, true to
   * allow, or, for search, the actor's principals (groups, roles, user id) matched against each document's
   * visibility list. true means only documents without a visibility list are visible.
   */
  readonly authorize: (actor: Actor, action: SearchAction, tenantId: string) => Promise<boolean | readonly string[]>;
  readonly fields: Readonly<Record<string, FieldWeight>>;
  readonly filters?: Readonly<Record<string, FilterType>>;
  readonly now?: () => number;
  /** Largest total field text per document in characters. Default 100,000. */
  readonly maxDocumentLength?: number;
  /** Values returned per facet. Default 20. */
  readonly facetLimit?: number;
}

export interface IndexInput {
  readonly tenantId: string;
  readonly id: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly visibility?: readonly string[];
}

export type FilterInput = string | boolean | number | readonly string[] | {
  readonly gte?: number | string; readonly gt?: number | string; readonly lte?: number | string; readonly lt?: number | string;
};

export interface HighlightOptions {
  /** Inserted before each match. Default "<mark>". */
  readonly pre?: string;
  /** Inserted after each match. Default "</mark>". */
  readonly post?: string;
  /** true returns the text unescaped; by default it is HTML-escaped (the markers are not). */
  readonly raw?: boolean;
}

export interface QueryInput {
  readonly tenantId: string;
  readonly q?: string;
  readonly filters?: Readonly<Record<string, FilterInput>>;
  /** "relevance" (default), a number or date attribute (ascending) or "-attr" (descending). */
  readonly sort?: string;
  readonly cursor?: string | null;
  /** 1 to 50; default 20. */
  readonly limit?: number;
  readonly facets?: readonly string[];
  readonly highlight?: HighlightOptions;
}

export interface SearchHit { readonly id: string; readonly score: number; readonly highlights: Readonly<Record<string, string>> }

export interface SearchResult {
  readonly hits: readonly SearchHit[];
  readonly facets: Readonly<Record<string, readonly FacetValue[]>>;
  readonly total: number;
  /** Pass back to fetch the next page; null on the last page. */
  readonly cursor: string | null;
}

export interface Search {
  readonly schema: SearchSchema;
  index(actor: Actor, input: IndexInput): Promise<{ id: string; updatedAt: number }>;
  remove(actor: Actor, tenantId: string, id: string): Promise<void>;
  query(actor: Actor, input: QueryInput): Promise<SearchResult>;
}

// ---- Tokenizer -------------------------------------------------------------------------------------------------
// A token is a run of letters, digits and combining marks that starts with a letter or digit. Each token is
// folded: Unicode NFKD, combining marks removed (café -> cafe), lowercased. Folding that yields punctuation
// (for example ½ -> 1⁄2) splits the token again. Stemming happens in the store (memory-store.ts has Porter-lite;
// PostgreSQL uses its text search configuration).

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;
const PIECE = /[\p{L}\p{N}]+/gu;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Unicode NFKD with combining marks removed. Case is kept. */
export function foldText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "");
}

export interface Token { readonly text: string; readonly start: number; readonly end: number }

/** Folded, lowercased tokens with their offsets in the original text. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    const end = start + match[0].length;
    for (const piece of foldText(match[0]).toLowerCase().matchAll(PIECE)) tokens.push({ text: piece[0], start, end });
  }
  return tokens;
}

// ---- Query parser ----------------------------------------------------------------------------------------------

const MAX_QUERY_LENGTH = 256;
const MAX_TERMS = 16;

/**
 * Parses words (AND), "quoted phrases", -excluded words or phrases and prefix* on the last word. A word that folds
 * into several tokens (e-mail) becomes a phrase. Everything else is ordinary text: no operator reaches a store.
 */
export function parseQuery(q: string): QueryTerm[] {
  if (q.length > MAX_QUERY_LENGTH) throw new SearchError("invalid-query", `Query is longer than ${MAX_QUERY_LENGTH} characters`);
  const raw: { text: string; quoted: boolean; exclude: boolean; star: boolean }[] = [];
  let i = 0;
  while (i < q.length) {
    while (i < q.length && /\s/u.test(q[i]!)) i++;
    if (i >= q.length) break;
    let exclude = false;
    if (q[i] === "-" && i + 1 < q.length && !/\s/u.test(q[i + 1]!)) { exclude = true; i++; }
    if (q[i] === '"') {
      const close = q.indexOf('"', i + 1);
      const end = close === -1 ? q.length : close;
      raw.push({ text: q.slice(i + 1, end), quoted: true, exclude, star: false });
      i = end + 1;
    } else {
      let j = i;
      while (j < q.length && !/\s/u.test(q[j]!) && q[j] !== '"') j++;
      const word = q.slice(i, j);
      raw.push({ text: word, quoted: false, exclude, star: /[\p{L}\p{N}\p{M}]\*+$/u.test(word) });
      i = j;
    }
  }
  const terms: QueryTerm[] = [];
  raw.forEach((item, index) => {
    const words = tokenize(item.text).map((token) => token.text);
    if (words.length === 0) return;
    if (words.length === 1) {
      const prefix = item.star && !item.exclude && index === raw.length - 1;
      terms.push({ kind: "word", word: words[0]!, prefix, exclude: item.exclude });
    } else {
      terms.push({ kind: "phrase", words, exclude: item.exclude });
    }
  });
  if (terms.length > MAX_TERMS) throw new SearchError("invalid-query", `At most ${MAX_TERMS} terms`);
  return terms;
}

// ---- Core ------------------------------------------------------------------------------------------------------

const ID = /^[\w.:@-]{1,128}$/;
const NAME = /^[A-Za-z_]\w{0,63}$/;
const MAX_LIMIT = 50;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Converts a store fragment (MARK_START/MARK_END around matches) into caller markers, escaping text unless raw. */
export function renderHighlight(fragment: string, options: HighlightOptions = {}): string {
  const pre = options.pre ?? "<mark>";
  const post = options.post ?? "</mark>";
  const escape = options.raw ? (text: string) => text : escapeHtml;
  let out = "";
  let open = false;
  for (const part of fragment.split(/([\u0002\u0003])/)) {
    if (part === MARK_START) { if (!open) { out += pre; open = true; } }
    else if (part === MARK_END) { if (open) { out += post; open = false; } }
    else out += escape(part);
  }
  return open ? out + post : out;
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  if (!/^[\w-]{1,700}$/.test(text)) throw new SearchError("invalid-cursor", "Malformed cursor");
  try {
    return atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw new SearchError("invalid-cursor", "Malformed cursor");
  }
}

function sortKey(sort: SortSpec): string {
  return sort.by === "relevance" ? "r" : `${sort.descending ? "-" : "+"}${sort.attr}`;
}

function encodeCursor(sort: SortSpec, position: SortPosition): string {
  return toBase64Url(JSON.stringify({ k: sortKey(sort), v: position.value, id: position.id }));
}

function decodeCursor(sort: SortSpec, cursor: string): SortPosition {
  let value: unknown;
  try {
    value = JSON.parse(fromBase64Url(cursor));
  } catch (error) {
    if (error instanceof SearchError) throw error;
    throw new SearchError("invalid-cursor", "Malformed cursor");
  }
  const item = value as { k?: unknown; v?: unknown; id?: unknown } | null;
  if (!item || typeof item !== "object" || item.k !== sortKey(sort) || typeof item.id !== "string" || !ID.test(item.id) ||
    !(item.v === null || (typeof item.v === "number" && Number.isFinite(item.v)))) {
    throw new SearchError("invalid-cursor", "Cursor does not belong to this sort order");
  }
  if (sort.by === "relevance" && item.v === null) throw new SearchError("invalid-cursor", "Malformed cursor");
  return { value: item.v as number | null, id: item.id };
}

function toDate(value: unknown, code: SearchErrorCode, name: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  throw new SearchError(code, `${name} must be a date (ISO string or epoch milliseconds)`);
}

function toNumber(value: unknown, code: SearchErrorCode, name: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim())) return Number(value);
  throw new SearchError(code, `${name} must be a finite number`);
}

function keywordValues(value: unknown, code: SearchErrorCode, name: string): string[] {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
  if (!list || list.length > 50 || !list.every((item) => typeof item === "string" && item.length > 0 && item.length <= 200)) {
    throw new SearchError(code, `${name} must be a non-empty string or up to 50 strings`);
  }
  return [...new Set(list as string[])];
}

export function createSearch(options: SearchOptions): Search {
  const { store, authorize } = options;
  const now = options.now ?? Date.now;
  const maxDocumentLength = options.maxDocumentLength ?? 100_000;
  const facetLimit = options.facetLimit ?? 20;
  const fieldNames = Object.keys(options.fields);
  if (fieldNames.length === 0 || fieldNames.length > 16) throw new RangeError("Declare between 1 and 16 text fields");
  for (const [name, weight] of Object.entries(options.fields)) {
    if (!NAME.test(name) || !["A", "B", "C", "D"].includes(weight)) throw new RangeError(`Invalid field ${name}`);
  }
  const filterTypes = options.filters ?? {};
  for (const [name, type] of Object.entries(filterTypes)) {
    if (!NAME.test(name) || !["keyword", "number", "date", "boolean"].includes(type)) throw new RangeError(`Invalid filter ${name}`);
  }
  if (!Number.isInteger(facetLimit) || facetLimit < 1 || facetLimit > 200) throw new RangeError("facetLimit must be 1 to 200");
  const schema: SearchSchema = { fields: { ...options.fields }, filters: { ...filterTypes } };
  const declared = (name: string): FilterType | undefined => (Object.hasOwn(filterTypes, name) ? filterTypes[name] : undefined);

  function tenant(tenantId: unknown): string {
    if (typeof tenantId !== "string" || !ID.test(tenantId)) throw new SearchError("invalid-tenant", "Invalid tenantId");
    return tenantId;
  }

  async function principalsFor(actor: Actor, action: SearchAction, tenantId: string): Promise<readonly string[]> {
    const access = await authorize(actor, action, tenantId);
    if (access === false) throw new SearchError("forbidden", "Not allowed");
    return access === true ? [] : access.filter((item) => typeof item === "string");
  }

  function normalizeAttrs(input: Readonly<Record<string, unknown>>): Record<string, StoredAttr> {
    const attrs: Record<string, StoredAttr> = {};
    for (const [name, value] of Object.entries(input)) {
      const type = declared(name);
      if (!type) throw new SearchError("invalid-attr", `Undeclared attribute ${name}`);
      if (value === null || value === undefined) continue;
      if (type === "keyword") attrs[name] = keywordValues(value, "invalid-attr", name);
      else if (type === "number") attrs[name] = toNumber(value, "invalid-attr", name);
      else if (type === "date") attrs[name] = toDate(value, "invalid-attr", name);
      else if (typeof value === "boolean") attrs[name] = value;
      else throw new SearchError("invalid-attr", `${name} must be a boolean`);
    }
    return attrs;
  }

  function normalizeFilters(input: Readonly<Record<string, FilterInput>>): AttrFilter[] {
    const entries = Object.entries(input);
    if (entries.length > 20) throw new SearchError("invalid-filter", "At most 20 filters");
    return entries.map(([attr, value]): AttrFilter => {
      const type = declared(attr);
      if (!type) throw new SearchError("invalid-filter", `Undeclared filter ${attr}`);
      if (type === "keyword") return { attr, kind: "keyword", values: keywordValues(value, "invalid-filter", attr) };
      if (type === "boolean") {
        if (typeof value === "boolean") return { attr, kind: "boolean", value };
        if (value === "true" || value === "false") return { attr, kind: "boolean", value: value === "true" };
        throw new SearchError("invalid-filter", `${attr} must be true or false`);
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new SearchError("invalid-filter", `${attr} needs a range {gte, gt, lte, lt}`);
      const convert = (item: unknown) => (type === "date" ? toDate(item, "invalid-filter", attr) : toNumber(item, "invalid-filter", attr));
      const range = value as Record<string, unknown>;
      const keys = Object.keys(range).filter((key) => range[key] !== undefined);
      if (keys.length === 0 || keys.some((key) => !["gte", "gt", "lte", "lt"].includes(key))) {
        throw new SearchError("invalid-filter", `${attr} needs a range {gte, gt, lte, lt}`);
      }
      const bounds: Record<string, number> = {};
      for (const key of keys) bounds[key] = convert(range[key]);
      return { attr, kind: "range", ...bounds };
    });
  }

  function parseSort(sort: string | undefined): SortSpec {
    if (sort === undefined || sort === "" || sort === "relevance") return { by: "relevance" };
    const descending = sort.startsWith("-");
    const attr = descending ? sort.slice(1) : sort;
    const type = declared(attr);
    if (type !== "number" && type !== "date") throw new SearchError("invalid-sort", "Sort by relevance or a number or date attribute");
    return { by: "attr", attr, descending };
  }

  return {
    schema,

    async index(actor, input) {
      if (!input || typeof input !== "object") throw new SearchError("bad-request", "Expected a document");
      const tenantId = tenant(input.tenantId);
      if (typeof input.id !== "string" || !ID.test(input.id)) throw new SearchError("invalid-id", "Invalid id");
      if (!input.fields || typeof input.fields !== "object") throw new SearchError("invalid-field", "fields must be an object");
      const fields: Record<string, string> = {};
      let length = 0;
      for (const [name, value] of Object.entries(input.fields)) {
        if (!Object.hasOwn(schema.fields, name)) throw new SearchError("invalid-field", `Undeclared field ${name}`);
        if (value === null || value === undefined) continue;
        if (typeof value !== "string") throw new SearchError("invalid-field", `${name} must be text`);
        fields[name] = value.replace(CONTROL, " ");
        length += value.length;
      }
      if (length > maxDocumentLength) throw new SearchError("invalid-field", `Document text is longer than ${maxDocumentLength} characters`);
      const attrs = normalizeAttrs(input.attrs && typeof input.attrs === "object" ? input.attrs : {});
      const visibility = input.visibility ?? [];
      if (!Array.isArray(visibility) || visibility.length > 64 ||
        !visibility.every((item) => typeof item === "string" && item.length > 0 && item.length <= 128)) {
        throw new SearchError("invalid-visibility", "visibility must be up to 64 principal strings");
      }
      await principalsFor(actor, "index", tenantId);
      const updatedAt = now();
      await store.upsert({ tenantId, id: input.id, fields, attrs, visibility: [...new Set(visibility)], updatedAt }, schema);
      return { id: input.id, updatedAt };
    },

    async remove(actor, tenantIdInput, id) {
      const tenantId = tenant(tenantIdInput);
      if (typeof id !== "string" || !ID.test(id)) throw new SearchError("invalid-id", "Invalid id");
      await principalsFor(actor, "index", tenantId);
      if (!(await store.remove(tenantId, id))) throw new SearchError("not-found", "Document not found");
    },

    async query(actor, input) {
      if (!input || typeof input !== "object") throw new SearchError("bad-request", "Expected a query");
      const tenantId = tenant(input.tenantId);
      const q = input.q ?? "";
      if (typeof q !== "string") throw new SearchError("invalid-query", "q must be text");
      const terms = parseQuery(q);
      const filters = normalizeFilters(input.filters ?? {});
      const sort = parseSort(input.sort);
      const after = input.cursor ? decodeCursor(sort, input.cursor) : null;
      const limit = input.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new SearchError("invalid-limit", `limit must be 1 to ${MAX_LIMIT}`);
      const facets = [...new Set(input.facets ?? [])];
      if (facets.length > 10) throw new SearchError("invalid-facet", "At most 10 facets");
      for (const facet of facets) {
        const type = declared(facet);
        if (type !== "keyword" && type !== "boolean") throw new SearchError("invalid-facet", `${facet} is not a keyword or boolean attribute`);
      }
      const highlight = input.highlight ?? {};
      if ((highlight.pre !== undefined && (typeof highlight.pre !== "string" || highlight.pre.length > 64)) ||
        (highlight.post !== undefined && (typeof highlight.post !== "string" || highlight.post.length > 64))) {
        throw new SearchError("invalid-highlight", "Highlight markers must be strings of up to 64 characters");
      }
      const principals = await principalsFor(actor, "search", tenantId);
      // Text that holds no searchable token (only punctuation) matches nothing rather than everything.
      if (q.trim() !== "" && terms.length === 0) {
        return { hits: [], total: 0, cursor: null, facets: Object.fromEntries(facets.map((facet) => [facet, []])) };
      }
      const result = await store.search({ schema, tenantId, principals, terms, filters, sort, after, limit: limit + 1, facets, facetLimit });
      const page = result.hits.slice(0, limit);
      const last = page[page.length - 1];
      return {
        hits: page.map((hit) => ({
          id: hit.id, score: hit.score,
          highlights: Object.fromEntries(Object.entries(hit.highlights).map(([field, text]) => [field, renderHighlight(text, highlight)])),
        })),
        facets: result.facets,
        total: result.total,
        cursor: result.hits.length > limit && last ? encodeCursor(sort, { value: last.sortValue, id: last.id }) : null,
      };
    },
  };
}
