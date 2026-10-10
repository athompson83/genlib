// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: HTML escaping, an auto-escaping html`` template tag and URL allow-listing. Original source; copy and adapt.
// Safe for element text and QUOTED attribute values only. Never interpolate into <script>,
// <style>, event-handler attributes (onclick), unquoted attributes or CSS. Prefer your
// framework's escaping (React JSX, template engines) and DOMPurify for user-authored HTML.

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
