// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: prototype-pollution-safe deep merge, pick and omit. Original source; copy and adapt.

export type PlainObject = Record<string, unknown>;
export interface MergeOptions { arrays?: "replace" | "concat"; maxDepth?: number }

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

export function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function define(target: PlainObject, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function mergeInto(target: PlainObject, source: PlainObject, options: MergeOptions, depth: number): void {
  if (depth > (options.maxDepth ?? 64)) throw new RangeError("Merge exceeds maxDepth");
  for (const key of Object.keys(source)) {
    if (FORBIDDEN.has(key)) continue; // drop keys that could reach Object.prototype
    const incoming = source[key];
    const current = Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
    if (incoming === undefined) continue;
    if (isPlainObject(incoming)) {
      const next: PlainObject = isPlainObject(current) ? current : {};
      if (next !== current) define(target, key, next);
      mergeInto(next, incoming, options, depth + 1);
    } else if (Array.isArray(incoming)) {
      define(target, key, options.arrays === "concat" && Array.isArray(current) ? [...current, ...incoming] : [...incoming]);
    } else {
      define(target, key, incoming);
    }
  }
}

/**
 * Returns a new object; inputs are not mutated. Later sources win, `undefined` values are
 * skipped, arrays replace (or concat), and non-plain objects (Date, Map, class instances)
 * are copied by reference. Safe for untrusted JSON such as `{"__proto__": {...}}`.
 */
export function deepMerge<T extends PlainObject>(base: T, ...sources: ReadonlyArray<PlainObject | null | undefined>): T;
export function deepMerge(base: PlainObject, ...sources: ReadonlyArray<PlainObject | null | undefined>): PlainObject {
  return mergeWith({}, base, ...sources);
}

/** deepMerge with explicit options, e.g. mergeWith({ arrays: "concat" }, a, b). */
export function mergeWith(options: MergeOptions, ...sources: ReadonlyArray<PlainObject | null | undefined>): PlainObject {
  const out: PlainObject = {};
  for (const source of sources) if (source) mergeInto(out, source, options, 0);
  return out;
}

export function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (typeof key === "string" && FORBIDDEN.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key];
  }
  return out;
}

export function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const drop = new Set<PropertyKey>(keys);
  const out: PlainObject = {};
  for (const key of Object.keys(value)) {
    if (!drop.has(key) && !FORBIDDEN.has(key)) define(out, key, (value as PlainObject)[key]);
  }
  return out as Omit<T, K>;
}
