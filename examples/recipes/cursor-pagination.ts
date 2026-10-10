// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: opaque base64url keyset cursors. Original source; copy and adapt.
// Cursors are opaque, not secret or tamper-proof: anyone can decode them. Re-check
// authorization on every page, and sign the cursor (HMAC) if its contents must be trusted.

export type CursorKey = readonly [sortValue: string | number, id: string | number];
export interface PageRequest { limit?: number; cursor?: string | null }
export interface Page<T> { items: T[]; nextCursor: string | null; hasMore: boolean }

const MAX_CURSOR_CHARS = 1024;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error("Invalid cursor encoding");
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeCursor(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Decodes and validates a cursor with a type guard; throws a client-safe error on anything else. */
export function decodeCursor<T>(cursor: string, guard: (value: unknown) => value is T): T {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_CHARS) throw new Error("Invalid cursor");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(cursor))); } catch { throw new Error("Invalid cursor"); }
  if (!guard(value)) throw new Error("Invalid cursor");
  return value;
}

export function isCursorKey(value: unknown): value is CursorKey {
  return Array.isArray(value) && value.length === 2
    && (typeof value[0] === "string" || (typeof value[0] === "number" && Number.isFinite(value[0])))
    && (typeof value[1] === "string" || (typeof value[1] === "number" && Number.isFinite(value[1])));
}

export function clampLimit(limit: number | undefined, fallback = 20, max = 100): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  return Math.min(limit, max);
}

function compareKeys(a: CursorKey, b: CursorKey): number {
  for (let i = 0; i < 2; i++) {
    const x = a[i] as string | number;
    const y = b[i] as string | number;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Keyset pagination over items already sorted ascending by `keyOf` (sort value, then unique id).
 * The SQL equivalent is `WHERE (sort, id) > ($1, $2) ORDER BY sort, id LIMIT $limit + 1`.
 */
export function paginate<T>(sorted: readonly T[], keyOf: (item: T) => CursorKey, request: PageRequest = {}): Page<T> {
  const limit = clampLimit(request.limit);
  const after = request.cursor ? decodeCursor(request.cursor, isCursorKey) : null;
  const start = after ? sorted.findIndex((item) => compareKeys(keyOf(item), after) > 0) : 0;
  const window = start < 0 ? [] : sorted.slice(start, start + limit + 1);
  const hasMore = window.length > limit;
  const items = window.slice(0, limit);
  const last = items[items.length - 1];
  return { items, hasMore, nextCursor: hasMore && last !== undefined ? encodeCursor(keyOf(last)) : null };
}
