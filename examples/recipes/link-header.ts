// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: HTTP Link header (RFC 8288) parse, rel lookup and format, e.g. GitHub-style pagination.
// Original source; copy and adapt. Commas inside <...> or quoted strings do not split; names are lowercased;
// quoted strings honor backslash escapes; RFC 8187 name* values (UTF-8 or ISO-8859-1, strict percent-encoding)
// win over the plain form and are stored without "*"; otherwise the first occurrence wins; rel is lowercased with
// whitespace collapsed. Malformed input throws RangeError. Treat the URIs as untrusted: resolve them against the
// request URL and check the origin before following. Same results as the Genlib Python, Go, Rust, Java, Kotlin,
// C#, Swift and Dart link-header modules (shared vectors).

/** One link: target URI and ordered params (names lowercased, rel normalized). */
export interface Link { uri: string; params: Map<string, string> }

const NAME = /[!#$%&'*+\-.^_`|~0-9A-Za-z]+/y;
const BARE = /[^,;\s]*/y;
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const ATTR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/;

function extValue(v: string): string {
  const m = /^([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'([^\n]*)$/.exec(v);
  if (!m) throw new RangeError("bad extended value");
  const cs = m[1]!.toLowerCase();
  if (cs !== "utf-8" && cs !== "iso-8859-1") throw new RangeError("unsupported charset");
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

/** Parses a Link header into links in order; throws RangeError when malformed. */
export function parseLinkHeader(s: string): Link[] {
  let i = 0;
  const n = s.length;
  const links: Link[] = [];
  const ws = (): void => { while (i < n && (s[i] === " " || s[i] === "\t")) i++; };
  for (;;) {
    ws();
    if (i >= n) break;
    if (s[i] === ",") { i++; continue; }
    if (s[i] !== "<") throw new RangeError("expected <");
    const end = s.indexOf(">", i);
    if (end < 0) throw new RangeError("unterminated <");
    const uri = s.slice(i + 1, end);
    i = end + 1;
    const params = new Map<string, string>();
    const ext = new Set<string>();
    for (;;) {
      ws();
      if (i >= n || s[i] === ",") break;
      if (s[i] !== ";") throw new RangeError("expected ;");
      i++;
      ws();
      NAME.lastIndex = i;
      const m = NAME.exec(s);
      if (!m) throw new RangeError("expected parameter name");
      const name = m[0].toLowerCase();
      i = NAME.lastIndex;
      ws();
      let val = "";
      if (i < n && s[i] === "=") {
        i++;
        ws();
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
      }
      if (name.endsWith("*")) {
        const base = name.slice(0, -1);
        params.set(base, extValue(val));
        ext.add(base);
      } else if (!ext.has(name) && !params.has(name)) params.set(name, val);
    }
    const rel = params.get("rel");
    if (rel !== undefined) params.set("rel", rel.toLowerCase().split(/\s+/).filter(Boolean).join(" "));
    links.push({ uri, params });
  }
  return links;
}

/** The first link whose rel list contains rel (case-insensitive), or null. */
export function findRel(links: readonly Link[], rel: string): Link | null {
  const want = rel.toLowerCase();
  return links.find((l) => (l.params.get("rel") ?? "").split(/\s+/).filter(Boolean).includes(want)) ?? null;
}

/** Serializes links: rel always quoted, other values quoted unless tokens, non-ASCII as name*=UTF-8''. */
export function formatLinkHeader(links: readonly Link[]): string {
  return links.map((l) => {
    const parts = [`<${l.uri}>`];
    for (const [k, v] of l.params) {
      if (/[^\x20-\x7e]/.test(v)) {
        let enc = "";
        for (const c of v) {
          enc += ATTR.test(c) ? c : Array.from(new TextEncoder().encode(c), (b) => "%" + b.toString(16).toUpperCase().padStart(2, "0")).join("");
        }
        parts.push(`${k}*=UTF-8''${enc}`);
      } else if (TOKEN.test(v) && k !== "rel") parts.push(`${k}=${v}`);
      else parts.push(`${k}="${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
    }
    return parts.join("; ");
  }).join(", ");
}
