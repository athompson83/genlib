// SPDX-License-Identifier: Apache-2.0
// Response security headers for Fetch-standard servers. Pure functions; no environment discovery.

/** Directive name -> source list. `true` emits a valueless directive; `false` removes a default. */
export type CspDirectives = Readonly<Record<string, readonly string[] | boolean>>;
/** Feature -> allowlist. [] disables; entries are "self", "*", or an http(s) origin. */
export type PermissionsPolicy = Readonly<Record<string, readonly string[]>>;

export type ReferrerPolicyValue =
  | "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin"
  | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url";

export interface HstsOptions {
  /** Seconds. Default 31536000 (one year). */
  maxAge?: number;
  /** Default true. */
  includeSubDomains?: boolean;
  /** Opt-in only; requires includeSubDomains and maxAge >= 31536000. */
  preload?: boolean;
}

export interface SecurityHeadersOptions {
  /** Merged over DEFAULT_CSP_DIRECTIVES per directive; `false` disables the CSP header entirely. */
  csp?: CspDirectives | false;
  /** Per-request nonce (see createNonce) added as 'nonce-<value>' to nonceDirectives. */
  nonce?: string;
  /** Directives that receive the nonce. Default ["script-src"]. */
  nonceDirectives?: readonly ("script-src" | "style-src")[];
  /** Send Content-Security-Policy-Report-Only instead of enforcing. */
  reportOnly?: boolean;
  /** Default max-age=31536000; includeSubDomains. `false` omits the header (e.g. plain-HTTP development). */
  hsts?: HstsOptions | false;
  referrerPolicy?: ReferrerPolicyValue | false;
  /** Merged over DEFAULT_PERMISSIONS_POLICY per feature; `false` omits the header. */
  permissionsPolicy?: PermissionsPolicy | false;
  crossOriginOpenerPolicy?: "same-origin" | "same-origin-allow-popups" | "unsafe-none" | false;
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  /** X-Content-Type-Options: nosniff. Default true. */
  contentTypeOptions?: boolean;
}

export interface WithSecurityHeadersOptions extends SecurityHeadersOptions {
  /** Replace headers the response already has. Default false (existing values are preserved). */
  override?: boolean;
}

export const DEFAULT_CSP_DIRECTIVES: CspDirectives = Object.freeze({
  "default-src": Object.freeze(["'self'"]),
  "object-src": Object.freeze(["'none'"]),
  "base-uri": Object.freeze(["'self'"]),
  "frame-ancestors": Object.freeze(["'none'"]),
  "form-action": Object.freeze(["'self'"]),
});

export const DEFAULT_PERMISSIONS_POLICY: PermissionsPolicy = Object.freeze({
  camera: Object.freeze([]),
  microphone: Object.freeze([]),
  geolocation: Object.freeze([]),
  payment: Object.freeze([]),
  usb: Object.freeze([]),
  "browsing-topics": Object.freeze([]),
});

const DIRECTIVE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
// One source-expression token: printable ASCII without whitespace, ';' or ','.
const DIRECTIVE_VALUE = /^[\x21-\x2b\x2d-\x3a\x3c-\x7e]{1,2048}$/;
const NONCE = /^[A-Za-z0-9+/_-]{16,256}={0,2}$/;
const FEATURE = /^[a-z][a-z0-9-]{0,63}$/;
const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;
const REFERRER = new Set<string>([
  "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin",
  "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url",
]);

function invalid(what: string): TypeError {
  return new TypeError(`Security header configuration is invalid: ${what}.`);
}

/** Cryptographically random base64 nonce for one response. Default 16 bytes (128 bits); 16-64 allowed. */
export function createNonce(bytes = 16): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) throw invalid("nonce byte length must be 16-64");
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of random) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Serialize directives. Throws TypeError on unsafe names/values (';', ',', whitespace, control characters). */
export function buildCsp(directives: CspDirectives, options: { nonce?: string; nonceDirectives?: readonly string[] } = {}): string {
  const map = new Map<string, readonly string[] | true>();
  for (const [name, value] of Object.entries(directives)) {
    if (!DIRECTIVE_NAME.test(name)) throw invalid(`CSP directive name`);
    if (value === false) continue;
    if (value === true) { map.set(name, true); continue; }
    if (!Array.isArray(value) || value.length > 64) throw invalid(`CSP directive ${name}`);
    for (const item of value) {
      if (typeof item !== "string" || !DIRECTIVE_VALUE.test(item)) throw invalid(`CSP directive ${name} value`);
    }
    map.set(name, value);
  }
  if (options.nonce !== undefined) {
    if (typeof options.nonce !== "string" || !NONCE.test(options.nonce)) throw invalid("nonce");
    for (const name of options.nonceDirectives ?? ["script-src"]) {
      if (name !== "script-src" && name !== "style-src") throw invalid("nonceDirectives");
      const existing = map.get(name);
      const fallback = map.get("default-src");
      const base = Array.isArray(existing) ? existing
        : Array.isArray(fallback) ? fallback.filter(v => v !== "'none'") : ["'self'"];
      map.set(name, [...base.filter(v => v !== "'none'"), `'nonce-${options.nonce}'`]);
    }
  }
  const parts: string[] = [];
  for (const [name, value] of map) parts.push(value === true || value.length === 0 ? name : `${name} ${value.join(" ")}`);
  return parts.join("; ");
}

function buildPermissionsPolicy(policy: PermissionsPolicy): string {
  const parts: string[] = [];
  for (const [feature, allow] of Object.entries(policy)) {
    if (!FEATURE.test(feature) || !Array.isArray(allow) || allow.length > 32) throw invalid("Permissions-Policy feature");
    const items = allow.map(item => {
      if (item === "self" || item === "*") return item;
      if (typeof item === "string" && ORIGIN.test(item)) return `"${item}"`;
      throw invalid(`Permissions-Policy ${feature} allowlist`);
    });
    parts.push(`${feature}=(${items.join(" ")})`);
  }
  return parts.join(", ");
}

function buildHsts(options: HstsOptions): string {
  const maxAge = options.maxAge ?? 31_536_000;
  if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 63_072_000) throw invalid("HSTS maxAge must be 0-63072000");
  const includeSubDomains = options.includeSubDomains !== false;
  if (options.preload === true && (!includeSubDomains || maxAge < 31_536_000)) {
    throw invalid("HSTS preload requires includeSubDomains and maxAge >= 31536000");
  }
  return `max-age=${maxAge}${includeSubDomains ? "; includeSubDomains" : ""}${options.preload === true ? "; preload" : ""}`;
}

/** Build the header record. Throws TypeError for invalid configuration (never for request data). */
export function securityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.csp !== false) {
    const directives: Record<string, readonly string[] | boolean> = { ...DEFAULT_CSP_DIRECTIVES, ...(options.csp ?? {}) };
    const cspOptions: { nonce?: string; nonceDirectives?: readonly string[] } = {};
    if (options.nonce !== undefined) cspOptions.nonce = options.nonce;
    if (options.nonceDirectives !== undefined) cspOptions.nonceDirectives = options.nonceDirectives;
    const value = buildCsp(directives, cspOptions);
    if (value) headers[options.reportOnly === true ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"] = value;
  } else if (options.nonce !== undefined) {
    throw invalid("nonce requires a CSP");
  }
  if (options.hsts !== false) headers["Strict-Transport-Security"] = buildHsts(options.hsts ?? {});
  if (options.contentTypeOptions !== false) headers["X-Content-Type-Options"] = "nosniff";
  const referrer = options.referrerPolicy ?? "strict-origin-when-cross-origin";
  if (referrer !== false) {
    if (!REFERRER.has(referrer)) throw invalid("Referrer-Policy");
    headers["Referrer-Policy"] = referrer;
  }
  if (options.permissionsPolicy !== false) {
    const value = buildPermissionsPolicy({ ...DEFAULT_PERMISSIONS_POLICY, ...(options.permissionsPolicy ?? {}) });
    if (value) headers["Permissions-Policy"] = value;
  }
  const coop = options.crossOriginOpenerPolicy ?? "same-origin";
  if (coop !== false) {
    if (!["same-origin", "same-origin-allow-popups", "unsafe-none"].includes(coop)) throw invalid("Cross-Origin-Opener-Policy");
    headers["Cross-Origin-Opener-Policy"] = coop;
  }
  const frame = options.frameOptions ?? "DENY";
  if (frame !== false) {
    if (frame !== "DENY" && frame !== "SAMEORIGIN") throw invalid("X-Frame-Options");
    headers["X-Frame-Options"] = frame;
  }
  return headers;
}

/**
 * Returns a new Response with the same body stream, status, and statusText plus security headers.
 * Existing headers win unless `override` is true. The original response's body is transferred.
 * Responses with a status outside 200-599 (e.g. Response.error()) are returned unchanged.
 */
export function withSecurityHeaders(response: Response, options: WithSecurityHeadersOptions = {}): Response {
  const { override, ...headerOptions } = options;
  const additions = securityHeaders(headerOptions);
  if (response.status < 200 || response.status > 599) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(additions)) {
    if (override === true || !headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
