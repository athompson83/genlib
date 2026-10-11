// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: newline-delimited JSON (NDJSON / JSON Lines) parsing and serialization. Original source; copy and
// adapt. parseNdjson() splits on LF, drops one trailing CR per line, skips lines that are empty or only spaces and
// tabs and JSON.parses each remaining line; a bad line throws NdjsonError with its 1-based number in `.line`.
// stringifyNdjson() writes each value compactly with object keys in insertion order, escaping only '"', "\" and
// U+0000-U+001F (\b \f \n \r \t or lowercase \u00XX) and keeping non-ASCII characters as they are, each followed by
// LF. JS objects list integer-like keys first, so pass a Map when such keys must keep their order. Non-integer
// numbers use JS number formatting; NaN, Infinity, undefined, functions and bigint throw. For large streams split on
// "\n" incrementally and call parseNdjson per chunk of complete lines.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart ndjson modules.

export class NdjsonError extends SyntaxError {
  override name = "NdjsonError";
  /** Creates the error; `line` is the 1-based input line, when known. */
  readonly line: number | null;
  constructor(message: string, line: number | null = null) { super(message); this.line = line; }
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue } | Map<string, JsonValue>;

/** Parses NDJSON text into an array of values. */
export function parseNdjson(text: string): unknown[] {
  const out: unknown[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (/^[ \t]*$/.test(line)) return;
    try { out.push(JSON.parse(line)); } catch { throw new NdjsonError(`invalid JSON on line ${index + 1}`, index + 1); }
  });
  return out;
}

const SHORT: Readonly<Record<string, string>> = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };

function quote(s: string): string {
  return '"' + s.replace(/["\\\u0000-\u001f]/g, (c) => SHORT[c] ?? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) + '"';
}

function value(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new NdjsonError("NaN and Infinity are not JSON");
    return Object.is(v, -0) ? "0" : String(v);
  }
  if (typeof v === "string") return quote(v);
  if (Array.isArray(v)) return "[" + v.map(value).join(",") + "]";
  if (v instanceof Map) {
    return "{" + [...v].map(([k, x]) => {
      if (typeof k !== "string") throw new NdjsonError("object keys must be strings");
      return quote(k) + ":" + value(x);
    }).join(",") + "}";
  }
  if (typeof v === "object") return "{" + Object.entries(v).map(([k, x]) => quote(k) + ":" + value(x)).join(",") + "}";
  throw new NdjsonError("unsupported value type: " + typeof v);
}

/** Serializes values as NDJSON, one compact value per LF-terminated line ("" for an empty array). */
export function stringifyNdjson(values: readonly unknown[]): string {
  return values.map((v) => value(v) + "\n").join("");
}
