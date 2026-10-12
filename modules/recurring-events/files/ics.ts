// SPDX-License-Identifier: Apache-2.0
// RFC 5545 export of one series: a VCALENDAR with a VTIMEZONE built from the zone's real offset transitions
// (sampled weekly through Intl from January 1 of the start year through the range end, or ten years after the
// export for an endless series; at most the newest 100 years plus the start year), a master VEVENT
// with DTSTART;TZID, DURATION, RRULE (UNTIL in UTC), EXDATE (including cancelled occurrences) and RDATE, and one
// VEVENT with RECURRENCE-ID per changed occurrence. Text is escaped, lines are folded at 75 octets, CRLF endings.
import type { EventSeries, OccurrenceOverride } from "./core.js";
import { RecurringEventsError } from "./errors.js";
import { civilFromDays, DAY_MS, formatRRule, formatStamp, parseRRule } from "./rrule.js";
import { isUtcZone, parseLocal, transitions, wallToInstant, zoneFor } from "./timezone.js";
import type { Zone } from "./timezone.js";

export interface IcsOptions {
  /** Domain part of each UID (`<series id>@<uidDomain>`). Default "recurring-events.invalid". */
  readonly uidDomain?: string;
  /** PRODID value. Default "-//Genlib//recurring-events 0.1.0//EN". */
  readonly prodId?: string;
}

/** Most years of transitions listed after the start year; the newest years up to the range end are kept. */
const MAX_TZ_YEARS = 100;

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
}

/** Folds one content line to at most 75 UTF-8 octets per physical line without splitting a character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "", size = 0, limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) { out.push(current); current = " "; size = 1; limit = 75; }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n");
}

function offsetText(ms: number): string {
  const sign = ms < 0 ? "-" : "+", total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return `${sign}${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}${s ? String(s).padStart(2, "0") : ""}`;
}

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `PT${h ? `${h}H` : ""}${m || !h ? `${m}M` : ""}`;
}

/**
 * Observances for the series' start year and for the years up to `endInstant` (at most MAX_TZ_YEARS of them,
 * the newest kept). The base observance starts at local midnight on January 1 of the start year.
 */
function vtimezone(zone: Zone, startWall: number, endInstant: number): string[] {
  const [startYear] = civilFromDays(Math.floor(startWall / DAY_MS));
  const [rawEndYear] = civilFromDays(Math.floor(endInstant / DAY_MS));
  const endYear = Math.max(rawEndYear, startYear);
  const scanYear = Math.max(startYear, endYear - MAX_TZ_YEARS + 1);
  const yearStart = (year: number): number => wallToInstant(zone, Date.UTC(year, 0, 1));
  const baseWall = Date.UTC(startYear, 0, 1);
  const from = yearStart(startYear);
  const found = scanYear === startYear
    ? transitions(zone, from, yearStart(endYear + 1))
    : [...transitions(zone, from, yearStart(startYear + 1)), ...transitions(zone, yearStart(scanYear), yearStart(endYear + 1))];
  const baseOffset = zone.offsetAt(from);
  const minOffset = Math.min(baseOffset, ...found.map((t) => Math.min(t.from, t.to)));
  const groups = new Map<string, { type: string; from: number; to: number; locals: number[] }>();
  const add = (type: string, fromOffset: number, toOffset: number, local: number): void => {
    const key = `${type}|${fromOffset}|${toOffset}`;
    const group = groups.get(key) ?? { type, from: fromOffset, to: toOffset, locals: [] };
    group.locals.push(local);
    groups.set(key, group);
  };
  add(baseOffset > minOffset ? "DAYLIGHT" : "STANDARD", baseOffset, baseOffset, baseWall);
  for (const t of found) add(t.to > t.from ? "DAYLIGHT" : "STANDARD", t.from, t.to, t.instant + t.from);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${zone.name}`];
  for (const g of groups.values()) {
    lines.push(`BEGIN:${g.type}`, `DTSTART:${formatStamp(g.locals[0] ?? baseWall)}`, `TZOFFSETFROM:${offsetText(g.from)}`, `TZOFFSETTO:${offsetText(g.to)}`);
    if (g.locals.length > 1) lines.push(`RDATE:${g.locals.slice(1).map(formatStamp).join(",")}`);
    lines.push(`END:${g.type}`);
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

/** The .ics text for one series and its overrides. */
export function seriesToIcs(series: EventSeries, overrides: readonly OccurrenceOverride[], options: IcsOptions & { readonly now: number }): string {
  const uidDomain = options.uidDomain ?? "recurring-events.invalid";
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(uidDomain)) throw new RecurringEventsError("invalid-input", "uidDomain must be a host name");
  const prodId = options.prodId ?? "-//Genlib//recurring-events 0.1.0//EN";
  // eslint-disable-next-line no-control-regex
  if (typeof prodId !== "string" || prodId.length > 200 || /[\u0000-\u001f\u007f]/.test(prodId)) throw new RecurringEventsError("invalid-input", "invalid prodId");
  const zone = zoneFor(series.timeZone);
  const utc = isUtcZone(zone);
  const stamp = (wall: number): string => formatStamp(wall) + (utc ? "Z" : "");
  const dateProp = (name: string, walls: readonly number[]): string => `${name}${utc ? "" : `;TZID=${zone.name}`}:${walls.map(stamp).join(",")}`;
  const uid = `UID:${escapeText(series.id)}@${uidDomain}`;
  const dtstamp = `DTSTAMP:${formatStamp(Math.floor(options.now / 1000) * 1000)}Z`;
  const sequence = `SEQUENCE:${Math.max(0, series.version - 1)}`;
  const startWall = parseLocal(series.start);

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${prodId}`, "CALSCALE:GREGORIAN"];
  // Endless series: transitions through ten years after the export.
  if (!utc) lines.push(...vtimezone(zone, startWall, series.rangeEnd ?? options.now + 10 * 366 * DAY_MS));

  lines.push("BEGIN:VEVENT", uid, dtstamp, dateProp("DTSTART", [startWall]), `DURATION:${durationText(series.durationMinutes)}`);
  if (series.rrule !== null) {
    const rule = parseRRule(series.rrule);
    const until = rule.until && !rule.until.utc ? { utc: true as const, instant: wallToInstant(zone, rule.until.wall) } : rule.until;
    lines.push(`RRULE:${formatRRule({ ...rule, until })}`);
  }
  const cancelled = overrides.filter((o) => o.cancelled).map((o) => o.recurrenceId);
  const exdates = [...new Set([...series.exdates, ...cancelled].map((x) => parseLocal(x)))].sort((a, b) => a - b);
  if (exdates.length) lines.push(dateProp("EXDATE", exdates));
  if (series.rdates.length) lines.push(dateProp("RDATE", series.rdates.map((x) => parseLocal(x))));
  lines.push(`SUMMARY:${escapeText(series.title)}`);
  if (series.description !== null) lines.push(`DESCRIPTION:${escapeText(series.description)}`);
  if (series.location !== null) lines.push(`LOCATION:${escapeText(series.location)}`);
  lines.push(sequence, "END:VEVENT");

  const changed = overrides.filter((o) => !o.cancelled).sort((a, b) => (a.recurrenceId < b.recurrenceId ? -1 : 1));
  for (const o of changed) {
    const description = o.description ?? series.description, location = o.location ?? series.location;
    lines.push(
      "BEGIN:VEVENT", uid, dtstamp,
      dateProp("RECURRENCE-ID", [parseLocal(o.recurrenceId)]),
      dateProp("DTSTART", [parseLocal(o.start ?? o.recurrenceId)]),
      `DURATION:${durationText(o.durationMinutes ?? series.durationMinutes)}`,
      `SUMMARY:${escapeText(o.title ?? series.title)}`,
    );
    if (description !== null) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (location !== null) lines.push(`LOCATION:${escapeText(location)}`);
    lines.push(sequence, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
