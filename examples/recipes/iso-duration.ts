// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: ISO 8601 durations (parse "P1Y2M3DT4H5M6.5S", exact milliseconds, format). Original source; copy and adapt.
// Years and months have no fixed length, so durationMilliseconds refuses them: add those to a calendar
// date instead. Weeks are 7 days and days are 24 hours (no DST adjustment). Values must stay within
// Number.MAX_SAFE_INTEGER.

export interface Duration {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  milliseconds: number;
}

const PATTERN = /^P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\.([0-9]{1,3}))?S)?)?$/;

function safe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError("duration exceeds Number.MAX_SAFE_INTEGER");
  return value;
}

/** Strict, uppercase-only grammar; a "T" must be followed by a time component; fractions only on seconds. */
export function parseDuration(s: string): Duration {
  const m = typeof s === "string" ? PATTERN.exec(s) : null;
  if (!m || s.endsWith("T")) throw new RangeError(`invalid ISO 8601 duration: ${JSON.stringify(s)}`);
  const parts = m.slice(1, 8);
  if (parts.every((p) => p === undefined)) throw new RangeError(`ISO 8601 duration needs at least one component: ${JSON.stringify(s)}`);
  const n = (i: number): number => safe(Number(m[i] ?? "0"));
  const fraction = m[8] === undefined ? 0 : Number(m[8].padEnd(3, "0"));
  return {
    years: n(1), months: n(2), weeks: n(3), days: n(4), hours: n(5), minutes: n(6),
    milliseconds: safe(n(7) * 1000 + fraction),
  };
}

/** Exact length in milliseconds; throws when years or months are non-zero. */
export function durationMilliseconds(d: Duration): number {
  if (d.years !== 0 || d.months !== 0) throw new RangeError("years and months have no exact length; apply them to a calendar date");
  return safe(((((d.weeks * 7 + d.days) * 24 + d.hours) * 60 + d.minutes) * 60) * 1000 + d.milliseconds);
}

/** Days, hours, minutes and seconds with up to 3 fractional digits; 0 -> "PT0S". */
export function formatDuration(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError("milliseconds must be a non-negative safe integer");
  const days = Math.floor(ms / 86_400_000);
  let rest = ms % 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest %= 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest %= 60_000;
  const seconds = Math.floor(rest / 1000);
  const fraction = rest % 1000;
  let time = (hours ? `${hours}H` : "") + (minutes ? `${minutes}M` : "");
  if (seconds || fraction) time += `${seconds}${fraction ? "." + String(fraction).padStart(3, "0").replace(/0+$/, "") : ""}S`;
  const out = "P" + (days ? `${days}D` : "") + (time ? `T${time}` : "");
  return out === "P" ? "PT0S" : out;
}
