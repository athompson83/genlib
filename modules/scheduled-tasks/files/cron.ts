// SPDX-License-Identifier: Apache-2.0
// Five-field cron parsing and next-run computation in any IANA time zone, using only Intl.DateTimeFormat.
// Fields: minute hour day-of-month month day-of-week. Each field is a comma list of *, N, A-B or a name
// (JAN-DEC, SUN-SAT), with an optional /step (N/step runs from N to the field maximum). Day-of-week 0 and 7 are
// Sunday. Macros: @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly.
// Vixie rule: when both day fields are restricted (neither starts with *), a day matches if EITHER matches;
// otherwise both must match. Not supported: seconds, ?, L, W, #, @reboot.
// Time zones: schedules match local wall-clock minutes. A wall time skipped by a spring-forward transition runs
// once at the first instant after the gap; a wall time repeated by a fall-back transition runs once, at its first
// occurrence. Every occurrence is a distinct epoch-millisecond instant.

export interface CronSchedule {
  readonly source: string;
  readonly minute: ReadonlySet<number>;
  readonly hour: ReadonlySet<number>;
  readonly dayOfMonth: ReadonlySet<number>;
  readonly month: ReadonlySet<number>;
  /** 0-6, Sunday is 0 (7 in the expression is folded into 0). */
  readonly dayOfWeek: ReadonlySet<number>;
  readonly dayOfMonthRestricted: boolean;
  readonly dayOfWeekRestricted: boolean;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Longest search for the next run: covers the 8-year gap between leap days around 2100 and rare weekday matches. */
const SEARCH_MS = 29 * 366 * DAY;
const MAX_TIME = Date.UTC(9999, 11, 31, 23, 59);

const MACROS: Readonly<Record<string, string>> = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *",
};
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface FieldSpec { readonly name: string; readonly min: number; readonly max: number; readonly names?: readonly string[]; readonly nameBase?: number }
const FIELDS: readonly FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTHS, nameBase: 1 },
  { name: "day-of-week", min: 0, max: 7, names: DAYS, nameBase: 0 },
];

function parseField(text: string, spec: FieldSpec): boolean[] {
  const { name, min, max } = spec;
  const values = new Array<boolean>(max + 1).fill(false);
  const value = (s: string | undefined): number => {
    if (s !== undefined && spec.names && /^[A-Za-z]{3}$/.test(s)) {
      const index = spec.names.indexOf(s.toUpperCase());
      if (index >= 0) return index + (spec.nameBase ?? 0);
    }
    if (s === undefined || !/^\d{1,2}$/.test(s)) throw new RangeError(`invalid ${name} value: ${JSON.stringify(s ?? "")}`);
    const n = Number(s);
    if (n < min || n > max) throw new RangeError(`${name} value ${n} is outside ${min}-${max}`);
    return n;
  };
  for (const item of text.split(",")) {
    const [range, stepText, extra] = item.split("/");
    if (extra !== undefined || range === undefined || range === "") throw new RangeError(`invalid ${name} item: ${JSON.stringify(item)}`);
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d{1,2}$/.test(stepText) || Number(stepText) < 1 || Number(stepText) > max) throw new RangeError(`invalid ${name} step: ${JSON.stringify(stepText)}`);
      step = Number(stepText);
    }
    let low: number;
    let high: number;
    if (range === "*") [low, high] = [min, max];
    else if (range.includes("-")) {
      const [a, b, more] = range.split("-");
      if (more !== undefined) throw new RangeError(`invalid ${name} range: ${JSON.stringify(range)}`);
      [low, high] = [value(a), value(b)];
      if (low > high) throw new RangeError(`${name} range ${range} is reversed`);
    } else {
      low = value(range);
      high = stepText === undefined ? low : max;
    }
    for (let v = low; v <= high; v += step) values[v] = true;
  }
  return values;
}

const toSet = (values: boolean[]): ReadonlySet<number> => new Set(values.flatMap((on, i) => (on ? [i] : [])));

/** Parses and validates an expression; throws RangeError naming the failing field. */
export function parseCron(expression: string): CronSchedule {
  if (typeof expression !== "string" || expression.length > 256) throw new RangeError("cron expression must be a string of at most 256 characters");
  let text = expression.trim();
  if (text.startsWith("@")) {
    const macro = MACROS[text.toLowerCase()];
    if (macro === undefined) throw new RangeError(`unsupported cron macro: ${JSON.stringify(text)}`);
    text = macro;
  }
  const parts = text.split(/\s+/);
  if (parts.length !== 5 || parts.some((p) => p.length === 0)) throw new RangeError("cron expression must have exactly 5 fields");
  const parsed = parts.map((part, i) => parseField(part, FIELDS[i]!));
  const dow = parsed[4]!;
  if (dow[7]) dow[0] = true;
  dow.length = 7;
  return {
    source: parts.join(" "),
    minute: toSet(parsed[0]!), hour: toSet(parsed[1]!), dayOfMonth: toSet(parsed[2]!), month: toSet(parsed[3]!), dayOfWeek: toSet(dow),
    dayOfMonthRestricted: !parts[2]!.startsWith("*"), dayOfWeekRestricted: !parts[4]!.startsWith("*"),
  };
}

// ---------------------------------------------------------------- time zones

interface Zone { readonly name: string; offsetAt(instant: number): number }
const zones = new Map<string, Zone>();
const UTC_ZONE: Zone = { name: "UTC", offsetAt: () => 0 };

/** Returns the canonical IANA name (for example "America/New_York"); throws RangeError for an unknown zone. */
export function resolveTimeZone(timeZone: string): string {
  return zone(timeZone).name;
}

function zone(timeZone: string): Zone {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) throw new RangeError("invalid time zone");
  const cached = zones.get(timeZone);
  if (cached) return cached;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
  } catch {
    throw new RangeError(`unknown time zone: ${JSON.stringify(timeZone)}`);
  }
  const name = format.resolvedOptions().timeZone;
  const result: Zone = name === "UTC" || name === "Etc/UTC" ? { ...UTC_ZONE, name } : {
    name,
    offsetAt(instant) {
      const seconds = Math.floor(instant / 1000) * 1000;
      const fields: Record<string, number> = {};
      for (const part of format.formatToParts(seconds)) if (part.type !== "literal") fields[part.type] = Number(part.value);
      const wall = Date.UTC(fields.year ?? 1970, (fields.month ?? 1) - 1, fields.day ?? 1, (fields.hour ?? 0) % 24, fields.minute ?? 0, fields.second ?? 0);
      return wall - seconds;
    },
  };
  if (zones.size > 500) zones.clear();
  zones.set(timeZone, result);
  return result;
}

export interface WallTimeResolution {
  /** Instants showing this local wall time: one normally, two in a fall-back overlap (earliest first), none in a gap. */
  readonly instants: number[];
  /** For a wall time inside a spring-forward gap, the first valid instant after the gap; otherwise null. */
  readonly gapEnd: number | null;
}

/**
 * Converts a local wall time (expressed as the epoch ms of the same fields in UTC) to instants in `timeZone`.
 * Assumes at most one offset transition within 26 hours, which holds for current tz data.
 */
export function wallTimeToInstant(wall: number, timeZone: string): WallTimeResolution {
  return resolveWall(zone(timeZone), wall);
}

function resolveWall(z: Zone, wall: number): WallTimeResolution {
  const before = z.offsetAt(wall - 15 * HOUR);
  const after = z.offsetAt(wall + 13 * HOUR);
  const candidates = new Set([before, after, z.offsetAt(wall)]);
  const instants: number[] = [];
  for (const offset of candidates) {
    const instant = wall - offset;
    if (z.offsetAt(instant) === offset) instants.push(instant);
  }
  instants.sort((a, b) => a - b);
  if (instants.length > 0 || after <= before) return { instants, gapEnd: null };
  // Spring-forward gap: the transition lies in (wall - after, wall - before]. Find it to the second.
  let lo = wall - after;
  let hi = wall - before;
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
    if (mid <= lo) break;
    if (z.offsetAt(mid) === before) lo = mid; else hi = mid;
  }
  return { instants, gapEnd: hi };
}

/** The instant a matching wall time runs at: its first occurrence, or the end of the gap it falls into. */
function runInstant(z: Zone, wall: number): number {
  const { instants, gapEnd } = resolveWall(z, wall);
  return instants[0] ?? gapEnd ?? wall;
}

// ---------------------------------------------------------------- next run

function dayMatches(s: CronSchedule, date: Date): boolean {
  const dom = s.dayOfMonth.has(date.getUTCDate());
  const dow = s.dayOfWeek.has(date.getUTCDay());
  return s.dayOfMonthRestricted && s.dayOfWeekRestricted ? dom || dow : dom && dow;
}

/** First matching wall minute at or after `from` (wall ms, minute aligned), or null past `limit`. */
function nextMatchingWall(s: CronSchedule, from: number, limit: number): number | null {
  let t = from;
  while (t <= limit && t <= MAX_TIME) {
    const d = new Date(t);
    const [y, mo, day, h] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()];
    if (!s.month.has(mo + 1)) t = Date.UTC(y, mo + 1, 1);
    else if (!dayMatches(s, d)) t = Date.UTC(y, mo, day + 1);
    else if (!s.hour.has(h)) t = Date.UTC(y, mo, day, h + 1);
    else if (!s.minute.has(d.getUTCMinutes())) t += MINUTE;
    else return t;
  }
  return null;
}

const asSchedule = (cron: CronSchedule | string): CronSchedule => (typeof cron === "string" ? parseCron(cron) : cron);

/** First run strictly after `after` (epoch ms) in `timeZone` (default UTC), or null when none within 29 years. */
export function nextOccurrence(cron: CronSchedule | string, after: number, timeZone = "UTC"): number | null {
  if (!Number.isFinite(after)) throw new RangeError("after must be epoch milliseconds");
  const s = asSchedule(cron);
  const z = zone(timeZone);
  const wallAfter = after + z.offsetAt(after);
  let from = Math.floor(wallAfter / MINUTE) * MINUTE + MINUTE;
  const limit = from + SEARCH_MS;
  for (;;) {
    const wall = nextMatchingWall(s, from, limit);
    if (wall === null) return null;
    const instant = runInstant(z, wall);
    // Inside a repeated (fall-back) hour, wall times just after `after` may already have run at their first instant.
    if (instant > after) return instant;
    from = wall + MINUTE;
  }
}

/** The next `count` runs after `after`. */
export function nextOccurrences(cron: CronSchedule | string, after: number, count: number, timeZone = "UTC"): number[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > 10_000) throw new RangeError("count must be 0-10000");
  const s = asSchedule(cron);
  const out: number[] = [];
  let t: number | null = after;
  while (out.length < count && (t = nextOccurrence(s, t, timeZone)) !== null) out.push(t);
  return out;
}

/**
 * The latest `limit` runs in [from, to], oldest first. The search window grows backwards from `to`, so the cost
 * depends on `limit`, not on how long ago `from` is.
 */
export function latestOccurrences(cron: CronSchedule | string, from: number, to: number, limit: number, timeZone = "UTC"): number[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError("limit must be 1-10000");
  if (to < from) return [];
  const s = asSchedule(cron);
  for (let window = HOUR; ; window *= 8) {
    const start = Math.max(from, to - window);
    const found: number[] = [];
    let t = nextOccurrence(s, start - 1, timeZone);
    while (t !== null && t <= to) {
      found.push(t);
      if (found.length > limit) found.shift();
      t = nextOccurrence(s, t, timeZone);
    }
    if (found.length >= limit || start === from) return found;
  }
}
