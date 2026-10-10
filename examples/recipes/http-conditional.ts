// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: ETags and conditional requests (RFC 9110 section 13). Original source; copy and adapt.
// evaluateConditional applies the RFC 13.2.2 order and returns 200 (proceed), 304 (Not Modified, for
// GET/HEAD) or 412 (Precondition Failed). If-Match uses strong comparison, If-None-Match weak. Dates
// must be exact IMF-fixdate ("Wed, 21 Oct 2026 07:28:00 GMT"); other formats are ignored.

export interface ConditionalRequest {
  method: string;
  etag?: string;           // current representation's entity tag, e.g. "\"v2\"" or "W/\"v2\""
  lastModified?: number;   // unix seconds
  ifMatch?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  ifUnmodifiedSince?: string;
}

const ETAG = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/;
const DATE = /^([A-Z][a-z]{2}), ([0-9]{2}) ([A-Z][a-z]{2}) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$/;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const trimSpTab = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, "");

/** "*" or the valid entity tags among the comma-separated items (invalid items are ignored). */
export function parseEtags(header: string): "*" | string[] {
  const h = trimSpTab(header);
  if (h === "*") return "*";
  return h.split(",").map(trimSpTab).filter((p) => ETAG.test(p));
}

const opaque = (tag: string): string => (tag.startsWith("W/") ? tag.slice(2) : tag);
export const strongMatch = (a: string, b: string): boolean => !a.startsWith("W/") && !b.startsWith("W/") && a === b;
export const weakMatch = (a: string, b: string): boolean => opaque(a) === opaque(b);

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** Unix seconds -> IMF-fixdate. */
export function formatHttpDate(seconds: number): string {
  if (!Number.isSafeInteger(seconds)) throw new RangeError("seconds must be an integer");
  const d = new Date(seconds * 1000);
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCFullYear(), 4)} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

/** Unix seconds for an exact IMF-fixdate, else null (a value that does not round-trip is ignored). */
export function parseHttpDate(text: string): number | null {
  const m = DATE.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[3] ?? "");
  const [year, day, h, mi, s] = [m[4], m[2], m[5], m[6], m[7]].map(Number) as [number, number, number, number, number];
  if (month < 0 || year < 1 || day < 1 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(h, mi, s, 0);
  const seconds = date.getTime() / 1000;
  return formatHttpDate(seconds) === text ? seconds : null;
}

export function evaluateConditional(req: ConditionalRequest): 200 | 304 | 412 {
  const { etag, lastModified } = req;
  const safe = req.method === "GET" || req.method === "HEAD";
  if (req.ifMatch !== undefined) {
    const tags = parseEtags(req.ifMatch);
    if (tags === "*") {
      if (etag === undefined) return 412;
    } else if (etag === undefined || !tags.some((t) => strongMatch(t, etag))) return 412;
  } else if (req.ifUnmodifiedSince !== undefined && lastModified !== undefined) {
    const d = parseHttpDate(req.ifUnmodifiedSince);
    if (d !== null && lastModified > d) return 412;
  }
  if (req.ifNoneMatch !== undefined) {
    const tags = parseEtags(req.ifNoneMatch);
    const hit = etag !== undefined && (tags === "*" || tags.some((t) => weakMatch(t, etag)));
    if (hit) return safe ? 304 : 412;
  } else if (req.ifModifiedSince !== undefined && safe && lastModified !== undefined) {
    const d = parseHttpDate(req.ifModifiedSince);
    if (d !== null && lastModified <= d) return 304;
  }
  return 200;
}
