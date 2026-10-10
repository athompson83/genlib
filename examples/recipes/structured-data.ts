// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: JSON-LD <script> blocks and <head> meta / Open Graph / Twitter card tags.
// Original source; copy and adapt. Pure and deterministic: no network access, "\n" newlines.
// JSON-LD output escapes < > & U+2028 U+2029 as \uXXXX so text cannot close the <script>
// element; meta values are HTML-escaped. Validate the result with a schema.org testing tool.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface MetaTagOptions {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  siteName?: string;
  type?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  locale?: string;
}

export const TWITTER_CARDS: readonly string[] = ["summary", "summary_large_image", "app", "player"];

const SCRIPT_ESCAPES: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };

function jsonString(value: string): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => SCRIPT_ESCAPES[c] ?? c);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Compact JSON with keys in insertion order and script-safe escaping; rejects NaN/Infinity and non-JSON values. */
export function scriptSafeJson(value: unknown, path = "$", depth = 0): string {
  if (depth > 64) throw new RangeError(`${path}: nesting is deeper than 64 levels`);
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`${path}: numbers must be finite (no NaN or Infinity)`);
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") return jsonString(value);
  if (Array.isArray(value)) return `[${value.map((item, i) => scriptSafeJson(item, `${path}[${i}]`, depth + 1)).join(",")}]`;
  if (isPlainObject(value)) {
    const members = Object.keys(value).map((key) => `${jsonString(key)}:${scriptSafeJson(value[key], `${path}.${key}`, depth + 1)}`);
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`${path}: unsupported JSON-LD value of type ${typeof value}`);
}

/** Returns <script type="application/ld+json">{...}</script> for a schema.org object or array. */
export function jsonLdScript(data: { [key: string]: JsonValue } | JsonValue[]): string {
  if (!Array.isArray(data) && !isPlainObject(data)) throw new TypeError("JSON-LD data must be an object or an array");
  return `<script type="application/ld+json">${scriptSafeJson(data)}</script>`;
}

/** Escapes & < > " for HTML text and double-quoted attribute values. */
export function htmlEscape(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function isHttpsUrl(value: string): boolean {
  return !/[\u0000- \u007f]/.test(value) && /^https:\/\/[^/?#]+/i.test(value);
}

function optional(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

/** Title, description, canonical, Open Graph and Twitter tags, joined by "\n" (no trailing newline). */
export function metaTags(options: MetaTagOptions): string {
  const { title } = options;
  if (typeof title !== "string" || title.trim() === "") throw new Error("title must be a non-empty string");
  const description = optional(options.description, "description");
  const canonical = optional(options.canonical, "canonical");
  const image = optional(options.image, "image");
  const siteName = optional(options.siteName, "siteName");
  const type = optional(options.type, "type") ?? "website";
  const twitterCard = optional(options.twitterCard, "twitterCard") ?? "summary_large_image";
  const locale = optional(options.locale, "locale");
  if (canonical !== undefined && !isHttpsUrl(canonical)) throw new Error("canonical must be an absolute https URL");
  if (image !== undefined && !isHttpsUrl(image)) throw new Error("image must be an absolute https URL");
  if (!TWITTER_CARDS.includes(twitterCard)) throw new Error(`twitterCard must be one of ${TWITTER_CARDS.join(", ")}`);
  if (locale !== undefined && !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(locale)) throw new Error("locale must look like en or en_US");
  const e = htmlEscape;
  const lines: string[] = [`<title>${e(title)}</title>`];
  const push = (value: string | undefined, line: (v: string) => string): void => { if (value !== undefined) lines.push(line(e(value))); };
  push(description, (v) => `<meta name="description" content="${v}">`);
  push(canonical, (v) => `<link rel="canonical" href="${v}">`);
  push(title, (v) => `<meta property="og:title" content="${v}">`);
  push(description, (v) => `<meta property="og:description" content="${v}">`);
  push(canonical, (v) => `<meta property="og:url" content="${v}">`);
  push(image, (v) => `<meta property="og:image" content="${v}">`);
  push(siteName, (v) => `<meta property="og:site_name" content="${v}">`);
  push(type, (v) => `<meta property="og:type" content="${v}">`);
  push(locale, (v) => `<meta property="og:locale" content="${v}">`);
  push(twitterCard, (v) => `<meta name="twitter:card" content="${v}">`);
  push(title, (v) => `<meta name="twitter:title" content="${v}">`);
  push(description, (v) => `<meta name="twitter:description" content="${v}">`);
  push(image, (v) => `<meta name="twitter:image" content="${v}">`);
  return lines.join("\n");
}
