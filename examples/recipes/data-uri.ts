// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: data: URLs (RFC 2397 with the WHATWG fetch "data: URL processor" rules, simplified). Original source.
// parseDataUri: "data:" and ";base64" are case-insensitive; an empty or invalid media type becomes text/plain with
// charset US-ASCII; the body is percent-decoded to bytes (invalid "%" stays literal); base64 bodies drop ASCII
// whitespace and at most two trailing "=", then must be A-Z a-z 0-9 + / with a length not 1 mod 4.
// buildDataUri picks base64 unless the type is textual and the bytes are valid UTF-8. Never put a data: URL from
// user input into href/src without an allow-list. Same results as the Genlib Python, Go, Rust, Java, Kotlin,
// C#, Swift and Dart data-uri modules (shared vectors).

/** A parsed data: URL; params keep their order, names lowercased. */
export interface DataUri { mime: string; params: Map<string, string>; base64: boolean; data: Uint8Array }

const TOKEN = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
const MIME = new RegExp(`^${TOKEN}/${TOKEN}$`);
const MEDIA = new RegExp(`^${TOKEN}/${TOKEN}(\\s*;\\s*${TOKEN}=[^;,\\s]+)*$`);
const KEEP = new Set(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,", (c) => c.charCodeAt(0)));
const isHex = (b: number | undefined): boolean =>
  b !== undefined && ((b >= 48 && b <= 57) || (b >= 65 && b <= 70) || (b >= 97 && b <= 102));

function percentDecode(s: string): number[] {
  const b = new TextEncoder().encode(s);
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x25 && i + 2 < b.length && isHex(b[i + 1]) && isHex(b[i + 2])) {
      out.push(parseInt(String.fromCharCode(b[i + 1]!, b[i + 2]!), 16));
      i += 2;
    } else out.push(b[i]!);
  }
  return out;
}

/** Parses a data: URL into its media type, ordered params, base64 flag and decoded bytes; RangeError if malformed. */
export function parseDataUri(url: string): DataUri {
  if (url.slice(0, 5).toLowerCase() !== "data:") throw new RangeError("not a data: URL");
  const rest = url.slice(5);
  const comma = rest.indexOf(",");
  if (comma < 0) throw new RangeError("missing comma");
  let header = rest.slice(0, comma).trim();
  const body = rest.slice(comma + 1);
  const m = /;\s*base64\s*$/i.exec(header);
  const isB64 = m !== null;
  if (m) header = header.slice(0, m.index);
  const parts = header.split(";");
  let mime = parts[0]!.trim().toLowerCase();
  let params = new Map<string, string>();
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    if (k && !params.has(k)) params.set(k, p.slice(eq + 1).trim());
  }
  if (!MIME.test(mime)) {
    mime = "text/plain";
    if (!params.has("charset")) params = new Map([["charset", "US-ASCII"], ...params]);
  }
  let data = percentDecode(body);
  if (isB64) {
    let s = "";
    for (const b of data) if (b !== 9 && b !== 10 && b !== 12 && b !== 13 && b !== 32) s += String.fromCharCode(b);
    s = s.endsWith("==") ? s.slice(0, -2) : s.endsWith("=") ? s.slice(0, -1) : s;
    if (s.length % 4 === 1 || !/^[A-Za-z0-9+/]*$/.test(s)) throw new RangeError("invalid base64");
    data = Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  }
  return { mime, params, base64: isB64, data: Uint8Array.from(data) };
}

/** Builds a data: URL; base64 undefined/null picks base64 unless the type is textual and data is valid UTF-8. */
export function buildDataUri(data: Uint8Array, mime = "application/octet-stream", base64?: boolean | null): string {
  if (!MEDIA.test(mime)) throw new RangeError("invalid media type");
  let useB64 = base64;
  if (useB64 == null) {
    const base = mime.split(";")[0]!.trim().toLowerCase();
    const textual = base.startsWith("text/") || base.endsWith("+json") || base.endsWith("+xml")
      || base === "application/json" || base === "application/xml" || base === "application/javascript";
    let utf8 = true;
    try { new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { utf8 = false; }
    useB64 = !(textual && utf8);
  }
  if (useB64) {
    let bin = "";
    for (const b of data) bin += String.fromCharCode(b);
    return `data:${mime};base64,${btoa(bin)}`;
  }
  let out = `data:${mime},`;
  for (const b of data) out += KEEP.has(b) ? String.fromCharCode(b) : "%" + b.toString(16).toUpperCase().padStart(2, "0");
  return out;
}
