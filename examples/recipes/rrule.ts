// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 5545 recurrence expansion for a UTC subset. Original source; copy and adapt.
// Supports FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, COUNT, UNTIL, BYDAY (ordinals such as 2TU or
// -1FR with MONTHLY or YEARLY), BYMONTHDAY and BYMONTH, and matches python-dateutil for every rule it
// accepts; rejects BYSETPOS, WKST, BYHOUR and every other part with RangeError instead of ignoring
// them. Plain civil-date math; no Date parsing; weeks start Monday.

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const ALLOWED = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH"]);
export const MAX_PERIODS = 100000;
type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
interface Rule { freq: Freq; interval: number; count: number | null; until: number | null; byday: [number, number][]; bymonthday: number[]; bymonth: number[] }

// Days since 1970-01-01 for a proleptic Gregorian civil date (month 1-12) and back.
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y, era = Math.floor(yy / 400), yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468, era = Math.floor(zz / 146097), doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, doy - Math.floor((153 * mp + 2) / 5) + 1];
}
const isLeap = (y: number): boolean => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const daysInMonth = (y: number, m: number): number => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
const weekday = (days: number): number => (((days + 3) % 7) + 7) % 7; // 0 = Monday (1970-01-01 was a Thursday)

function parseStamp(m: RegExpExecArray | null, label: string): number {
  if (!m) throw new RangeError(`invalid ${label}`);
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) throw new RangeError(`invalid ${label}`);
  return daysFromCivil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s;
}

function num(text: string, lo: number, hi: number, signed: boolean, label: string): number {
  if (!(signed ? /^[+-]?[0-9]{1,4}$/ : /^\+?[0-9]{1,4}$/).test(text) || Math.abs(Number(text)) < lo || Math.abs(Number(text)) > hi) {
    throw new RangeError(`invalid ${label}: ${JSON.stringify(text)}`);
  }
  return Number(text);
}

export function parseRRule(rule: string): Rule {
  const parts = new Map<string, string>();
  for (const piece of rule.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 0) throw new RangeError(`malformed rule part: ${JSON.stringify(piece)}`);
    const key = piece.slice(0, eq);
    if (parts.has(key)) throw new RangeError(`duplicate rule part: ${key}`);
    parts.set(key, piece.slice(eq + 1));
  }
  for (const key of parts.keys()) if (!ALLOWED.has(key)) throw new RangeError(`unsupported rule part: ${key}`);
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") throw new RangeError("FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY");
  if (parts.has("COUNT") && parts.has("UNTIL")) throw new RangeError("COUNT and UNTIL cannot both be set");
  const r: Rule = { freq, interval: 1, count: null, until: null, byday: [], bymonthday: [], bymonth: [] };
  const get = (k: string): string | undefined => parts.get(k);
  const interval = get("INTERVAL"), count = get("COUNT"), until = get("UNTIL"), byday = get("BYDAY"), bmd = get("BYMONTHDAY"), bm = get("BYMONTH");
  if (interval !== undefined) r.interval = num(interval, 1, 9999, false, "INTERVAL");
  if (count !== undefined) r.count = num(count, 1, 9999, false, "COUNT");
  if (until !== undefined) r.until = parseStamp(/^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/.exec(until), "UNTIL");
  if (byday !== undefined) {
    const maxOrdinal = freq === "MONTHLY" || (freq === "YEARLY" && bm !== undefined) ? 5 : 53;
    for (const item of byday.split(",")) {
      const m = /^([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item);
      if (!m) throw new RangeError(`invalid BYDAY: ${JSON.stringify(item)}`);
      const n = m[1] ? Number(m[1]) : 0;
      if (m[1] && (n === 0 || Math.abs(n) > maxOrdinal || (freq !== "MONTHLY" && freq !== "YEARLY"))) throw new RangeError(`invalid BYDAY ordinal: ${JSON.stringify(item)}`);
      r.byday.push([n, WEEKDAYS.indexOf(m[2] ?? "")]);
    }
    if (r.byday.some(([n]) => n !== 0) && r.byday.some(([n]) => n === 0)) throw new RangeError("BYDAY cannot mix plain and ordinal weekdays");
  }
  if (bmd !== undefined) r.bymonthday = bmd.split(",").map((x) => num(x, 1, 31, true, "BYMONTHDAY"));
  if (bm !== undefined) r.bymonth = bm.split(",").map((x) => num(x, 1, 12, false, "BYMONTH"));
  return r;
}

/** First day number and length of period k (consecutive days), or null past year 9999. */
function period(r: Rule, startDay: number, k: number): [number, number] | null {
  const [sy, sm] = civilFromDays(startDay);
  if (r.freq === "DAILY") return [startDay + k * r.interval, 1];
  if (r.freq === "WEEKLY") return [startDay - weekday(startDay) + 7 * k * r.interval, 7];
  if (r.freq === "MONTHLY") {
    const index = sm - 1 + k * r.interval, y = sy + Math.floor(index / 12), m = (index % 12) + 1;
    return y > 9999 ? null : [daysFromCivil(y, m, 1), daysInMonth(y, m)];
  }
  const y = sy + k * r.interval;
  return y > 9999 ? null : [daysFromCivil(y, 1, 1), isLeap(y) ? 366 : 365];
}

/** Indexes of period days chosen by ordinal BYDAY items, counted within the month or the whole period. */
function ordinalHits(r: Rule, civil: [number, number, number][], first: number): Set<number> {
  const byMonth = r.freq === "MONTHLY" || r.bymonth.length > 0, scopes = new Map<number, number[][]>(), hits = new Set<number>();
  civil.forEach(([y, m], i) => {
    const key = byMonth ? y * 12 + m : 0;
    let scope = scopes.get(key);
    if (!scope) { scope = [[], [], [], [], [], [], []]; scopes.set(key, scope); }
    scope[weekday(first + i)]?.push(i);
  });
  for (const scope of scopes.values()) {
    for (const [n, wd] of r.byday) {
      const list = scope[wd] ?? [], hit = list[n > 0 ? n - 1 : list.length + n];
      if (hit !== undefined) hits.add(hit);
    }
  }
  return hits;
}

function format(t: number): string {
  const day = Math.floor(t / 86400), s = t - day * 86400, [y, m, d] = civilFromDays(day);
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(y, 4)}-${p(m)}-${p(d)}T${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}Z`;
}

/** Occurrences as YYYY-MM-DDTHH:MM:SSZ in time order: at most `limit` (1..1000), COUNT or up to UNTIL. */
export function expandRRule(dtstart: string, rule: string, limit = 50): string[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("limit must be an integer from 1 to 1000");
  const start = parseStamp(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/.exec(dtstart), "dtstart");
  const r = parseRRule(rule);
  const startDay = Math.floor(start / 86400), time = start - startDay * 86400, [, sm, sd] = civilFromDays(startDay), out: number[] = [];
  // python-dateutil defaults when neither BYDAY nor BYMONTHDAY is given.
  let plain = new Set(r.byday.filter(([n]) => n === 0).map(([, wd]) => wd)), bymonthday = r.bymonthday, bymonth = r.bymonth;
  if (!r.byday.length && !bymonthday.length) {
    if (r.freq === "WEEKLY") plain = new Set([weekday(startDay)]);
    if (r.freq === "MONTHLY" || r.freq === "YEARLY") bymonthday = [sd];
    if (r.freq === "YEARLY" && !bymonth.length) bymonth = [sm];
  }
  const ordinal = r.byday.some(([n]) => n !== 0);
  for (let k = 0; k < MAX_PERIODS; k++) {
    const p = period(r, startDay, k);
    if (p === null) break;
    const [first, length] = p;
    if (r.until !== null && first * 86400 + time > r.until) break;
    const civil: [number, number, number][] = [];
    let [y, m, d] = civilFromDays(first);
    for (let i = 0; i < length; i++) {
      civil.push([y, m, d]);
      if (++d > daysInMonth(y, m)) { d = 1; if (++m > 12) { m = 1; y++; } }
    }
    const hits = ordinal ? ordinalHits(r, civil, first) : null;
    for (let i = 0; i < length; i++) {
      const [cy, cm, cd] = civil[i] ?? [0, 0, 0];
      if (cy > 9999) return out.map(format);
      if (bymonth.length && !bymonth.includes(cm)) continue;
      if (bymonthday.length && !bymonthday.some((x) => cd === (x > 0 ? x : daysInMonth(cy, cm) + x + 1))) continue;
      if (hits ? !hits.has(i) : plain.size > 0 && !plain.has(weekday(first + i))) continue;
      const t = (first + i) * 86400 + time;
      if (t < start) continue;
      if (r.until !== null && t > r.until) return out.map(format);
      out.push(t);
      if ((r.count !== null && out.length >= r.count) || out.length >= limit) return out.map(format);
    }
  }
  return out.map(format);
}
