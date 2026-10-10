// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: exponential backoff with full jitter and HTTP Retry-After parsing. Original source; copy and adapt.
// Pure functions: pass the random fraction and the current time so delays are testable. Retry only
// idempotent operations (or ones with an idempotency key), cap total attempts and honor Retry-After.

/**
 * Full-jitter delay: floor(randomFraction * min(capMs, baseMs * 2^attempt)).
 * The cap is applied before multiplying by the fraction, so huge attempts cannot overflow.
 */
export function backoffDelay(attempt: number, baseMs: number, capMs: number, randomFraction: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a non-negative integer");
  if (!Number.isFinite(baseMs) || baseMs <= 0) throw new RangeError("baseMs must be a positive number");
  if (!Number.isFinite(capMs) || capMs < baseMs) throw new RangeError("capMs must be a finite number >= baseMs");
  if (!(randomFraction >= 0 && randomFraction < 1)) throw new RangeError("randomFraction must be in [0, 1)");
  let ceiling = baseMs;
  for (let i = 0; i < attempt && ceiling < capMs; i++) ceiling *= 2;
  return Math.floor(randomFraction * Math.min(capMs, ceiling));
}

/** Uses crypto.getRandomValues for the jitter fraction. */
export function randomBackoffDelay(attempt: number, baseMs: number, capMs: number): number {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error("crypto.getRandomValues is not available in this runtime");
  const word = c.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return backoffDelay(attempt, baseMs, capMs, word / 2 ** 32);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IMF_FIXDATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/** Parses an RFC 9110 IMF-fixdate (e.g. "Wed, 21 Oct 2026 07:28:00 GMT") to Unix ms, or null. */
export function parseImfFixdate(text: string): number | null {
  const m = IMF_FIXDATE.exec(text);
  if (!m) return null;
  const [day, month, year, hour, minute, second] = [Number(m[2]), MONTHS.indexOf(m[3] ?? ""), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7])];
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month, day, hour, minute, second);
  const date = new Date(ms);
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month || DAYS[date.getUTCDay()] !== m[1]) return null;
  return ms;
}

/**
 * Retry-After header to a wait in ms: delay-seconds -> seconds * 1000; an IMF-fixdate ->
 * max(0, date - nowMs). Returns null for anything else (fall back to backoffDelay).
 */
export function retryAfterMs(headerValue: string, nowMs: number): number | null {
  if (!Number.isFinite(nowMs)) throw new RangeError("nowMs must be a finite number");
  if (typeof headerValue !== "string") return null;
  const value = headerValue.trim();
  if (/^\d+$/.test(value)) {
    const ms = Number(value) * 1000;
    return Number.isSafeInteger(ms) ? ms : null;
  }
  const at = parseImfFixdate(value);
  return at === null ? null : Math.max(0, at - nowMs);
}
