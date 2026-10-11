// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: ISO 8601 week dates (weeks start Monday; week 1 holds the year's first Thursday). Original source.
// Proleptic Gregorian years 1..9999 with plain day-number arithmetic (no Date, no time zones, no locale).
// Weekday is 1 (Monday) .. 7 (Sunday). parseIsoWeek accepts "2026-W41-7", "2026W417" and "2026-W41" (weekday 1).
// Invalid dates and out-of-range weeks throw RangeError. Same results as the Genlib Python, Go, Rust, Java,
// Kotlin, C#, Swift and Dart iso-week modules (shared vectors, including years 1 and 9999).

/** [year, month, day] or [weekYear, week, weekday]. */
export type Triple = [number, number, number];

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number): number => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

function dayNumber(y: number, m: number, d: number): number {
  if (![y, m, d].every(Number.isInteger) || y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) {
    throw new RangeError(`invalid date: ${y}-${m}-${d}`);
  }
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

function civil(z: number): Triple {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, doy - Math.floor((153 * mp + 2) / 5) + 1];
}

const weekdayOf = (day: number): number => ((((day + 3) % 7) + 7) % 7) + 1; // day 0 (1970-01-01) was a Thursday

/** [weekYear, week, weekday] for a calendar date. */
export function isoWeek(year: number, month: number, day: number): Triple {
  const n = dayNumber(year, month, day);
  const thursday = n + 4 - weekdayOf(n);
  const wy = civil(thursday)[0];
  return [wy, Math.floor((thursday - dayNumber(wy, 1, 1)) / 7) + 1, weekdayOf(n)];
}

/** 52 or 53: the number of ISO weeks in the given week-numbering year. */
export function weeksInYear(year: number): number {
  return isoWeek(year, 12, 28)[1];
}

/** [year, month, day] for an ISO week date; week must be 1..weeksInYear and weekday 1..7. */
export function fromIsoWeek(weekYear: number, week: number, weekday: number): Triple {
  if (![weekYear, week, weekday].every(Number.isInteger) || weekYear < 1 || weekYear > 9999 || weekday < 1 || weekday > 7
    || week < 1 || week > weeksInYear(weekYear)) throw new RangeError("invalid ISO week date");
  const jan4 = dayNumber(weekYear, 1, 4);
  const date = civil(jan4 - weekdayOf(jan4) + 1 + (week - 1) * 7 + weekday - 1);
  if (date[0] < 1 || date[0] > 9999) throw new RangeError("ISO week date is outside years 1..9999");
  return date;
}

/** "YYYY-Www-D" for a calendar date. */
export function formatIsoWeek(year: number, month: number, day: number): string {
  const [wy, w, wd] = isoWeek(year, month, day);
  return `${String(wy).padStart(4, "0")}-W${String(w).padStart(2, "0")}-${wd}`;
}

/** [year, month, day] for "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1). */
export function parseIsoWeek(text: string): Triple {
  const m = /^([0-9]{4})-?W([0-9]{2})(?:-?([1-7]))?$/.exec(text);
  if (!m) throw new RangeError("not an ISO week date");
  return fromIsoWeek(Number(m[1]), Number(m[2]), Number(m[3] ?? 1));
}
