// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: dotted paths into JSON data, e.g. "user.addresses[0].city" or 'a["x.y"]'. Original source.
// Values are what JSON.parse returns. Names are separated by "." and run until "." or "["; "[n]" (no leading zeros
// except 0) is an array index; '["..."]' is a key with \" and \\ escapes (for keys containing dots); "" is the root.
// getPath returns the fallback for a missing key, an out-of-range index, an index on a non-array or a key on a
// non-object (own properties only, so "__proto__" is an ordinary key). setPath and deletePath return NEW values
// and never mutate the input: setPath creates objects for a following key and arrays for a following index,
// appends when index === length and throws PathError (a RangeError) for index > length or a scalar in the way.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart dotted-path modules.

export type Json = null | boolean | number | string | Json[] | JsonObject;
export type JsonObject = { [key: string]: Json };
export type PathKey = string | number;
export class PathError extends RangeError { override name = "PathError"; }

const isObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const put = (o: JsonObject, k: string, v: Json): void => void Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
function clone(v: Json): Json {
  if (Array.isArray(v)) return v.map(clone);
  if (!isObject(v)) return v;
  const out: JsonObject = {};
  for (const k of Object.keys(v)) put(out, k, clone(v[k] ?? null));
  return out;
}

/** Splits a path into keys (strings) and array indexes (numbers); "" is the root ([]). */
export function parsePath(path: string): PathKey[] {
  const out: PathKey[] = [];
  const n = path.length;
  let i = 0;
  while (i < n) {
    if (path[i] === "[") {
      if (path[i + 1] === '"') {
        let j = i + 2, buf = "";
        for (;;) {
          if (j >= n) throw new PathError("unterminated quoted key");
          if (path[j] === "\\" && j + 1 < n) { buf += path[j + 1]; j += 2; continue; }
          if (path[j] === '"') break;
          buf += path[j++];
        }
        if (path[j + 1] !== "]") throw new PathError("expected ]");
        out.push(buf);
        i = j + 2;
      } else {
        const m = /^\[(0|[1-9][0-9]*)\]/.exec(path.slice(i));
        if (!m || m[1] === undefined) throw new PathError("bad index");
        out.push(Number(m[1]));
        i += m[0].length;
      }
    } else {
      if (path[i] === ".") throw new PathError("empty segment");
      let j = i;
      while (j < n && path[j] !== "." && path[j] !== "[") j++;
      out.push(path.slice(i, j));
      i = j;
      if (i < n && path[i] === "[") continue;
    }
    if (i < n && path[i] === "." && ++i >= n) throw new PathError("trailing dot");
  }
  return out;
}

const MISSING = Symbol("missing");
function step(cur: Json, key: PathKey): Json | typeof MISSING {
  if (typeof key === "number") return Array.isArray(cur) && key < cur.length ? cur[key] ?? null : MISSING;
  return isObject(cur) && hasOwn(cur, key) ? cur[key] ?? null : MISSING;
}

function walk(data: Json, path: string): Json | typeof MISSING {
  let cur = data;
  for (const key of parsePath(path)) {
    const next = step(cur, key);
    if (next === MISSING) return MISSING;
    cur = next;
  }
  return cur;
}

/** Value at path, or fallback when any step is missing. */
export function getPath(data: Json, path: string, fallback: Json = null): Json {
  const found = walk(data, path);
  return found === MISSING ? fallback : found;
}

/** True when every step of path exists (a null value counts as present). */
export const hasPath = (data: Json, path: string): boolean => walk(data, path) !== MISSING;

function setIn(cur: Json, keys: PathKey[], value: Json): Json {
  const [key, ...rest] = keys;
  if (key === undefined) return clone(value);
  if (cur === null) cur = typeof key === "number" ? [] : {};
  if (typeof key === "number") {
    if (!Array.isArray(cur)) throw new PathError("index on a non-array");
    if (key > cur.length) throw new PathError("index out of range");
    const next = cur.map(clone);
    next[key] = setIn(key < next.length ? next[key] ?? null : null, rest, value);
    return next;
  }
  if (!isObject(cur)) throw new PathError("key on a non-object");
  const next = clone(cur) as JsonObject;
  put(next, key, setIn(hasOwn(next, key) ? next[key] ?? null : null, rest, value));
  return next;
}

/** New value with value at path (creates containers, appends at index === length). */
export function setPath(data: Json, path: string, value: Json): Json {
  return setIn(data, parsePath(path), value);
}

function deleteIn(cur: Json, keys: PathKey[]): Json {
  const [key, ...rest] = keys;
  if (key === undefined || step(cur, key) === MISSING) return clone(cur);
  if (Array.isArray(cur) && typeof key === "number") {
    const next = cur.map(clone);
    if (rest.length) next[key] = deleteIn(cur[key] ?? null, rest); else next.splice(key, 1);
    return next;
  }
  const next = clone(cur) as JsonObject;
  if (rest.length) put(next, String(key), deleteIn(next[key] ?? null, rest)); else delete next[key];
  return next;
}

/** New value without the key or index at path (arrays shift); a missing path returns a copy; "" gives null. */
export function deletePath(data: Json, path: string): Json {
  const keys = parsePath(path);
  return keys.length ? deleteIn(data, keys) : null;
}
