// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: HTML escaping, an auto-escaping html`` template tag, URL allow-listing, character-reference
// unescaping and tag stripping for plain-text previews. Original source; copy and adapt.
// Safe for element text and QUOTED attribute values only. Never interpolate into <script>,
// <style>, event-handler attributes (onclick), unquoted attributes or CSS. Prefer your
// framework's escaping (React JSX, template engines) and DOMPurify for user-authored HTML.
// unescapeHtml/stripTags match the Genlib html-escape modules in every language; escapeHtml also escapes "`".

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => ENTITIES[ch] ?? ch);
}

/** Marker for trusted markup. Only construct from html`` output or reviewed constants. */
export class SafeHtml {
  readonly #value: string;
  constructor(value: string) { this.#value = value; }
  toString(): string { return this.#value; }
}

/** Wraps a reviewed constant without escaping. Never pass user input here. */
export const trustedHtml = (markup: string): SafeHtml => new SafeHtml(markup);

function interpolate(value: unknown): string {
  if (value instanceof SafeHtml) return value.toString();
  if (value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(interpolate).join("");
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolation. Nest html`` results freely; arrays are
 * joined; null/undefined/false render nothing.
 *   html`<a href="${safeUrl(link)}">${label}</a>`
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? "";
  values.forEach((value, i) => { out += interpolate(value) + (strings[i + 1] ?? ""); });
  return new SafeHtml(out);
}

/**
 * Allows http(s), mailto, tel and relative URLs; anything else (javascript:, data:, vbscript:,
 * obfuscated schemes) becomes the fallback. Still interpolate the result through html``.
 */
export function safeUrl(input: string, fallback = "#", allowed: readonly string[] = ["http:", "https:", "mailto:", "tel:"]): string {
  const value = input.trim();
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;
  if (/^(?:\/(?!\/)|\.{1,2}\/|[?#])/.test(value) || value === "") return value || fallback;
  try {
    const url = new URL(value);
    return allowed.includes(url.protocol) ? url.href : fallback;
  } catch {
    // Bare relative paths such as "docs/page.html"; protocol-relative "//host" is rejected.
    return /^[\w\-./~%]+$/.test(value) && !value.startsWith("//") ? value : fallback;
  }
}

/** Escapes text and turns newlines into <br> for simple multi-line display. */
export const textToHtml = (text: string): SafeHtml => new SafeHtml(escapeHtml(text).replace(/\r\n?|\n/g, "<br>"));

const NAMED: Readonly<Record<string, number>> = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0xa0, copy: 0xa9, reg: 0xae, trade: 0x2122, hellip: 0x2026,
  mdash: 0x2014, ndash: 0x2013, lsquo: 0x2018, rsquo: 0x2019, ldquo: 0x201c, rdquo: 0x201d, bull: 0x2022, middot: 0xb7,
  deg: 0xb0, plusmn: 0xb1, times: 0xd7, divide: 0xf7, euro: 0x20ac, pound: 0xa3, yen: 0xa5, cent: 0xa2, sect: 0xa7,
  para: 0xb6, laquo: 0xab, raquo: 0xbb, iexcl: 0xa1, iquest: 0xbf, shy: 0xad,
};
// HTML5 maps numeric references 0x80-0x9F through windows-1252 (unassigned slots stay as is).
const C1 = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178];

/** Decodes &#NNN; (1-10 digits), &#xHHH; (1-8 hex digits) and a fixed set of named references; ";" is required. */
export function unescapeHtml(text: string): string {
  return text.replace(/&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});/g, (all, ref: string) => {
    if (ref[0] !== "#") return Object.hasOwn(NAMED, ref) ? String.fromCodePoint(NAMED[ref] ?? 0) : all;
    const v = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (v === 0 || (v >= 0xd800 && v <= 0xdfff) || v > 0x10ffff) return String.fromCharCode(0xfffd);
    return String.fromCodePoint(v >= 0x80 && v <= 0x9f ? C1[v - 0x80] ?? v : v);
  });
}

/**
 * Plain text from HTML for previews and search snippets: drops <script>/<style> contents, removes tags, then
 * unescapes. NOT a sanitizer: never render the result as HTML without escaping it again.
 */
export function stripTags(html: string): string {
  return unescapeHtml(html
    .replace(/<(script|style)(?![\p{L}\p{N}_])[^>]*>[\s\S]*?(?:<\/\1\s*>|(?=\n?$))/giu, "")
    .replace(/<[A-Za-z/!?][^>]*>/g, ""));
}
