// SPDX-License-Identifier: Apache-2.0
// IANA time-zone offsets through Intl.DateTimeFormat (adapted from the scheduled-tasks module's cron.ts) and the
// local date-time text used for event starts, EXDATE, RDATE and RECURRENCE-ID values.
// RFC 5545 section 3.3.5: a local time skipped by a forward transition is interpreted with the offset before the
// gap (02:30 on a spring-forward day becomes 03:30); a local time repeated by a backward transition means its first
// occurrence.
import { RecurringEventsError } from "./errors.js";
import { civilFromDays, DAY_MS, daysFromCivil, daysInMonth } from "./rrule.js";

const HOUR = 3_600_000;

export interface Zone {
  readonly name: string;
  /** Offset (local minus UTC) in milliseconds at an instant. */
  offsetAt(instant: number): number;
}

const zones = new Map<string, Zone>();

/** Number of Intl offset lookups made so far (non-UTC zones). Read-only diagnostics for cost tests. */
export const offsetLookups = { count: 0 };

/** The zone for an IANA name; throws invalid-input for an unknown one. */
export function zoneFor(timeZone: string): Zone {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) throw new RecurringEventsError("invalid-input", "invalid time zone");
  const cached = zones.get(timeZone);
  if (cached) return cached;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
  } catch {
    throw new RecurringEventsError("invalid-input", `unknown time zone: ${JSON.stringify(timeZone)}`);
  }
  const name = format.resolvedOptions().timeZone;
  const zone: Zone = name === "UTC" || name === "Etc/UTC" ? { name, offsetAt: () => 0 } : {
    name,
    offsetAt(instant) {
      offsetLookups.count++;
      const seconds = Math.floor(instant / 1000) * 1000;
      const fields: Record<string, number> = {};
      for (const part of format.formatToParts(seconds)) if (part.type !== "literal") fields[part.type] = Number(part.value);
      const wall = Date.UTC(fields.year ?? 1970, (fields.month ?? 1) - 1, fields.day ?? 1, (fields.hour ?? 0) % 24, fields.minute ?? 0, fields.second ?? 0);
      return wall - seconds;
    },
  };
  if (zones.size > 500) zones.clear();
  zones.set(timeZone, zone);
  return zone;
}

export const isUtcZone = (zone: Zone): boolean => zone.name === "UTC" || zone.name === "Etc/UTC";

/** The instant of a local wall time: its first occurrence, or (inside a gap) the wall shifted by the gap. */
export function wallToInstant(zone: Zone, wall: number): number {
  const before = zone.offsetAt(wall - 15 * HOUR);
  const after = zone.offsetAt(wall + 13 * HOUR);
  let best: number | null = null;
  for (const offset of new Set([before, after, zone.offsetAt(wall)])) {
    const instant = wall - offset;
    if (zone.offsetAt(instant) === offset && (best === null || instant < best)) best = instant;
  }
  return best ?? wall - before;
}

export const instantToWall = (zone: Zone, instant: number): number => instant + zone.offsetAt(instant);

/** Parses YYYY-MM-DDTHH:MM[:SS] (years 1000-9998) into wall milliseconds; throws invalid-input. */
export function parseLocal(text: unknown, label = "date-time"): number {
  const m = typeof text === "string" ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text) : null;
  if (!m) throw new RecurringEventsError("invalid-input", `${label} must be a local date-time YYYY-MM-DDTHH:MM[:SS]`);
  const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? "0")) as [number, number, number, number, number, number];
  if (y < 1000 || y > 9998 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) {
    throw new RecurringEventsError("invalid-input", `${label} is not a valid date-time: ${JSON.stringify(text)}`);
  }
  return daysFromCivil(y, mo, d) * DAY_MS + ((h * 60 + mi) * 60 + s) * 1000;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** YYYY-MM-DDTHH:MM:SS for wall milliseconds. */
export function formatLocal(wall: number): string {
  const day = Math.floor(wall / DAY_MS), seconds = Math.floor((wall - day * DAY_MS) / 1000), [y, m, d] = civilFromDays(day);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

export interface Transition { readonly instant: number; readonly from: number; readonly to: number }

/** Offset transitions in [fromInstant, toInstant), found by weekly sampling and a binary search to the second. */
export function transitions(zone: Zone, fromInstant: number, toInstant: number): Transition[] {
  if (isUtcZone(zone)) return [];
  const out: Transition[] = [];
  const step = 7 * DAY_MS;
  let t = fromInstant, offset = zone.offsetAt(t);
  while (t < toInstant) {
    const next = Math.min(t + step, toInstant);
    const nextOffset = zone.offsetAt(next);
    if (nextOffset !== offset) {
      let lo = t, hi = next;
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
        if (mid <= lo) break;
        if (zone.offsetAt(mid) === offset) lo = mid; else hi = mid;
      }
      out.push({ instant: hi, from: offset, to: zone.offsetAt(hi) });
    }
    t = next;
    offset = nextOffset;
  }
  return out;
}
