// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Cache-Control (RFC 9111) parse, format and freshness lifetime. Original source; copy and adapt.
// A directive value is true (bare), a number (delta seconds) or a string. Names are lowercased and the first
// occurrence wins. max-age, s-maxage, stale-while-revalidate, stale-if-error, max-stale and min-fresh must be ASCII
// digits (quoted digits accepted) and become numbers; invalid ones are dropped, as are bare ones except max-stale.
// Unparseable items are skipped up to the next comma; an unterminated quote throws RangeError. For ETags and
// If-None-Match use http-conditional.ts. Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and
// Dart cache-control modules (shared vectors).

/** A directive value: true for a bare directive, a number for delta seconds, otherwise the string. */
export type CacheDirective = true | number | string;

const DELTA = new Set(["max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh"]);
const TOKEN = /[!#$%&'*+\-.^_`|~0-9A-Za-z]+/y;
const isToken = (v: string): boolean => /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(v);

/** Parses a Cache-Control header into an ordered Map of directive -> true | number | string. */
export function parseCacheControl(s: string): Map<string, CacheDirective> {
  const out = new Map<string, CacheDirective>();
  const n = s.length;
  let i = 0;
  const token = (): string | null => {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(s);
    if (m) i = TOKEN.lastIndex;
    return m ? m[0] : null;
  };
  const skipToComma = (): void => { const j = s.indexOf(",", i); i = j < 0 ? n : j; };
  while (i < n) {
    while (i < n && (s[i] === " " || s[i] === "\t" || s[i] === ",")) i++;
    if (i >= n) break;
    const raw = token();
    if (raw === null) { skipToComma(); continue; }
    const name = raw.toLowerCase();
    let val: CacheDirective = true;
    while (i < n && (s[i] === " " || s[i] === "\t")) i++;
    if (i < n && s[i] === "=") {
      i++;
      while (i < n && (s[i] === " " || s[i] === "\t")) i++;
      if (i < n && s[i] === '"') {
        i++;
        let buf = "";
        for (;;) {
          if (i >= n) throw new RangeError("unterminated quote");
          const c = s[i]!;
          if (c === "\\" && i + 1 < n) { buf += s[i + 1]; i += 2; continue; }
          i++;
          if (c === '"') break;
          buf += c;
        }
        val = buf;
      } else val = token() ?? "";
    }
    skipToComma();
    if (DELTA.has(name)) {
      if (val === true && name !== "max-stale") continue;
      if (val !== true) {
        if (!/^[0-9]+$/.test(String(val))) continue;
        val = Number(val);
      }
    }
    if (!out.has(name)) out.set(name, val);
  }
  return out;
}

/** Serializes directives in order: true -> name, number -> name=N, strings quoted unless tokens. */
export function formatCacheControl(directives: Iterable<readonly [string, CacheDirective]>): string {
  return Array.from(directives, ([k, v]) => {
    if (v === true) return k;
    if (typeof v === "number" || isToken(v)) return `${k}=${v}`;
    return `${k}="${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }).join(", ");
}

/** Freshness lifetime in seconds: no-store/no-cache -> 0, shared caches prefer s-maxage, else max-age or null. */
export function cacheFreshness(directives: ReadonlyMap<string, CacheDirective>, shared = false): number | null {
  if (directives.has("no-store") || directives.has("no-cache")) return 0;
  const sMaxAge = directives.get("s-maxage");
  if (shared && typeof sMaxAge === "number") return sMaxAge;
  const maxAge = directives.get("max-age");
  return typeof maxAge === "number" ? maxAge : null;
}
