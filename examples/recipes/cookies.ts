// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Set-Cookie serialization and Cookie header parsing (RFC 6265 plus current browser
// rules for SameSite=None, Partitioned, __Secure- and __Host-). Original source; copy and adapt.
// Values must already be cookie-octets: encode anything else (for example encodeURIComponent) first.
// Serialization throws RangeError for unsafe or inconsistent attributes.

export interface CookieOptions {
  maxAge?: number;       // seconds, non-negative integer
  expires?: number;      // unix seconds, written as IMF-fixdate
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  partitioned?: boolean;
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const OCTETS = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;
const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const DOMAIN = new RegExp(`^\\.?${LABEL}(?:\\.${LABEL})*$`);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

function imfFixdate(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCFullYear(), 4)} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const { maxAge, expires, domain, path, secure = false, httpOnly = false, sameSite, partitioned = false } = options;
  if (typeof name !== "string" || !TOKEN.test(name)) throw new RangeError("cookie name must be an RFC 7230 token");
  if (typeof value !== "string" || !OCTETS.test(value)) throw new RangeError("cookie value has characters outside cookie-octet; encode it first");
  if (domain !== undefined && !DOMAIN.test(domain)) throw new RangeError("invalid cookie Domain");
  if (path !== undefined && (!path.startsWith("/") || /[\x00-\x1f\x7f;]/.test(path))) throw new RangeError("cookie Path must start with / and contain no controls or ';'");
  if (sameSite !== undefined && !["Strict", "Lax", "None"].includes(sameSite)) throw new RangeError("SameSite must be Strict, Lax or None");
  if (sameSite === "None" && !secure) throw new RangeError("SameSite=None requires Secure");
  if (partitioned && !secure) throw new RangeError("Partitioned requires Secure");
  if (name.startsWith("__Secure-") && !secure) throw new RangeError("__Secure- cookies require Secure");
  if (name.startsWith("__Host-") && (!secure || domain !== undefined || path !== "/")) throw new RangeError("__Host- cookies require Secure, Path=/ and no Domain");
  if (maxAge !== undefined && (!Number.isSafeInteger(maxAge) || maxAge < 0)) throw new RangeError("maxAge must be a non-negative integer");
  if (expires !== undefined && !Number.isSafeInteger(expires)) throw new RangeError("expires must be integer unix seconds");
  const out = [`${name}=${value}`];
  if (maxAge !== undefined) out.push(`Max-Age=${maxAge}`);
  if (expires !== undefined) out.push(`Expires=${imfFixdate(expires)}`);
  if (domain !== undefined) out.push(`Domain=${domain.toLowerCase()}`);
  if (path !== undefined) out.push(`Path=${path}`);
  if (secure) out.push("Secure");
  if (httpOnly) out.push("HttpOnly");
  if (sameSite !== undefined) out.push(`SameSite=${sameSite}`);
  if (partitioned) out.push("Partitioned");
  return out.join("; ");
}

/** Ordered [name, value] pairs from a Cookie request header; duplicates are kept in order. */
export function parseCookieHeader(header: string): [string, string][] {
  const out: [string, string][] = [];
  for (const piece of header.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 0) continue;
    const name = piece.slice(0, eq).replace(/^[ \t]+|[ \t]+$/g, "");
    let value = piece.slice(eq + 1).replace(/^[ \t]+|[ \t]+$/g, "");
    if (name === "") continue;
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out.push([name, value]);
  }
  return out;
}
