// SPDX-License-Identifier: Apache-2.0
// RFC 5545 RRULE parsing, canonical formatting and expansion over local wall-clock time. Extends the Genlib
// `rrule` capability (UTC subset matching python-dateutil) with BYSETPOS, WKST, mixed plain/ordinal BYDAY,
// local and DATE forms of UNTIL, and direct jumps to the period that contains a window start.
// Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (ordinals with MONTHLY/YEARLY),
// BYMONTHDAY, BYMONTH, BYSETPOS, WKST. Refused with "unsupported-rule": SECONDLY/MINUTELY/HOURLY, BYSECOND,
// BYMINUTE, BYHOUR, BYYEARDAY, BYWEEKNO, RSCALE, SKIP. Everything else malformed is "invalid-rule".
// "Wall" values are local date-times encoded as the epoch milliseconds of the same fields in UTC.
import { RecurringEventsError } from "./errors.js";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export interface WeekdayNum { readonly ordinal: number; readonly weekday: number }
/** UNTIL as a UTC instant (…Z), or as a local wall time in the event's zone (floating or DATE form). */
export type RuleUntil = { readonly utc: true; readonly instant: number } | { readonly utc: false; readonly wall: number; readonly date: boolean };

export interface RecurrenceRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly count: number | null;
  readonly until: RuleUntil | null;
  /** weekday 0 = Monday … 6 = Sunday; ordinal 0 = every such weekday in the period. */
  readonly byday: readonly WeekdayNum[];
  readonly bymonthday: readonly number[];
  readonly bymonth: readonly number[];
  readonly bysetpos: readonly number[];
  readonly wkst: number;
}

export interface ExpandStats { periods: number }

export const DAY_MS = 86_400_000;
export const MAX_COUNT = 10_000;
/** Most periods one expansion scans before giving up (about 274 years of DAILY periods). */
export const MAX_PERIODS = 100_000;
const MAX_RULE_LENGTH = 1000;
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const SUPPORTED = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH", "BYSETPOS", "WKST"]);
const UNSUPPORTED = new Set(["BYSECOND", "BYMINUTE", "BYHOUR", "BYYEARDAY", "BYWEEKNO", "RSCALE", "SKIP"]);

// ---------------------------------------------------------------- civil calendar math

/** Days since 1970-01-01 for a proleptic Gregorian date (month 1-12). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y, era = Math.floor(yy / 400), yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
export function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468, era = Math.floor(zz / 146097), doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, doy - Math.floor((153 * mp + 2) / 5) + 1];
}
export const isLeap = (y: number): boolean => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
export const daysInMonth = (y: number, m: number): number => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
/** 0 = Monday (1970-01-01 was a Thursday). */
export const weekdayOf = (days: number): number => (((days + 3) % 7) + 7) % 7;

const fail = (message: string): never => { throw new RecurringEventsError("invalid-rule", message, "rrule"); };

/** Parses YYYYMMDD[THHMMSS[Z]] into wall milliseconds plus its form. */
function parseStamp(text: string): { wall: number; utc: boolean; date: boolean } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(text);
  if (!m) return fail(`invalid UNTIL: ${JSON.stringify(text)}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = m[4] === undefined;
  const [h, mi, s] = date ? [23, 59, 59] : [Number(m[4]), Number(m[5]), Number(m[6])];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) fail(`invalid UNTIL: ${JSON.stringify(text)}`);
  return { wall: daysFromCivil(y, mo, d) * DAY_MS + ((h * 60 + mi) * 60 + s) * 1000, utc: m[7] === "Z", date };
}

function integer(text: string, lo: number, hi: number, signed: boolean, label: string): number {
  if (!(signed ? /^[+-]?\d{1,6}$/ : /^\+?\d{1,6}$/).test(text)) return fail(`invalid ${label}: ${JSON.stringify(text)}`);
  const n = Number(text);
  if (Math.abs(n) < lo || Math.abs(n) > hi) fail(`invalid ${label}: ${JSON.stringify(text)}`);
  return n;
}

function list(text: string, label: string): string[] {
  const items = text.split(",");
  if (items.length > 400 || items.some((item) => item === "")) fail(`invalid ${label} list`);
  return items;
}

const uniqueSorted = (values: number[]): number[] => [...new Set(values)].sort((a, b) => a - b);

/** Parses and validates a rule ("RRULE:" prefix optional, case-insensitive). */
export function parseRRule(text: string): RecurrenceRule {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_RULE_LENGTH) return fail("rule must be a non-empty string of at most 1000 characters");
  const body = text.trim().replace(/^RRULE:/i, "").toUpperCase();
  const parts = new Map<string, string>();
  for (const piece of body.split(";")) {
    const eq = piece.indexOf("=");
    if (eq <= 0 || eq === piece.length - 1) fail(`malformed rule part: ${JSON.stringify(piece)}`);
    const key = piece.slice(0, eq);
    if (parts.has(key)) fail(`duplicate rule part: ${key}`);
    parts.set(key, piece.slice(eq + 1));
  }
  for (const key of parts.keys()) {
    if (UNSUPPORTED.has(key)) throw new RecurringEventsError("unsupported-rule", `${key} is not supported`, "rrule");
    if (!SUPPORTED.has(key)) fail(`unknown rule part: ${key}`);
  }
  const freq = parts.get("FREQ");
  if (freq === "SECONDLY" || freq === "MINUTELY" || freq === "HOURLY") throw new RecurringEventsError("unsupported-rule", `FREQ=${freq} is not supported`, "rrule");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return fail("FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY");
  if (parts.has("COUNT") && parts.has("UNTIL")) fail("COUNT and UNTIL cannot both be set");

  const get = (key: string): string | undefined => parts.get(key);
  const interval = get("INTERVAL") === undefined ? 1 : integer(get("INTERVAL") ?? "", 1, 9999, false, "INTERVAL");
  const count = get("COUNT") === undefined ? null : integer(get("COUNT") ?? "", 1, MAX_COUNT, false, "COUNT");
  let until: RuleUntil | null = null;
  const untilText = get("UNTIL");
  if (untilText !== undefined) {
    const stamp = parseStamp(untilText);
    until = stamp.utc ? { utc: true, instant: stamp.wall } : { utc: false, wall: stamp.wall, date: stamp.date };
  }
  const bymonth = get("BYMONTH") === undefined ? [] : uniqueSorted(list(get("BYMONTH") ?? "", "BYMONTH").map((x) => integer(x, 1, 12, false, "BYMONTH")));
  const bymonthday = get("BYMONTHDAY") === undefined ? [] : uniqueSorted(list(get("BYMONTHDAY") ?? "", "BYMONTHDAY").map((x) => integer(x, 1, 31, true, "BYMONTHDAY")));
  if (bymonthday.length && freq === "WEEKLY") fail("BYMONTHDAY cannot be used with FREQ=WEEKLY");
  const byday: WeekdayNum[] = [];
  const bydayText = get("BYDAY");
  if (bydayText !== undefined) {
    // RFC 5545: ordinals are 1-53; within a month (MONTHLY) only 1-5 can occur. YEARLY with BYMONTH accepts 1-53, and 6+ never matches.
    const maxOrdinal = freq === "MONTHLY" ? 5 : 53;
    const seen = new Set<string>();
    for (const item of list(bydayText, "BYDAY")) {
      const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item);
      if (!m) return fail(`invalid BYDAY: ${JSON.stringify(item)}`);
      const ordinal = m[1] === undefined ? 0 : Number(m[1]);
      if (m[1] !== undefined && (ordinal === 0 || Math.abs(ordinal) > maxOrdinal || (freq !== "MONTHLY" && freq !== "YEARLY"))) fail(`invalid BYDAY ordinal: ${JSON.stringify(item)}`);
      const weekday = WEEKDAYS.indexOf(m[2] ?? "");
      const key = `${ordinal}:${weekday}`;
      if (!seen.has(key)) { seen.add(key); byday.push({ ordinal, weekday }); }
    }
  }
  const bysetpos = get("BYSETPOS") === undefined ? [] : uniqueSorted(list(get("BYSETPOS") ?? "", "BYSETPOS").map((x) => integer(x, 1, 366, true, "BYSETPOS")));
  if (bysetpos.length && !byday.length && !bymonthday.length && !bymonth.length) fail("BYSETPOS requires BYDAY, BYMONTHDAY or BYMONTH");
  let wkst = 0;
  const wkstText = get("WKST");
  if (wkstText !== undefined) {
    wkst = WEEKDAYS.indexOf(wkstText);
    if (wkst < 0) fail(`invalid WKST: ${JSON.stringify(wkstText)}`);
  }
  return { freq, interval, count, until, byday, bymonthday, bymonth, bysetpos, wkst };
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** YYYYMMDDTHHMMSS for wall (or UTC) milliseconds. */
export function formatStamp(ms: number): string {
  const day = Math.floor(ms / DAY_MS), seconds = Math.floor((ms - day * DAY_MS) / 1000), [y, m, d] = civilFromDays(day);
  return `${pad(y, 4)}${pad(m)}${pad(d)}T${pad(Math.floor(seconds / 3600))}${pad(Math.floor(seconds / 60) % 60)}${pad(seconds % 60)}`;
}

const weekdayText = (w: WeekdayNum): string => `${w.ordinal === 0 ? "" : w.ordinal}${WEEKDAYS[w.weekday] ?? ""}`;

/** Canonical text: FREQ, INTERVAL (if not 1), COUNT or UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST (if not MO). */
export function formatRRule(rule: RecurrenceRule): string {
  const out = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) out.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== null) out.push(`COUNT=${rule.count}`);
  if (rule.until !== null) {
    if (rule.until.utc) out.push(`UNTIL=${formatStamp(rule.until.instant)}Z`);
    else out.push(`UNTIL=${rule.until.date ? formatStamp(rule.until.wall).slice(0, 8) : formatStamp(rule.until.wall)}`);
  }
  if (rule.byday.length) out.push(`BYDAY=${rule.byday.map(weekdayText).join(",")}`);
  if (rule.bymonthday.length) out.push(`BYMONTHDAY=${rule.bymonthday.join(",")}`);
  if (rule.bymonth.length) out.push(`BYMONTH=${rule.bymonth.join(",")}`);
  if (rule.bysetpos.length) out.push(`BYSETPOS=${rule.bysetpos.join(",")}`);
  if (rule.wkst !== 0) out.push(`WKST=${WEEKDAYS[rule.wkst] ?? "MO"}`);
  return out.join(";");
}

// ---------------------------------------------------------------- expansion

export interface RuleWallOptions {
  /** Skip directly to the period containing this wall time (ignored for COUNT rules, which count from the start). */
  readonly fromWall?: number;
  /** Stop once candidates pass this wall time (inclusive bound). */
  readonly stopWall?: number;
  readonly stats?: ExpandStats;
  /**
   * RFC 5545 DTSTART semantics: yield `startWall` first even when the rule does not produce it, count it towards
   * COUNT, and skip rule candidates at or before it. Default false: the start must be produced by the rule.
   */
  readonly includeStart?: boolean;
}

/**
 * Yields the rule's occurrences as ascending wall times at or after `startWall`, honoring COUNT and a local UNTIL.
 * A UTC UNTIL must be applied by the caller against real instants (pass `stopWall` = until + 14 h to bound it).
 */
export function* ruleWalls(rule: RecurrenceRule, startWall: number, options: RuleWallOptions = {}): Generator<number, void, undefined> {
  const startDay = Math.floor(startWall / DAY_MS), time = startWall - startDay * DAY_MS;
  const [sy, sm, sd] = civilFromDays(startDay);
  // python-dateutil / RFC 5545 defaults when neither BYDAY nor BYMONTHDAY is given.
  let byday = rule.byday, bymonthday = rule.bymonthday, bymonth = rule.bymonth;
  if (!byday.length && !bymonthday.length) {
    if (rule.freq === "WEEKLY") byday = [{ ordinal: 0, weekday: weekdayOf(startDay) }];
    if (rule.freq === "MONTHLY" || rule.freq === "YEARLY") bymonthday = [sd];
    if (rule.freq === "YEARLY" && !bymonth.length) bymonth = [sm];
  }
  const ordinal = byday.some((w) => w.ordinal !== 0);
  const plain = new Set(byday.map((w) => w.weekday));
  const scopeByMonth = rule.freq === "MONTHLY" || rule.bymonth.length > 0;
  const weekStart = startDay - ((weekdayOf(startDay) - rule.wkst + 7) % 7);
  let stop = options.stopWall ?? Infinity;
  if (rule.until !== null && !rule.until.utc) stop = Math.min(stop, rule.until.wall);

  const period = (k: number): [number, number] | null => {
    if (rule.freq === "DAILY") return [startDay + k * rule.interval, 1];
    if (rule.freq === "WEEKLY") return [weekStart + 7 * k * rule.interval, 7];
    if (rule.freq === "MONTHLY") {
      const index = sm - 1 + k * rule.interval, y = sy + Math.floor(index / 12), m = (index % 12) + 1;
      return y > 9999 ? null : [daysFromCivil(y, m, 1), daysInMonth(y, m)];
    }
    const y = sy + k * rule.interval;
    return y > 9999 ? null : [daysFromCivil(y, 1, 1), isLeap(y) ? 366 : 365];
  };

  let k0 = 0;
  if (rule.count === null && options.fromWall !== undefined && options.fromWall > startWall) {
    const fromDay = Math.floor(options.fromWall / DAY_MS);
    const [fy, fm] = civilFromDays(fromDay);
    const steps = rule.freq === "DAILY" ? fromDay - startDay
      : rule.freq === "WEEKLY" ? Math.floor((fromDay - weekStart) / 7)
      : rule.freq === "MONTHLY" ? (fy - sy) * 12 + (fm - sm)
      : fy - sy;
    k0 = Math.max(0, Math.floor(steps / rule.interval));
  }

  let produced = 0;
  const includeStart = options.includeStart === true;
  if (includeStart) {
    if (startWall > stop) return;
    yield startWall;
    if (rule.count !== null && ++produced >= rule.count) return;
  }
  for (let k = k0; k < k0 + MAX_PERIODS; k++) {
    const p = period(k);
    if (p === null) return;
    const [first, length] = p;
    if (first * DAY_MS + time > stop) return;
    if (options.stats) options.stats.periods++;
    const civil: [number, number, number][] = [];
    let [y, m, d] = civilFromDays(first);
    for (let i = 0; i < length; i++) {
      civil.push([y, m, d]);
      if (++d > daysInMonth(y, m)) { d = 1; if (++m > 12) { m = 1; y++; } }
    }
    let hits: Set<number> | null = null;
    if (ordinal) {
      // Ordinal weekdays count within each month (MONTHLY, or YEARLY with BYMONTH) or within the year.
      const scopes = new Map<number, number[][]>();
      civil.forEach(([cy, cm], i) => {
        const key = scopeByMonth ? cy * 12 + cm : 0;
        let scope = scopes.get(key);
        if (!scope) { scope = [[], [], [], [], [], [], []]; scopes.set(key, scope); }
        scope[weekdayOf(first + i)]?.push(i);
      });
      hits = new Set();
      for (const scope of scopes.values()) {
        for (const w of byday) {
          const days = scope[w.weekday] ?? [];
          if (w.ordinal === 0) for (const i of days) hits.add(i);
          else {
            const hit = days[w.ordinal > 0 ? w.ordinal - 1 : days.length + w.ordinal];
            if (hit !== undefined) hits.add(hit);
          }
        }
      }
    }
    let candidates: number[] = [];
    for (let i = 0; i < length; i++) {
      const [cy, cm, cd] = civil[i] ?? [0, 0, 0];
      if (cy > 9999) break;
      if (bymonth.length && !bymonth.includes(cm)) continue;
      if (bymonthday.length && !bymonthday.some((x) => cd === (x > 0 ? x : daysInMonth(cy, cm) + x + 1))) continue;
      if (hits ? !hits.has(i) : plain.size > 0 && !plain.has(weekdayOf(first + i))) continue;
      candidates.push(first + i);
    }
    if (rule.bysetpos.length) {
      const picked = new Set<number>();
      for (const pos of rule.bysetpos) {
        const day = candidates[pos > 0 ? pos - 1 : candidates.length + pos];
        if (day !== undefined) picked.add(day);
      }
      candidates = [...picked].sort((a, b) => a - b);
    }
    for (const day of candidates) {
      const wall = day * DAY_MS + time;
      if (wall < startWall || (includeStart && wall === startWall)) continue;
      if (wall > stop) return;
      yield wall;
      if (rule.count !== null && ++produced >= rule.count) return;
    }
    if (civil.some(([cy]) => cy > 9999)) return;
  }
}
