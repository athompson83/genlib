// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: UTC-safe calendar dates, ranges and business days. Original source; copy and adapt.
// Works on date-only "YYYY-MM-DD" strings, converted to whole UTC day numbers, so local
// time zones and daylight-saving changes never shift a day. Convert timestamps to the
// business's calendar date (in its own time zone) before using these helpers.

export type IsoDate = string;
export interface DateRange { start: IsoDate; end: IsoDate } // inclusive
export interface BusinessCalendar {
  /** Weekend days as 0=Sunday..6=Saturday (default Saturday and Sunday). */
  weekend?: readonly number[];
  /** Non-working dates. Holiday rules are jurisdiction-specific; supply a reviewed list. */
  holidays?: Iterable<IsoDate>;
}

const DAY_MS = 86_400_000;

/** Parses a strict YYYY-MM-DD date into a UTC day number (days since 1970-01-01). */
export function toDayNumber(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected YYYY-MM-DD, received ${date}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) throw new RangeError(`Invalid calendar date: ${date}`);
  return Math.round(ms / DAY_MS);
}

export function fromDayNumber(day: number): IsoDate {
  if (!Number.isSafeInteger(day)) throw new RangeError("Day number must be an integer");
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar date of an instant in a given IANA time zone, e.g. todayIn("America/New_York"). */
export function dateInTimeZone(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const addDays = (date: IsoDate, days: number): IsoDate => fromDayNumber(toDayNumber(date) + days);
export const daysBetween = (from: IsoDate, to: IsoDate): number => toDayNumber(to) - toDayNumber(from);
export const weekday = (date: IsoDate): number => (((toDayNumber(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday

/** Every date from start to end inclusive. Guarded against accidental huge ranges. */
export function eachDay(range: DateRange, maxDays = 3660): IsoDate[] {
  const start = toDayNumber(range.start);
  const end = toDayNumber(range.end);
  if (end < start) throw new RangeError("Range end is before start");
  if (end - start + 1 > maxDays) throw new RangeError("Range exceeds maxDays");
  return Array.from({ length: end - start + 1 }, (_, i) => fromDayNumber(start + i));
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return toDayNumber(a.start) <= toDayNumber(b.end) && toDayNumber(b.start) <= toDayNumber(a.end);
}

function calendar(cal: BusinessCalendar) {
  const weekend = new Set(cal.weekend ?? [0, 6]);
  if (weekend.size >= 7) throw new RangeError("A calendar needs at least one working weekday");
  const holidays = new Set(Array.from(cal.holidays ?? [], toDayNumber));
  return (day: number) => !weekend.has((((day + 4) % 7) + 7) % 7) && !holidays.has(day);
}

export function isBusinessDay(date: IsoDate, cal: BusinessCalendar = {}): boolean {
  return calendar(cal)(toDayNumber(date));
}

/** Business days in the inclusive range. */
export function countBusinessDays(range: DateRange, cal: BusinessCalendar = {}): number {
  const isWorking = calendar(cal);
  const start = toDayNumber(range.start);
  const end = toDayNumber(range.end);
  if (end < start) throw new RangeError("Range end is before start");
  let count = 0;
  for (let d = start; d <= end; d++) if (isWorking(d)) count++;
  return count;
}

/** Moves n business days forward (or backward when negative); n = 0 rolls forward to a business day. */
export function addBusinessDays(date: IsoDate, n: number, cal: BusinessCalendar = {}): IsoDate {
  if (!Number.isSafeInteger(n)) throw new RangeError("n must be an integer");
  const isWorking = calendar(cal);
  let day = toDayNumber(date);
  if (n === 0) { while (!isWorking(day)) day++; return fromDayNumber(day); }
  const step = n > 0 ? 1 : -1;
  for (let left = Math.abs(n); left > 0;) { day += step; if (isWorking(day)) left--; }
  return fromDayNumber(day);
}
