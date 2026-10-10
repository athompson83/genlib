// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: next run time of a 5-field cron expression in UTC. Original source; copy and adapt.
// Fields: minute hour day-of-month month day-of-week, each a comma list of *, N or A-B with an
// optional /step (N/step runs from N to the field maximum). Day-of-week 0 and 7 are Sunday.
// Vixie rule: when both day fields are restricted, a day matches if EITHER matches. No names,
// seconds, ?, L, W or time zones: convert local schedules (and DST) before calling.

interface Field { values: boolean[]; restricted: boolean }
export interface CronSchedule { minute: Field; hour: Field; dayOfMonth: Field; month: Field; dayOfWeek: Field }

const LIMITS: ReadonlyArray<readonly [string, number, number]> = [
  ["minute", 0, 59], ["hour", 0, 23], ["day-of-month", 1, 31], ["month", 1, 12], ["day-of-week", 0, 7],
];
const MINUTE = 60_000;
const SEARCH_MS = 5 * 366 * 86_400_000;

function parseField(text: string, name: string, min: number, max: number): Field {
  const values = new Array<boolean>(max + 1).fill(false);
  const num = (s: string | undefined): number => {
    if (s === undefined || !/^\d+$/.test(s)) throw new RangeError(`invalid ${name} value: ${JSON.stringify(s)}`);
    const n = Number(s);
    if (n < min || n > max) throw new RangeError(`${name} value ${n} is outside ${min}-${max}`);
    return n;
  };
  for (const item of text.split(",")) {
    const [range, stepText, extra] = item.split("/");
    if (extra !== undefined || range === undefined) throw new RangeError(`invalid ${name} item: ${JSON.stringify(item)}`);
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1 || Number(stepText) > max) throw new RangeError(`invalid ${name} step: ${JSON.stringify(stepText)}`);
      step = Number(stepText);
    }
    let low: number;
    let high: number;
    if (range === "*") [low, high] = [min, max];
    else if (range.includes("-")) {
      const [a, b, more] = range.split("-");
      if (more !== undefined) throw new RangeError(`invalid ${name} range: ${JSON.stringify(range)}`);
      [low, high] = [num(a), num(b)];
      if (low > high) throw new RangeError(`${name} range ${range} is reversed`);
    } else {
      low = num(range);
      high = stepText === undefined ? low : max;
    }
    for (let v = low; v <= high; v += step) values[v] = true;
  }
  return { values, restricted: !text.startsWith("*") };
}

/** Parses and validates an expression; throws RangeError with the failing field. */
export function parseCron(expression: string): CronSchedule {
  const parts = typeof expression === "string" ? expression.trim().split(/\s+/) : [];
  if (parts.length !== 5) throw new RangeError("cron expression must have exactly 5 fields");
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map((p, i) => {
    const [name, min, max] = LIMITS[i] ?? ["field", 0, 0];
    return parseField(p, name, min, max);
  }) as [Field, Field, Field, Field, Field];
  if (dayOfWeek.values[7]) dayOfWeek.values[0] = true;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function dayMatches(s: CronSchedule, date: Date): boolean {
  const dom = s.dayOfMonth.values[date.getUTCDate()] === true;
  const dow = s.dayOfWeek.values[date.getUTCDay()] === true;
  return s.dayOfMonth.restricted && s.dayOfWeek.restricted ? dom || dow : dom && dow;
}

function parseUtc(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?Z$/.exec(text);
  if (!m) throw new RangeError("after must be an ISO 8601 UTC time like 2026-10-10T12:00:00Z");
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((x) => Number(x ?? 0)) as [number, number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    throw new RangeError(`invalid date/time: ${text}`);
  }
  return ms;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** First matching minute strictly after `afterIsoUtc` (seconds truncated), as YYYY-MM-DDTHH:MM:00Z. */
export function nextRun(expression: string, afterIsoUtc: string): string {
  const s = parseCron(expression);
  let t = Math.floor(parseUtc(afterIsoUtc) / MINUTE) * MINUTE + MINUTE;
  const limit = t + SEARCH_MS;
  while (t <= limit) {
    const d = new Date(t);
    const [y, mo, day, h] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()];
    if (!s.month.values[mo + 1]) t = Date.UTC(y, mo + 1, 1);
    else if (!dayMatches(s, d)) t = Date.UTC(y, mo, day + 1);
    else if (!s.hour.values[h]) t = Date.UTC(y, mo, day, h + 1);
    else if (!s.minute.values[d.getUTCMinutes()]) t += MINUTE;
    else {
      if (y > 9999) break;
      return `${pad(y, 4)}-${pad(mo + 1)}-${pad(day)}T${pad(h)}:${pad(d.getUTCMinutes())}:00Z`;
    }
  }
  throw new RangeError(`no run of ${JSON.stringify(expression)} within 5 years after ${afterIsoUtc}`);
}
