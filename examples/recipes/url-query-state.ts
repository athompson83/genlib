// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: typed URL query-string state (filters, sort, page) with defaults. Original source; copy and adapt.
// Parsing never throws on bad input: invalid or missing values fall back to defaults, so a
// hand-edited or stale link still renders. Serialization omits defaults and sorts keys so
// equal states produce equal URLs. Query values are user input: authorize server-side.

export interface QueryField<T> {
  readonly defaultValue: T;
  parse(raw: readonly string[]): T | undefined;
  serialize(value: T): string[];
  equals(a: T, b: T): boolean;
}
type Schema = Record<string, QueryField<unknown>>;
export type QueryState<S extends Schema> = { [K in keyof S]: S[K] extends QueryField<infer T> ? T : never };

const same = <T>(a: T, b: T) => Object.is(a, b);
const field = <T>(defaultValue: T, parse: (raw: readonly string[]) => T | undefined, serialize: (v: T) => string[], equals: (a: T, b: T) => boolean = same): QueryField<T> =>
  ({ defaultValue, parse, serialize, equals });

export const q = {
  string: (defaultValue = "", maxLength = 200) =>
    field(defaultValue, (raw) => (raw[0] !== undefined && raw[0].length <= maxLength ? raw[0] : undefined), (v) => [v]),
  int: (defaultValue: number, range: { min?: number; max?: number } = {}) =>
    field(defaultValue, (raw) => {
      const n = raw[0] !== undefined && /^-?\d{1,15}$/.test(raw[0]) ? Number(raw[0]) : NaN;
      return Number.isSafeInteger(n) && n >= (range.min ?? -Infinity) && n <= (range.max ?? Infinity) ? n : undefined;
    }, (v) => [String(v)]),
  boolean: (defaultValue = false) =>
    field(defaultValue, (raw) => (raw[0] === "1" || raw[0] === "true" ? true : raw[0] === "0" || raw[0] === "false" ? false : undefined), (v) => [v ? "1" : "0"]),
  enumOf: <const T extends string>(values: readonly T[], defaultValue: T) =>
    field<T>(defaultValue, (raw) => values.find((x) => x === raw[0]), (v) => [v]),
  /** Repeated keys (?tag=a&tag=b); de-duplicated, order preserved. */
  list: (defaultValue: readonly string[] = [], maxItems = 50) =>
    field<readonly string[]>(defaultValue, (raw) => (raw.length <= maxItems ? [...new Set(raw.filter((x) => x !== ""))] : undefined), (v) => [...v],
      (a, b) => a.length === b.length && a.every((x, i) => x === b[i])),
};

export function parseQuery<S extends Schema>(schema: S, input: string | URLSearchParams): QueryState<S> {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const state: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const def = schema[key] as QueryField<unknown>;
    const raw = params.getAll(key);
    state[key] = raw.length ? def.parse(raw) ?? def.defaultValue : def.defaultValue;
  }
  return state as QueryState<S>;
}

/** Returns "a=1&b=x" (no leading "?"); keys outside the schema are dropped. */
export function serializeQuery<S extends Schema>(schema: S, state: Partial<QueryState<S>>): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(schema).sort()) {
    const def = schema[key] as QueryField<unknown>;
    const value = (state as Record<string, unknown>)[key];
    if (value === undefined || def.equals(value, def.defaultValue)) continue;
    for (const part of def.serialize(value)) params.append(key, part);
  }
  return params.toString();
}

/** Merges a patch into the current URL's state, e.g. resetting page when a filter changes. */
export function updateQuery<S extends Schema>(schema: S, current: string | URLSearchParams, patch: Partial<QueryState<S>>): string {
  return serializeQuery(schema, { ...parseQuery(schema, current), ...patch });
}
