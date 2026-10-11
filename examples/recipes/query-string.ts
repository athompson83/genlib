// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: application/x-www-form-urlencoded parse and stringify (WHATWG URL standard). Original source.
// parseQuery strips one leading "?", skips empty pieces, splits at the first "=", turns "+" into a space,
// percent-decodes bytes (an invalid "%" stays literal) and decodes UTF-8 with U+FFFD replacement; it never throws.
// stringifyQuery keeps A-Z a-z 0-9 * - . _, writes space as "+" and %XX (uppercase) for every other UTF-8 byte.
// Ordered pairs keep repeated names. For typed filter/sort/page state on top of this, use url-query-state.ts.
// Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart query-string modules.

/** One decoded [name, value] pair. */
export type QueryPair = [name: string, value: string];

const isHex = (b: number | undefined): boolean =>
  b !== undefined && ((b >= 48 && b <= 57) || (b >= 65 && b <= 70) || (b >= 97 && b <= 102));

function decode(s: string): string {
  const b = new TextEncoder().encode(s.replaceAll("+", " "));
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x25 && i + 2 < b.length && isHex(b[i + 1]) && isHex(b[i + 2])) {
      out.push(parseInt(String.fromCharCode(b[i + 1]!, b[i + 2]!), 16));
      i += 2;
    } else out.push(b[i]!);
  }
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(out));
}

function encode(s: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(s)) {
    const safe = (byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)
      || byte === 0x2a || byte === 0x2d || byte === 0x2e || byte === 0x5f;
    out += safe ? String.fromCharCode(byte) : byte === 0x20 ? "+" : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** Ordered [name, value] pairs of a query string (a leading "?" is ignored); never throws. */
export function parseQuery(s: string): QueryPair[] {
  if (s.startsWith("?")) s = s.slice(1);
  const pairs: QueryPair[] = [];
  for (const piece of s.split("&")) {
    if (piece === "") continue;
    const eq = piece.indexOf("=");
    pairs.push(eq < 0 ? [decode(piece), ""] : [decode(piece.slice(0, eq)), decode(piece.slice(eq + 1))]);
  }
  return pairs;
}

/** Serializes pairs as name=value joined with "&" (form encoding, space as "+"). */
export function stringifyQuery(pairs: Iterable<readonly [string, string]>): string {
  return Array.from(pairs, ([n, v]) => `${encode(n)}=${encode(v)}`).join("&");
}

/** Every value for name, in order. */
export function getAll(pairs: Iterable<readonly [string, string]>, name: string): string[] {
  return Array.from(pairs).filter(([n]) => n === name).map(([, v]) => v);
}
