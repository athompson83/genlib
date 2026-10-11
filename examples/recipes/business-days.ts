// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: business days over strict ISO dates (YYYY-MM-DD). Original source; copy and adapt.
// Proleptic Gregorian civil-date math (no Date parsing, no time zones), configurable weekend (MO..SU codes,
// default SA and SU, never all seven) and holidays. businessDaysBetween counts [start, end) in O(1) weeks plus
// the holiday list. Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart modules.
// examples/recipes/date-ranges.ts covers ranges and overlaps with numeric weekday sets; use either.

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
/** Largest |n| accepted by addBusinessDays. */
export const MAX_STEPS = 100000;

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y, era = Math.floor(yy / 400), yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
function civilFromDays(z: number): string {
  const zz = z + 719468, era = Math.floor(zz / 146097), doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const m = mp + (mp < 10 ? 3 : -9), y = yoe + era * 400 + (m <= 2 ? 1 : 0), d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const weekday = (day: number): number => (((day + 3) % 7) + 7) % 7; // 0 = Monday

function parseDate(text: string): number {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text);
  if (!m) throw new RangeError("date must be YYYY-MM-DD");
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const dim = mo === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31;
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > dim) throw new RangeError(`invalid date: ${text}`);
  return daysFromCivil(y, mo, d);
}

function config(holidays: readonly string[], weekend: readonly string[]): [Set<number>, Set<number>] {
  const days = new Set<number>();
  for (const code of weekend) {
    const i = WEEKDAYS.indexOf(code);
    if (i < 0) throw new RangeError("weekend days are MO..SU");
    days.add(i);
  }
  if (days.size === 7) throw new RangeError("weekend cannot be every day");
  return [new Set(holidays.map(parseDate)), days];
}

/** True when date is neither a weekend day nor a holiday. */
export function isBusinessDay(date: string, holidays: readonly string[] = [], weekend: readonly string[] = ["SA", "SU"]): boolean {
  const [hol, wk] = config(holidays, weekend), d = parseDate(date);
  return !wk.has(weekday(d)) && !hol.has(d);
}

/** The date n business days after date (before when n < 0); n = 0 rolls forward to a business day. */
export function addBusinessDays(date: string, n: number, holidays: readonly string[] = [], weekend: readonly string[] = ["SA", "SU"]): string {
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_STEPS) throw new RangeError(`n must be an integer within ±${MAX_STEPS}`);
  const [hol, wk] = config(holidays, weekend);
  let d = parseDate(date);
  const ok = (x: number): boolean => !wk.has(weekday(x)) && !hol.has(x);
  if (n === 0) {
    while (!ok(d)) d++;
    return civilFromDays(d);
  }
  const step = n > 0 ? 1 : -1;
  for (let left = Math.abs(n); left > 0;) {
    d += step;
    if (ok(d)) left--;
  }
  return civilFromDays(d);
}

/** Business days in [start, end) (start counted, end not); negative when end is before start. */
export function businessDaysBetween(start: string, end: string, holidays: readonly string[] = [], weekend: readonly string[] = ["SA", "SU"]): number {
  const [hol, wk] = config(holidays, weekend);
  let a = parseDate(start), b = parseDate(end), sign = 1;
  if (b < a) [a, b, sign] = [b, a, -1];
  const full = Math.floor((b - a) / 7), rem = (b - a) % 7;
  let count = full * (7 - wk.size);
  for (let i = 0; i < rem; i++) if (!wk.has(weekday(a + full * 7 + i))) count++;
  for (const h of hol) if (h >= a && h < b && !wk.has(weekday(h))) count--;
  return count === 0 ? 0 : sign * count; // never -0
}
