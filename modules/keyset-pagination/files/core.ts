// SPDX-License-Identifier: Apache-2.0
// Keyset (seek) pagination with signed, scope-bound cursors, framework- and database-neutral.
// The application declares named sorts (one or more columns, any ASC/DESC mix, ending in a unique tie-breaker) and
// a source that returns rows strictly after a key tuple in a given order. The pager fetches limit + 1 rows, so it
// knows whether another page exists, and issues opaque next/prev cursors:
//   cursor = <keyId> "." base64url(JSON body) "." base64url(HMAC-SHA256(secret, "<keyId>.<body>"))
// The body holds the boundary row's sort values, the direction, the sort name, an expiry and a keyed fingerprint of
// the scope (tenant/user), filters and sort definition. A cursor replayed under another scope, other filters or
// another sort fails with scope-mismatch. Values stay readable after base64url decoding: never sort by a secret.
// Uses Web Crypto (crypto.subtle); HMAC verify compares in constant time.

export type CursorValue = string | number;
export type FilterScalar = string | number | boolean | null;
export type FilterValue = FilterScalar | readonly FilterScalar[];
/** Who is asking, from trusted server context (session, API key): for example { tenantId, userId }. */
export type Scope = Readonly<Record<string, string | number>>;
export type Filters = Readonly<Record<string, FilterValue>>;

export interface SortField {
  /** Property read from each item (and the default SQL column). */
  readonly key: string;
  readonly direction: "asc" | "desc";
  /**
   * "number": finite numbers (integer ids, scores). "string": compared by Unicode code point, like COLLATE "C".
   * "timestamp": a PostgreSQL timestamptz kept exact to the microsecond as "YYYY-MM-DDTHH:MM:SS.ffffffZ" (UTC);
   * the SQL source reads and binds it as that text, so sub-millisecond differences never skip or reorder rows.
   */
  readonly type: "string" | "number" | "timestamp";
  /** SQL column when it differs from `key`. Lowercase identifier, optionally `table.column`. */
  readonly column?: string;
  /** Must be true on the last field (the tie-breaker, usually the primary key) and only there. */
  readonly unique?: boolean;
}

/** A sort field in the effective scan order (directions flipped for a backward page). */
export type OrderField = SortField;

export interface KeysetFetch {
  readonly scope: Scope;
  readonly filters: Filters;
  readonly sortName: string;
  /** Effective order to return rows in. */
  readonly order: readonly OrderField[];
  /** Return only rows strictly after this key tuple in `order`; null for the first page. */
  readonly after: readonly CursorValue[] | null;
  /** Return at most this many rows (the pager asks for its limit + 1). */
  readonly limit: number;
}

export interface KeyedRow<T> { readonly item: T; readonly keys: readonly unknown[] }

export interface KeysetSource<T> {
  fetch(query: KeysetFetch): Promise<readonly T[]>;
  /**
   * Optional: rows with their sort keys read straight from the database (one per `query.order` field), used instead
   * of getValue. The SQL source implements it so timestamp keys keep full precision.
   */
  fetchWithKeys?(query: KeysetFetch): Promise<readonly KeyedRow<T>[]>;
}

export interface CursorKey {
  /** 1 to 32 characters: letters, digits, "_" or "-". Travels in the cursor so retired keys can still verify. */
  readonly id: string;
  /** At least 32 random bytes. */
  readonly secret: Uint8Array;
}

export interface KeysetPagerOptions<T> {
  /** Signing keys; the first signs new cursors, every listed key verifies. Rotate by prepending a new key. */
  readonly keys: readonly CursorKey[];
  readonly sorts: Readonly<Record<string, readonly SortField[]>>;
  readonly defaultSort: string;
  readonly source: KeysetSource<T>;
  /** Reads a sort value from an item. Default: item[key]. */
  readonly getValue?: (item: T, key: string) => unknown;
  /** Default 20. */
  readonly defaultLimit?: number;
  /** Requests above this are clamped to it. Default 100. */
  readonly maxLimit?: number;
  /** Cursor lifetime. Default 24 hours. */
  readonly ttlMs?: number;
  readonly now?: () => number;
  /**
   * Verify that the source returned rows strictly after the cursor and in order (default true). The check compares
   * strings by UTF-16 code unit; set false when a text sort column uses a database collation that orders otherwise
   * (or give the column COLLATE "C").
   */
  readonly checkOrder?: boolean;
}

export interface PageRequest {
  readonly scope: Scope;
  readonly filters?: Filters;
  /** Sort name; when omitted, the cursor's sort or `defaultSort`. */
  readonly sort?: string;
  /** Number or decimal string; absent means `defaultLimit`. */
  readonly limit?: unknown;
  readonly cursor?: unknown;
}

export interface Page<T> {
  readonly items: T[];
  /** Null when this is the last page. */
  readonly nextCursor: string | null;
  /** Null when this is the first page. */
  readonly prevCursor: string | null;
  /** The page size actually used after clamping. */
  readonly limit: number;
  readonly sort: string;
}

export interface CursorInfo {
  readonly keyId: string;
  readonly direction: "next" | "prev";
  readonly sort: string;
  readonly values: readonly CursorValue[];
  readonly expiresAt: number;
}

export interface KeysetPager<T> {
  page(request: PageRequest): Promise<Page<T>>;
  parseLimit(value: unknown): number;
  /** Verifies signature and expiry (not scope) and returns the cursor contents, for logging and tests. */
  inspectCursor(cursor: string): Promise<CursorInfo>;
  readonly sortNames: readonly string[];
}

export type KeysetErrorCode =
  | "malformed-cursor" | "invalid-signature" | "expired-cursor" | "scope-mismatch"
  | "invalid-limit" | "invalid-sort" | "invalid-filter";

export class KeysetError extends Error {
  readonly code: KeysetErrorCode;
  constructor(code: KeysetErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "KeysetError";
  }
}

/** Longest cursor issued or accepted; a page whose boundary values would exceed it fails at encode. */
export const MAX_CURSOR_LENGTH = 4096;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const MAX_FIELDS = 8;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
export const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}(\.[a-z_][a-z0-9_]{0,62})?$/;
const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  return s;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  // Reject non-canonical spellings so one cursor has exactly one valid text form.
  return toBase64Url(bytes) === text ? bytes : null;
}

const own = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

/** JSON with object keys sorted recursively, so equal scopes and filters always produce equal bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
}

// Surrogate code units (U+D800-DFFF encode code points above U+FFFF) sort after U+E000-FFFF in code-point order.
const rank = (unit: number): number => (unit < 0xd800 ? unit : unit < 0xe000 ? unit + 0x2000 : unit - 0x800);

/** Compares strings by Unicode code point (the order of UTF-8 bytes and of PostgreSQL COLLATE "C"). */
export function compareCodePoints(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return rank(x) < rank(y) ? -1 : 1;
  }
  return a.length - b.length < 0 ? -1 : a.length === b.length ? 0 : 1;
}

/** Compares two key tuples under `order`: negative when `a` comes first. */
export function compareKeys(a: readonly CursorValue[], b: readonly CursorValue[], order: readonly OrderField[]): number {
  for (let i = 0; i < order.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) throw new TypeError("compareKeys: tuple shorter than the order");
    const c = typeof x === "string" && typeof y === "string" ? compareCodePoints(x, y) : x < y ? -1 : x > y ? 1 : 0;
    if (c !== 0) return order[i]?.direction === "desc" ? -c : c;
  }
  return 0;
}

/** RFC 8288 Link header value for the given relations; null when there are none. */
export function formatLinkHeader(links: Readonly<Record<string, string | null | undefined>>): string | null {
  const parts: string[] = [];
  for (const [rel, url] of Object.entries(links)) {
    if (!url) continue;
    if (/[<>\s"]/.test(url) || !/^[a-z][a-z0-9.-]*$/.test(rel)) throw new RangeError("Link target or relation contains forbidden characters");
    parts.push(`<${url}>; rel="${rel}"`);
  }
  return parts.length ? parts.join(", ") : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function validateSorts(sorts: Readonly<Record<string, readonly SortField[]>>, defaultSort: string): void {
  const names = Object.keys(sorts);
  if (names.length === 0) throw new RangeError("sorts must declare at least one sort");
  for (const name of names) {
    if (!FIELD_KEY.test(name)) throw new RangeError(`Invalid sort name: ${name}`);
    const fields = sorts[name];
    if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS) throw new RangeError(`Sort ${name} must list 1 to ${MAX_FIELDS} fields`);
    const seen = new Set<string>();
    fields.forEach((field: SortField, index: number) => {
      if (!FIELD_KEY.test(field.key) || seen.has(field.key)) throw new RangeError(`Sort ${name}: invalid or repeated key ${field.key}`);
      seen.add(field.key);
      if (field.direction !== "asc" && field.direction !== "desc") throw new RangeError(`Sort ${name}: direction must be asc or desc`);
      if (field.type !== "string" && field.type !== "number" && field.type !== "timestamp") throw new RangeError(`Sort ${name}: type must be string, number or timestamp`);
      if (field.column !== undefined && !SQL_IDENTIFIER.test(field.column)) throw new RangeError(`Sort ${name}: invalid column ${field.column}`);
      const last = index === fields.length - 1;
      if (last !== (field.unique === true)) throw new RangeError(`Sort ${name}: the last field, and only the last, must be unique (the tie-breaker)`);
    });
  }
  if (!own(sorts, defaultSort)) throw new RangeError("defaultSort must name a declared sort");
}

function checkScope(scope: unknown): Scope {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) throw new TypeError("scope must be an object from trusted server context");
  for (const [key, value] of Object.entries(scope)) {
    const ok = typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
    if (!ok || !FIELD_KEY.test(key)) throw new TypeError(`scope.${key} must be a string or finite number`);
  }
  return scope as Scope;
}

function checkFilters(filters: unknown): Filters {
  if (filters === undefined) return {};
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw new KeysetError("invalid-filter", "filters must be an object");
  const scalar = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
  for (const [key, value] of Object.entries(filters)) {
    const ok = FIELD_KEY.test(key) && (scalar(value) || (Array.isArray(value) && value.length <= 100 && value.every(scalar)));
    if (!ok) throw new KeysetError("invalid-filter", `Invalid filter ${key}`);
  }
  return filters as Filters;
}

function flip(fields: readonly SortField[]): OrderField[] {
  return fields.map((field) => ({ ...field, direction: field.direction === "asc" ? "desc" : "asc" }));
}

function readKey(value: unknown, field: SortField): CursorValue {
  if (field.type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint" && Number.isSafeInteger(Number(value))) return Number(value);
    if (typeof value === "string" && /^-?\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  } else if (field.type === "timestamp") {
    if (typeof value === "string" && TIMESTAMP.test(value)) return value;
  } else if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    throw new TypeError(`Sort value for ${field.key} is a Date (millisecond precision); declare the field type "timestamp" for timestamptz columns`);
  }
  throw new TypeError(`Sort value for ${field.key} must be a non-null ${field.type}${field.type === "timestamp" ? ' as "YYYY-MM-DDTHH:MM:SS.ffffffZ"' : ""}; sort columns must be NOT NULL`);
}

interface CursorBody { v: 1; d: "n" | "p"; s: string; k: CursorValue[]; e: number; f: string }

export function createKeysetPager<T>(options: KeysetPagerOptions<T>): KeysetPager<T> {
  const { sorts, defaultSort, source } = options;
  if (!Array.isArray(options.keys) || options.keys.length === 0) throw new RangeError("keys must list at least one signing key");
  const keyIds = new Set<string>();
  for (const key of options.keys) {
    if (!KEY_ID.test(key.id) || keyIds.has(key.id)) throw new RangeError(`Invalid or repeated key id: ${key.id}`);
    if (!(key.secret instanceof Uint8Array) || key.secret.length < 32) throw new RangeError("Each key secret must be at least 32 bytes");
    keyIds.add(key.id);
  }
  validateSorts(sorts, defaultSort);
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  if (!Number.isSafeInteger(maxLimit) || maxLimit < 1 || maxLimit > 10_000) throw new RangeError("maxLimit must be an integer from 1 to 10000");
  if (!Number.isSafeInteger(defaultLimit) || defaultLimit < 1 || defaultLimit > maxLimit) throw new RangeError("defaultLimit must be from 1 to maxLimit");
  const ttlMs = options.ttlMs ?? 24 * 3_600_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000) throw new RangeError("ttlMs must be at least 1000");
  const now = options.now ?? Date.now;
  const getValue = options.getValue ?? ((item: T, key: string) => (item as Record<string, unknown>)[key]);
  const signingKey = options.keys[0] as CursorKey;
  const cryptoKeys = new Map<string, Promise<CryptoKey>>();
  const keyFor = (id: string): Promise<CryptoKey> | null => {
    const key = options.keys.find((candidate) => candidate.id === id);
    if (!key) return null;
    let promise = cryptoKeys.get(id);
    if (!promise) {
      promise = subtle().importKey("raw", new Uint8Array(key.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
      cryptoKeys.set(id, promise);
    }
    return promise;
  };
  const encoder = new TextEncoder();
  const sign = async (keyId: string, data: string): Promise<Uint8Array> =>
    new Uint8Array(await subtle().sign("HMAC", await (keyFor(keyId) as Promise<CryptoKey>), encoder.encode(data)));

  async function fingerprint(keyId: string, scope: Scope, filters: Filters, sortName: string): Promise<string> {
    const spec = (sorts[sortName] ?? []).map((f) => [f.key, f.direction, f.type, f.column ?? f.key]);
    const mac = await sign(keyId, `keyset-scope-v1\n${canonicalJson({ scope, filters, sort: sortName, spec })}`);
    return toBase64Url(mac.subarray(0, 16));
  }

  async function encode(direction: "n" | "p", sortName: string, values: CursorValue[], scope: Scope, filters: Filters): Promise<string> {
    const body: CursorBody = {
      v: 1, d: direction, s: sortName, k: values, e: now() + ttlMs,
      f: await fingerprint(signingKey.id, scope, filters, sortName),
    };
    const payload = toBase64Url(encoder.encode(JSON.stringify(body)));
    const mac = await sign(signingKey.id, `${signingKey.id}.${payload}`);
    const cursor = `${signingKey.id}.${payload}.${toBase64Url(mac)}`;
    if (cursor.length > MAX_CURSOR_LENGTH) {
      throw new RangeError(`Cursor would be ${cursor.length} characters, too long (limit ${MAX_CURSOR_LENGTH}); sort by shorter values`);
    }
    return cursor;
  }

  async function decode(cursor: unknown): Promise<{ keyId: string; body: CursorBody }> {
    if (typeof cursor !== "string" || cursor.length > MAX_CURSOR_LENGTH) throw new KeysetError("malformed-cursor", "Cursor is malformed");
    const parts = cursor.split(".");
    const [keyId, payload, macText] = parts;
    if (parts.length !== 3 || keyId === undefined || payload === undefined || macText === undefined || !KEY_ID.test(keyId)) {
      throw new KeysetError("malformed-cursor", "Cursor is malformed");
    }
    const bodyBytes = fromBase64Url(payload);
    const mac = fromBase64Url(macText);
    if (!bodyBytes || !mac) throw new KeysetError("malformed-cursor", "Cursor is malformed");
    const key = keyFor(keyId);
    if (!key || !(await subtle().verify("HMAC", await key, mac, encoder.encode(`${keyId}.${payload}`)))) {
      throw new KeysetError("invalid-signature", "Cursor signature is invalid");
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes));
    } catch {
      throw new KeysetError("malformed-cursor", "Cursor is malformed");
    }
    const b = body as Partial<CursorBody> | null;
    const valid = !!b && typeof b === "object" && b.v === 1 && (b.d === "n" || b.d === "p") && typeof b.s === "string" &&
      Array.isArray(b.k) && b.k.length > 0 && b.k.length <= MAX_FIELDS && b.k.every((v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) &&
      Number.isSafeInteger(b.e) && typeof b.f === "string";
    if (!valid) throw new KeysetError("malformed-cursor", "Cursor is malformed");
    const checked = b as CursorBody;
    if (now() >= checked.e) throw new KeysetError("expired-cursor", "Cursor has expired");
    return { keyId, body: checked };
  }

  function parseLimit(value: unknown): number {
    if (value === undefined || value === "") return defaultLimit;
    let n: number;
    if (typeof value === "number") n = value;
    else if (typeof value === "string" && /^\d{1,30}$/.test(value)) n = Number(value);
    else throw new KeysetError("invalid-limit", "limit must be a positive integer");
    if (!Number.isInteger(n) || n < 1) throw new KeysetError("invalid-limit", "limit must be a positive integer");
    return Math.min(n, maxLimit);
  }

  function keysOf(item: T, fields: readonly SortField[]): CursorValue[] {
    return fields.map((field) => readKey(getValue(item, field.key), field));
  }

  async function page(request: PageRequest): Promise<Page<T>> {
    const scope = checkScope(request.scope);
    const filters = checkFilters(request.filters);
    const limit = parseLimit(request.limit);
    if (request.sort !== undefined && (typeof request.sort !== "string" || !own(sorts, request.sort))) {
      throw new KeysetError("invalid-sort", "Unknown sort");
    }
    let decoded: CursorBody | null = null;
    if (request.cursor !== undefined) {
      const { keyId, body } = await decode(request.cursor);
      const sortName = request.sort ?? body.s;
      const fields = own(sorts, body.s) ? sorts[body.s] : undefined;
      const expected = await fingerprint(keyId, scope, filters, sortName);
      if (sortName !== body.s || !fields || !constantTimeEqual(expected, body.f)) {
        throw new KeysetError("scope-mismatch", "Cursor belongs to a different scope, filter or sort");
      }
      const fits = (v: CursorValue, field: SortField | undefined): boolean =>
        field?.type === "timestamp" ? typeof v === "string" && TIMESTAMP.test(v) : typeof v === field?.type;
      if (body.k.length !== fields.length || body.k.some((v, i) => !fits(v, fields[i]))) {
        throw new KeysetError("malformed-cursor", "Cursor does not match the sort");
      }
      decoded = body;
    }
    const sortName = decoded?.s ?? request.sort ?? defaultSort;
    const fields = sorts[sortName] as readonly SortField[];
    const forward = decoded === null || decoded.d === "n";
    const order = forward ? fields : flip(fields);
    const after = decoded?.k ?? null;
    const query: KeysetFetch = { scope, filters, sortName, order, after, limit: limit + 1 };
    const keyed: { item: T; keys: CursorValue[] }[] = source.fetchWithKeys
      ? (await source.fetchWithKeys(query)).map((row) => ({ item: row.item, keys: fields.map((field, i) => readKey(row.keys[i], field)) }))
      : (await source.fetch(query)).map((item) => ({ item, keys: keysOf(item, fields) }));
    // Guard exactly-once: a source must return rows strictly after the cursor, in strictly increasing order.
    let previous = after;
    if (options.checkOrder !== false) for (const row of keyed) {
      if (previous && compareKeys(previous, row.keys, order) >= 0) throw new Error("KeysetSource returned rows out of order or not after the cursor");
      previous = row.keys;
    }
    const more = keyed.length > limit;
    const slice = keyed.slice(0, limit);
    const rows = forward ? slice : slice.reverse();
    const items = rows.map((row) => row.item);
    const hasNext = forward ? more : decoded !== null;
    const hasPrev = forward ? decoded !== null : more;
    const first = rows[0];
    const last = rows[rows.length - 1];
    return {
      items, limit, sort: sortName,
      nextCursor: hasNext && last !== undefined ? await encode("n", sortName, last.keys, scope, filters) : null,
      prevCursor: hasPrev && first !== undefined ? await encode("p", sortName, first.keys, scope, filters) : null,
    };
  }

  async function inspectCursor(cursor: string): Promise<CursorInfo> {
    const { keyId, body } = await decode(cursor);
    return { keyId, direction: body.d === "n" ? "next" : "prev", sort: body.s, values: body.k, expiresAt: body.e };
  }

  return { page, parseLimit, inspectCursor, sortNames: Object.keys(sorts) };
}
