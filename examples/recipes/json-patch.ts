// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: JSON Pointer (RFC 6901), JSON Patch (RFC 6902), JSON Merge Patch (RFC 7396), a deterministic patch
// generator and canonical JSON. Original source; copy and adapt. Values are what JSON.parse returns. Equality is deep,
// numeric for numbers (1 equals 1.0), never treats booleans as numbers and ignores key order. applyPatch is atomic and
// returns a new document. Members are set with defineProperty, so "__proto__" stays an ordinary member. canonical()
// sorts keys by code point and prints whole numbers without a decimal point, other numbers in JavaScript's shortest
// round-trip form; non-finite numbers throw. Failures throw JsonPatchError.

export type Json = null | boolean | number | string | Json[] | JsonObject;
export type JsonObject = { [key: string]: Json };
export type PatchOperation = { op: string; path: string; value?: Json; from?: string };
export class JsonPatchError extends Error { override name = "JsonPatchError"; }

const isObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const put = (o: JsonObject, k: string, v: Json): void => void Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
const isPrefix = (p: string[], q: string[]): boolean => p.length <= q.length && p.every((t, i) => t === q[i]);
function clone(v: Json): Json {
  if (Array.isArray(v)) return v.map(clone);
  const out: JsonObject = {};
  if (!isObject(v)) return v;
  for (const k of Object.keys(v)) put(out, k, clone(v[k] ?? null));
  return out;
}
/** Orders strings by Unicode code point (not UTF-16 code unit). */
export function compareCodePoints(x: string, y: string): number {
  const a = Array.from(x, (c) => c.codePointAt(0) ?? 0), b = Array.from(y, (c) => c.codePointAt(0) ?? 0);
  for (let i = 0; i < a.length && i < b.length; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  return a.length - b.length;
}
/** Deep JSON equality: 1 equals 1.0, true never equals 1, key order is ignored. */
export function jsonEqual(a: Json, b: Json): boolean {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => jsonEqual(x, b[i] ?? null));
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => has(b, k) && jsonEqual(a[k] ?? null, b[k] ?? null));
  }
  return a === b;
}
function parsePointer(pointer: unknown): string[] {
  if (typeof pointer !== "string") throw new JsonPatchError("pointer must be a string");
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new JsonPatchError('pointer must be empty or start with "/"');
  return pointer.slice(1).split("/").map((t) => {
    if (/~(?![01])/.test(t)) throw new JsonPatchError(`bad escape in pointer token "${t}"`);
    return t.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}
const escapeToken = (t: string): string => t.replace(/~/g, "~0").replace(/\//g, "~1");
function index(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === "-") return length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new JsonPatchError(`bad array index "${token}"`);
  const i = Number(token);
  if (i > length || (i === length && !allowEnd)) throw new JsonPatchError(`array index ${token} out of range`);
  return i;
}
function get(doc: Json, tokens: string[]): Json {
  let cur = doc;
  for (const t of tokens) {
    if (isObject(cur)) { if (!has(cur, t)) throw new JsonPatchError(`no member "${t}"`); cur = cur[t] ?? null; }
    else if (Array.isArray(cur)) cur = cur[index(t, cur.length, false)] ?? null;
    else throw new JsonPatchError("cannot index a scalar");
  }
  return cur;
}
/** The value at an RFC 6901 pointer ("" is the whole document). */
export const getPointer = (doc: Json, pointer: string): Json => get(doc, parsePointer(pointer));
function add(doc: Json, tokens: string[], value: Json): Json {
  const last = tokens[tokens.length - 1];
  if (last === undefined) return value;
  const parent = get(doc, tokens.slice(0, -1));
  if (isObject(parent)) put(parent, last, value);
  else if (Array.isArray(parent)) parent.splice(index(last, parent.length, true), 0, value);
  else throw new JsonPatchError("cannot add to a scalar");
  return doc;
}
function remove(doc: Json, tokens: string[]): Json {
  const last = tokens[tokens.length - 1];
  if (last === undefined) throw new JsonPatchError("cannot remove the root");
  const parent = get(doc, tokens.slice(0, -1));
  if (isObject(parent)) {
    if (!has(parent, last)) throw new JsonPatchError(`no member "${last}"`);
    const value = parent[last] ?? null; delete parent[last]; return value;
  }
  if (Array.isArray(parent)) return parent.splice(index(last, parent.length, false), 1)[0] ?? null;
  throw new JsonPatchError("cannot remove from a scalar");
}
/** Applies an RFC 6902 patch atomically; returns a new document and never changes doc. */
export function applyPatch(doc: Json, patch: unknown): Json {
  if (!Array.isArray(patch)) throw new JsonPatchError("patch must be an array");
  let out = clone(doc);
  for (const op of patch as unknown[]) {
    if (!isObject(op) || typeof op.op !== "string") throw new JsonPatchError('operation must be an object with a string "op"');
    if (!has(op, "path")) throw new JsonPatchError('operation needs "path"');
    const kind = op.op, path = parsePointer(op.path), value = op.value ?? null;
    if ((kind === "add" || kind === "replace" || kind === "test") && !has(op, "value")) throw new JsonPatchError(`${kind} needs "value"`);
    if ((kind === "move" || kind === "copy") && !has(op, "from")) throw new JsonPatchError(`${kind} needs "from"`);
    if (kind === "add") out = add(out, path, clone(value));
    else if (kind === "remove") remove(out, path);
    else if (kind === "replace") {
      get(out, path);
      if (path.length === 0) out = clone(value);
      else { remove(out, path); out = add(out, path, clone(value)); }
    } else if (kind === "move") {
      const from = parsePointer(op.from);
      if (isPrefix(from, path) && from.length === path.length) { get(out, from); continue; }
      if (isPrefix(from, path)) throw new JsonPatchError("cannot move a value into itself");
      out = add(out, path, remove(out, from));
    } else if (kind === "copy") out = add(out, path, clone(get(out, parsePointer(op.from))));
    else if (kind === "test") { if (!jsonEqual(get(out, path), value)) throw new JsonPatchError(`test failed at "${String(op.path)}"`); }
    else throw new JsonPatchError(`unknown op "${kind}"`);
  }
  return out;
}
/** RFC 7396 merge patch; returns a new value. */
export function mergePatch(target: Json, patch: Json): Json {
  if (!isObject(patch)) return clone(patch);
  const out: JsonObject = isObject(target) ? (clone(target) as JsonObject) : {};
  for (const k of Object.keys(patch)) {
    const v = patch[k] ?? null; if (v === null) delete out[k];
    else put(out, k, mergePatch(has(out, k) ? (out[k] ?? null) : null, v));
  }
  return out;
}
/** Deterministic RFC 6902 patch turning a into b: keys in code point order, arrays by index, no moves. */
export function createPatch(a: Json, b: Json, path = ""): PatchOperation[] {
  if (jsonEqual(a, b)) return [];
  const ops: PatchOperation[] = [];
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareCodePoints);
    for (const k of keys) {
      const p = `${path}/${escapeToken(k)}`;
      if (!has(b, k)) ops.push({ op: "remove", path: p });
      else if (!has(a, k)) ops.push({ op: "add", path: p, value: clone(b[k] ?? null) });
      else ops.push(...createPatch(a[k] ?? null, b[k] ?? null, p));
    }
  } else if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) ops.push(...createPatch(a[i] ?? null, b[i] ?? null, `${path}/${i}`));
    for (let i = a.length - 1; i >= b.length; i--) ops.push({ op: "remove", path: `${path}/${i}` });
    for (let i = a.length; i < b.length; i++) ops.push({ op: "add", path: `${path}/${i}`, value: clone(b[i] ?? null) });
  } else ops.push({ op: "replace", path, value: clone(b) });
  return ops;
}
const ESCAPES: Record<string, string> = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const quote = (s: string): string =>
  `"${s.replace(/["\\\u0000-\u001f]/g, (c) => ESCAPES[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
/** Compact JSON with object keys in code point order; whole numbers print without a decimal point. */
export function canonical(v: unknown): string {
  if (v === null || typeof v === "boolean") return String(v);
  if (typeof v === "string") return quote(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new JsonPatchError("JSON numbers must be finite");
    return Number.isInteger(v) && Math.abs(v) >= 1e21 ? BigInt(v).toString() : String(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObject(v)) return `{${Object.keys(v).sort(compareCodePoints).map((k) => `${quote(k)}:${canonical(v[k])}`).join(",")}}`;
  throw new JsonPatchError(`not a JSON value: ${typeof v}`);
}
