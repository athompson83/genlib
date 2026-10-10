// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Accept and Accept-Language negotiation (RFC 9110 q-values, RFC 4647 basic
// filtering). Original source; copy and adapt. For each available entry the most specific matching
// range sets its q; the highest q > 0 wins and ties go to the earlier available entry. Send
// "Vary: Accept" / "Vary: Accept-Language" and 406 (or a default) when the result is null.

const Q = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/;
const MEDIA = /^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/;
const LANG = /^(?:\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)$/;
const trimSpTab = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, "");

/** [lowercased value, q] items; empty items and items with an invalid q are skipped. */
export function parseQualityList(header: string): [string, number][] {
  const items: [string, number][] = [];
  for (const raw of header.split(",")) {
    const part = trimSpTab(raw);
    if (part === "") continue;
    const bits = part.split(";").map(trimSpTab);
    let q = 1;
    let ok = true;
    for (const param of bits.slice(1)) {
      const eq = param.indexOf("=");
      const key = trimSpTab(eq < 0 ? param : param.slice(0, eq)).toLowerCase();
      if (key !== "q") continue;
      const value = eq < 0 ? "" : trimSpTab(param.slice(eq + 1));
      if (!Q.test(value)) { ok = false; break; }
      q = Number(value);
    }
    if (ok) items.push([(bits[0] ?? "").toLowerCase(), q]);
  }
  return items;
}

function pick(available: readonly string[], ranges: [string, number][], specificity: (range: string, value: string) => number): string | null {
  let best: string | null = null;
  let bestQ = 0;
  for (const a of available) {
    let spec = 0, q = 0;
    for (const [range, rq] of ranges) {
      const s = specificity(range, a.toLowerCase());
      if (s > spec) { spec = s; q = rq; }
    }
    if (spec > 0 && q > bestQ) { best = a; bestQ = q; }
  }
  return best;
}

function mediaSpecificity(range: string, value: string): number {
  const [rt, rs] = range.split("/");
  const slash = value.indexOf("/");
  const t = slash < 0 ? value : value.slice(0, slash), s = slash < 0 ? "" : value.slice(slash + 1);
  if (rt === t && rs === s) return 3;
  if (rt === t && rs === "*") return 2;
  return rt === "*" && rs === "*" ? 1 : 0;
}

function languageSpecificity(range: string, tag: string): number {
  if (range === "*") return 1;
  return tag === range || tag.startsWith(`${range}-`) ? 2 + range.split("-").length - 1 : 0;
}

/** Best available media type for an Accept header, or null. A missing or blank header picks the first. */
export function negotiateMediaType(accept: string | null | undefined, available: readonly string[]): string | null {
  if (accept === null || accept === undefined || accept.trim() === "") return available[0] ?? null;
  return pick(available, parseQualityList(accept).filter(([r]) => MEDIA.test(r)), mediaSpecificity);
}

/** Best available language tag (original case) for Accept-Language, or null. */
export function negotiateLanguage(acceptLanguage: string | null | undefined, available: readonly string[]): string | null {
  if (acceptLanguage === null || acceptLanguage === undefined || acceptLanguage.trim() === "") return available[0] ?? null;
  return pick(available, parseQualityList(acceptLanguage).filter(([r]) => LANG.test(r)), languageSpecificity);
}
