// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Content-Disposition (RFC 6266 + RFC 8187) build and parse for downloads. Original source; copy and adapt.
// sanitizeFilename replaces / \ " and control characters (< U+0020, U+007F) with "_", trims spaces and dots at both
// ends and falls back to "download". buildContentDisposition emits filename="..." for printable ASCII, otherwise an
// ASCII fallback plus filename*=UTF-8''<pct>. parseContentDisposition lowercases the type, prefers filename* and
// returns the sanitized filename; still store uploads under a server-generated name. safe-filename.ts has the
// broader path-join helpers. Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart
// content-disposition modules (shared vectors).

/** A parsed header: lowercased type, sanitized filename (or null) and ordered raw params. */
export interface ContentDisposition { type: string; filename: string | null; params: Map<string, string> }

const NAME = /[!#$%&'*+\-.^_`|~0-9A-Za-z]+/y;
const BARE = /[^;\s]*/y;
const ATTR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/;
const hex = (b: number): string => "%" + b.toString(16).toUpperCase().padStart(2, "0");

/** Replaces / \ " and control characters with "_", trims spaces and dots; empty -> "download". */
export function sanitizeFilename(name: string): string {
  let out = "";
  for (const c of name) {
    const cp = c.codePointAt(0)!;
    out += c === "/" || c === "\\" || c === '"' || cp < 0x20 || cp === 0x7f ? "_" : c;
  }
  return out.replace(/^[ .]+|[ .]+$/g, "") || "download";
}

/** 'attachment; filename="..."' (or inline), adding filename*=UTF-8'' for non-ASCII names. */
export function buildContentDisposition(filename: string, inline = false): string {
  const name = sanitizeFilename(filename);
  const kind = inline ? "inline" : "attachment";
  if (!/[^\x20-\x7e]/.test(name)) return `${kind}; filename="${name}"`;
  let fallback = "";
  let enc = "";
  for (const c of name) {
    const cp = c.codePointAt(0)!;
    fallback += cp >= 0x20 && cp < 0x7f ? c : "_";
    enc += ATTR.test(c) ? c : Array.from(new TextEncoder().encode(c), hex).join("");
  }
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${enc}`;
}

function extValue(v: string): string {
  const m = /^([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'([^\n]*)$/.exec(v);
  const cs = m?.[1]!.toLowerCase();
  if (!m || (cs !== "utf-8" && cs !== "iso-8859-1")) throw new RangeError("bad extended value");
  const raw = m[3]!;
  if (/%(?![0-9A-Fa-f]{2})/.test(raw)) throw new RangeError("bad percent-encoding");
  const bytes: number[] = [];
  const src = new TextEncoder().encode(raw);
  for (let i = 0; i < src.length; i++) {
    if (src[i] === 0x25) { bytes.push(parseInt(String.fromCharCode(src[i + 1]!, src[i + 2]!), 16)); i += 2; } else bytes.push(src[i]!);
  }
  if (cs === "iso-8859-1") return bytes.map((b) => String.fromCharCode(b)).join("");
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes)); } catch { throw new RangeError("invalid UTF-8"); }
}

/** Parses a Content-Disposition value; throws RangeError for a missing type, bad extended value or open quote. */
export function parseContentDisposition(s: string): ContentDisposition {
  const m = /^\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)\s*/.exec(s);
  if (!m) throw new RangeError("missing disposition type");
  const type = m[1]!.toLowerCase();
  const n = s.length;
  let i = m[0].length;
  const params = new Map<string, string>();
  const ws = (): void => { while (i < n && (s[i] === " " || s[i] === "\t")) i++; };
  while (i < n) {
    if (s[i] !== ";") throw new RangeError("expected ;");
    i++;
    ws();
    if (i >= n) break;
    NAME.lastIndex = i;
    const nm = NAME.exec(s);
    if (!nm) throw new RangeError("expected parameter");
    const name = nm[0].toLowerCase();
    i = NAME.lastIndex;
    ws();
    if (i >= n || s[i] !== "=") throw new RangeError("expected =");
    i++;
    ws();
    let val = "";
    if (i < n && s[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new RangeError("unterminated quote");
        const c = s[i]!;
        if (c === "\\" && i + 1 < n) { val += s[i + 1]; i += 2; continue; }
        i++;
        if (c === '"') break;
        val += c;
      }
    } else {
      BARE.lastIndex = i;
      val = BARE.exec(s)![0];
      i = BARE.lastIndex;
    }
    ws();
    if (name.endsWith("*")) params.set(name.slice(0, -1), extValue(val));
    else if (!params.has(name)) params.set(name, val);
  }
  const fn = params.get("filename");
  return { type, filename: fn === undefined ? null : sanitizeFilename(fn), params };
}
