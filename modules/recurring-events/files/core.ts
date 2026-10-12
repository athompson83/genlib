// SPDX-License-Identifier: Apache-2.0
// Recurring calendar events, framework-neutral. A series is a start (local wall time in an IANA zone), an exact
// duration, an optional RFC 5545 RRULE, EXDATE and RDATE lists, and per-occurrence overrides keyed by
// RECURRENCE-ID (the occurrence's original local start) that move, change or cancel one occurrence.
// Occurrences keep their local wall-clock time across DST. Window queries jump straight to the period containing
// the window instead of expanding from the start (COUNT rules still count from the start; COUNT <= 10,000).
// Series edits: this occurrence (override), this and following (split into two series, past untouched), or all.
// The application supplies persistence through RecurringEventStore (memory-store.ts, sql-store.ts).
import { RecurringEventsError } from "./errors.js";
import { DAY_MS, formatRRule, parseRRule, ruleWalls } from "./rrule.js";
import type { ExpandStats, RecurrenceRule } from "./rrule.js";
import { formatLocal, parseLocal, wallToInstant, zoneFor } from "./timezone.js";
import type { Zone } from "./timezone.js";
import { seriesToIcs } from "./ics.js";
import type { IcsOptions } from "./ics.js";

export { RecurringEventsError } from "./errors.js";
export type { RecurringEventsErrorCode } from "./errors.js";
export { parseRRule, formatRRule } from "./rrule.js";
export type { RecurrenceRule, ExpandStats, Frequency, WeekdayNum, RuleUntil } from "./rrule.js";
export type { IcsOptions } from "./ics.js";

export interface EventSeries {
  readonly id: string;
  readonly calendarId: string;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  /** Canonical IANA zone name, for example "America/New_York". */
  readonly timeZone: string;
  /** First occurrence as local wall time in `timeZone`: YYYY-MM-DDTHH:MM:SS. */
  readonly start: string;
  /** Exact length of each occurrence in minutes (1 to 44,640). */
  readonly durationMinutes: number;
  /** Canonical RRULE text without the "RRULE:" prefix, or null for a one-off event with optional RDATEs. */
  readonly rrule: string | null;
  /** Excluded occurrence starts (local, sorted). */
  readonly exdates: readonly string[];
  /** Extra occurrence starts (local, sorted, not before `start`). */
  readonly rdates: readonly string[];
  /** Earliest occurrence start, epoch ms (an index bound for window queries). */
  readonly rangeStart: number;
  /** Latest occurrence end, epoch ms, or null for a series without COUNT or UNTIL. An upper bound. */
  readonly rangeEnd: number | null;
  /** The series this one was split from by a "this and following" edit. */
  readonly splitFrom: string | null;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A change to one occurrence. Null fields inherit the series value. */
export interface OccurrenceOverride {
  readonly seriesId: string;
  /** The occurrence's original local start (RECURRENCE-ID): YYYY-MM-DDTHH:MM:SS. */
  readonly recurrenceId: string;
  readonly cancelled: boolean;
  /** New local start, or null to keep the original. */
  readonly start: string | null;
  readonly durationMinutes: number | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly location: string | null;
  readonly updatedAt: number;
}

export interface Occurrence {
  readonly seriesId: string;
  readonly calendarId: string;
  readonly recurrenceId: string;
  /** Epoch ms. */
  readonly start: number;
  readonly end: number;
  readonly startLocal: string;
  readonly timeZone: string;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly overridden: boolean;
}

export interface OverrideChanges {
  /** Applied first. */
  readonly remove: readonly string[];
  readonly upsert: readonly OccurrenceOverride[];
}

export interface RecurringEventStore {
  insertSeries(series: EventSeries): Promise<void>;
  getSeries(id: string): Promise<EventSeries | null>;
  /** Overrides of the given series, in any order. */
  listOverrides(seriesIds: readonly string[]): Promise<OccurrenceOverride[]>;
  /** Series of a calendar with rangeStart < to and (rangeEnd null or rangeEnd > from), ordered by rangeStart, id. */
  listSeriesInRange(calendarId: string, from: number, to: number, limit: number): Promise<EventSeries[]>;
  /**
   * Atomically: when the stored version equals `expectedVersion`, replace the series row (its version is already
   * incremented) and apply the override changes; return false and change nothing otherwise.
   */
  updateSeries(series: EventSeries, expectedVersion: number, changes: OverrideChanges): Promise<boolean>;
  /** Atomically updates the original (as updateSeries) and inserts the new series with its overrides. */
  splitSeries(original: EventSeries, expectedVersion: number, originalChanges: OverrideChanges, created: EventSeries, createdOverrides: readonly OccurrenceOverride[]): Promise<boolean>;
  /** Deletes the series and its overrides when the version matches. */
  deleteSeries(id: string, expectedVersion: number): Promise<boolean>;
}

export interface SeriesInput {
  readonly calendarId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly timeZone: string;
  /** Local wall time YYYY-MM-DDTHH:MM[:SS] in `timeZone`; must be the rule's first occurrence. */
  readonly start: string;
  readonly durationMinutes: number;
  readonly rrule?: string | null;
  readonly exdates?: readonly string[];
  readonly rdates?: readonly string[];
}

export type SeriesChanges = Partial<Omit<SeriesInput, "calendarId">>;

export interface OccurrenceChanges {
  readonly start?: string;
  readonly durationMinutes?: number;
  readonly title?: string;
  readonly description?: string | null;
  readonly location?: string | null;
}

export type EditScope = "this" | "following" | "all";

export interface EditResult {
  /** The edited series (for "following", the original, now ending before the split). */
  readonly series: EventSeries;
  /** The new series created by a "following" split; null otherwise. */
  readonly created: EventSeries | null;
  /** The override written by a "this" edit; null otherwise. */
  readonly override: OccurrenceOverride | null;
  /** EXDATEs and overrides removed because they no longer match an occurrence after a timing change. */
  readonly droppedExceptions: number;
}

export interface WindowQuery { readonly from: number; readonly to: number; readonly limit?: number }
export interface WindowResult { readonly occurrences: Occurrence[]; readonly truncated: boolean }
export interface VersionOption { readonly expectedVersion?: number }

export interface RecurringEventsOptions {
  readonly store: RecurringEventStore;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Default 1000. */
  readonly maxOverridesPerSeries?: number;
  /** Largest `limit` a window query accepts. Default 2000. */
  readonly maxOccurrences?: number;
  /** Most series one calendar window query loads. Default 1000; more sets `truncated`. */
  readonly maxSeriesPerQuery?: number;
}

/**
 * Bound on |local time - UTC| (real offsets stay within -12:00 and +14:00; a day leaves room for historical LMT).
 * A wall time more than this before a bound is before it as an instant too, so it can be skipped without Intl calls.
 */
const SKEW = DAY_MS;
const MINUTE = 60_000;
const MAX_DURATION_MINUTES = 44_640;
const MAX_DATES = 1000;
const PREVIEW_LIMIT = 10_000;

// ---------------------------------------------------------------- validation

const invalid = (message: string): never => { throw new RecurringEventsError("invalid-input", message); };
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function textField(value: unknown, label: string, max: number, multiline: boolean): string {
  if (typeof value !== "string") return invalid(`${label} must be a string`);
  if (value.length > max || CONTROL.test(value) || (!multiline && /[\r\n]/.test(value))) return invalid(`${label} must be at most ${max} characters without control characters`);
  return value;
}
function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = textField(value, label, max, true);
  return text === "" ? null : text;
}
function duration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_DURATION_MINUTES) return invalid(`durationMinutes must be an integer from 1 to ${MAX_DURATION_MINUTES}`);
  return value as number;
}
function dateList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_DATES) return invalid(`${label} must be an array of at most ${MAX_DATES} local date-times`);
  return [...new Set(value.map((item) => parseLocal(item, label)))].sort((a, b) => a - b).map(formatLocal);
}
function ruleText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return invalid("rrule must be a string or null");
  return formatRRule(parseRRule(value));
}
function version(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1) return invalid("expectedVersion must be a positive integer");
  return value as number;
}
function onlyKeys(input: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid(`${label} must be an object`);
  for (const key of Object.keys(input)) if (!allowed.includes(key)) invalid(`unknown ${label} field: ${key}`);
  return input as Record<string, unknown>;
}

interface SeriesFields {
  readonly calendarId: string;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly timeZone: string;
  readonly start: string;
  readonly durationMinutes: number;
  readonly rrule: string | null;
  readonly exdates: readonly string[];
  readonly rdates: readonly string[];
}

const CHANGE_KEYS = ["title", "description", "location", "timeZone", "start", "durationMinutes", "rrule", "exdates", "rdates"] as const;
const OCCURRENCE_KEYS = ["start", "durationMinutes", "title", "description", "location"] as const;

/** Applies validated changes to a base; `has` tells which keys the caller set. */
function applyChanges(base: SeriesFields, raw: Record<string, unknown>): SeriesFields {
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined;
  const title = has("title") ? textField(raw.title, "title", 500, false).trim() : base.title;
  if (!title) invalid("title is required");
  return {
    calendarId: base.calendarId,
    title,
    description: has("description") || raw.description === null ? optionalText(raw.description, "description", 8000) : base.description,
    location: has("location") || raw.location === null ? optionalText(raw.location, "location", 500) : base.location,
    timeZone: has("timeZone") ? zoneFor(raw.timeZone as string).name : base.timeZone,
    start: has("start") ? formatLocal(parseLocal(raw.start, "start")) : base.start,
    durationMinutes: has("durationMinutes") ? duration(raw.durationMinutes) : base.durationMinutes,
    rrule: has("rrule") || raw.rrule === null ? ruleText(raw.rrule) : base.rrule,
    exdates: has("exdates") ? dateList(raw.exdates, "exdates") : base.exdates,
    rdates: has("rdates") ? dateList(raw.rdates, "rdates") : base.rdates,
  };
}

function inputFields(input: unknown): SeriesFields {
  const raw = onlyKeys(input, ["calendarId", ...CHANGE_KEYS], "series");
  const calendarId = textField(raw.calendarId, "calendarId", 200, false);
  if (!calendarId.trim()) invalid("calendarId is required");
  for (const key of ["title", "timeZone", "start", "durationMinutes"]) if (raw[key] === undefined) invalid(`${key} is required`);
  return applyChanges({ calendarId, title: "", description: null, location: null, timeZone: "UTC", start: "", durationMinutes: 1, rrule: null, exdates: [], rdates: [] }, raw);
}

// ---------------------------------------------------------------- compiled series

interface Compiled {
  readonly zone: Zone;
  readonly startWall: number;
  readonly rule: RecurrenceRule | null;
  readonly untilInstant: number | null;
  readonly exdates: ReadonlySet<number>;
  readonly rdates: readonly number[];
  readonly durationMs: number;
}

function compile(fields: Pick<SeriesFields, "timeZone" | "start" | "durationMinutes" | "rrule" | "exdates" | "rdates">, withExdates = true): Compiled {
  const zone = zoneFor(fields.timeZone);
  const rule = fields.rrule === null ? null : parseRRule(fields.rrule);
  return {
    zone, rule,
    startWall: parseLocal(fields.start, "start"),
    untilInstant: rule?.until?.utc ? rule.until.instant : null,
    exdates: new Set(withExdates ? fields.exdates.map((x) => parseLocal(x)) : []),
    rdates: fields.rdates.map((x) => parseLocal(x)).sort((a, b) => a - b),
    durationMs: fields.durationMinutes * MINUTE,
  };
}

/** The rule's own occurrences (or just the start without a rule), applying a UTC UNTIL against real instants. */
function* ruleStream(c: Compiled, fromWall?: number, stats?: ExpandStats): Generator<number, void, undefined> {
  if (!c.rule) { yield c.startWall; return; }
  const stopWall = c.untilInstant === null ? undefined : c.untilInstant + SKEW;
  for (const wall of ruleWalls(c.rule, c.startWall, { ...(fromWall === undefined ? {} : { fromWall }), ...(stopWall === undefined ? {} : { stopWall }), ...(stats ? { stats } : {}) })) {
    // Only walls within SKEW of UNTIL need a real conversion to decide.
    if (c.untilInstant !== null && wall + SKEW > c.untilInstant && wallToInstant(c.zone, wall) > c.untilInstant) return;
    yield wall;
  }
}

function lowerBound(values: readonly number[], target: number): number {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if ((values[mid] ?? 0) < target) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Rule occurrences merged with RDATEs, ascending and unique, minus EXDATEs. */
function* baseWalls(c: Compiled, fromWall?: number, stats?: ExpandStats): Generator<number, void, undefined> {
  let i = fromWall === undefined ? 0 : lowerBound(c.rdates, fromWall);
  let last = -Infinity;
  function* take(wall: number): Generator<number, void, undefined> {
    if (wall <= last) return;
    last = wall;
    if (!c.exdates.has(wall)) yield wall;
  }
  for (const wall of ruleStream(c, fromWall, stats)) {
    while (i < c.rdates.length && (c.rdates[i] ?? 0) <= wall) yield* take(c.rdates[i++] ?? 0);
    yield* take(wall);
  }
  while (i < c.rdates.length) yield* take(c.rdates[i++] ?? 0);
}

function isRuleOccurrence(c: Compiled, wall: number): boolean {
  for (const w of ruleStream(c, wall)) { if (w === wall) return true; if (w > wall) return false; }
  return false;
}

function isOccurrence(c: Compiled, wall: number): boolean {
  if (c.exdates.has(wall)) return false;
  const i = lowerBound(c.rdates, wall);
  if (c.rdates[i] === wall) return true;
  return isRuleOccurrence(c, wall);
}

/** Which of `walls` are occurrences; one pass for COUNT rules, a direct jump per value otherwise. */
function occurrenceSet(c: Compiled, walls: readonly number[]): Set<number> {
  const out = new Set<number>();
  if (c.rule?.count != null && walls.length > 1) {
    const max = Math.max(...walls);
    const ruled = new Set<number>();
    for (const w of ruleStream(c)) { if (w > max) break; ruled.add(w); }
    for (const wall of walls) if (!c.exdates.has(wall) && (ruled.has(wall) || c.rdates.includes(wall))) out.add(wall);
    return out;
  }
  for (const wall of walls) if (isOccurrence(c, wall)) out.add(wall);
  return out;
}

function assertValidSeries(c: Compiled): void {
  if (c.rule) {
    const first = ruleWalls(c.rule, c.startWall, { stopWall: c.startWall }).next();
    if (first.done || first.value !== c.startWall || (c.untilInstant !== null && wallToInstant(c.zone, c.startWall) > c.untilInstant)) {
      throw new RecurringEventsError("invalid-rule", "start must be the first occurrence of the rule");
    }
  }
  if (c.rdates.length && (c.rdates[0] ?? 0) < c.startWall) invalid("rdates must not precede start");
}

function computeRange(c: Compiled, overrides: readonly OccurrenceOverride[]): { rangeStart: number; rangeEnd: number | null } {
  const at = (wall: number): number => wallToInstant(c.zone, wall);
  // RDATEs never precede the start, and wall order is instant order, so the start is the earliest base occurrence.
  let rangeStart = at(c.startWall);
  let rangeEnd: number | null = null;
  const rule = c.rule;
  if (!rule || rule.count !== null || rule.until !== null) {
    // Find the latest wall cheaply, then convert it once.
    let lastWall = Math.max(c.startWall, c.rdates.at(-1) ?? c.startWall);
    if (rule && rule.count !== null) for (const w of ruleStream(c)) lastWall = Math.max(lastWall, w);
    let last = at(lastWall);
    if (rule && rule.count === null && rule.until !== null) last = Math.max(last, rule.until.utc ? rule.until.instant : at(rule.until.wall));
    rangeEnd = last + c.durationMs;
  }
  for (const o of overrides) {
    if (o.cancelled) continue;
    const start = at(parseLocal(o.start ?? o.recurrenceId));
    rangeStart = Math.min(rangeStart, start);
    if (rangeEnd !== null) rangeEnd = Math.max(rangeEnd, start + (o.durationMinutes === null ? c.durationMs : o.durationMinutes * MINUTE));
  }
  return { rangeStart, rangeEnd };
}

function toOccurrence(series: EventSeries, rid: number, override: OccurrenceOverride | null, zone: Zone): Occurrence {
  const startWall = override?.start ? parseLocal(override.start) : rid;
  const start = wallToInstant(zone, startWall);
  return {
    seriesId: series.id, calendarId: series.calendarId, recurrenceId: formatLocal(rid), start,
    end: start + (override?.durationMinutes ?? series.durationMinutes) * MINUTE,
    startLocal: formatLocal(startWall), timeZone: series.timeZone,
    title: override?.title ?? series.title,
    description: override?.description ?? series.description,
    location: override?.location ?? series.location,
    overridden: override !== null,
  };
}

const byStart = (a: Occurrence, b: Occurrence): number => a.start - b.start || (a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : 0) || (a.recurrenceId < b.recurrenceId ? -1 : 1);
const overlaps = (start: number, end: number, from: number, to: number): boolean => start < to && (end > from || start >= from);

/** Up to `limit + 1` occurrences of one series that overlap [from, to), in start order. */
function windowOccurrences(series: EventSeries, overrides: readonly OccurrenceOverride[], from: number, to: number, limit: number, stats?: ExpandStats): Occurrence[] {
  const c = compile(series);
  const byRid = new Map(overrides.map((o) => [parseLocal(o.recurrenceId), o]));
  const out: Occurrence[] = [];
  // Wall time differs from UTC by at most 14 hours; widen by a day and filter on real instants.
  for (const wall of baseWalls(c, from - c.durationMs - SKEW, stats)) {
    // Cheap wall-time bounds first: COUNT rules replay every occurrence from the start.
    if (wall + SKEW + c.durationMs < from) continue;
    if (wall - SKEW >= to) break;
    const start = wallToInstant(c.zone, wall);
    if (start >= to) break;
    if (byRid.has(wall) || !overlaps(start, start + c.durationMs, from, to)) continue;
    out.push(toOccurrence(series, wall, null, c.zone));
    if (out.length > limit) break;
  }
  for (const [rid, o] of byRid) {
    if (o.cancelled) continue;
    const occurrence = toOccurrence(series, rid, o, c.zone);
    if (overlaps(occurrence.start, occurrence.end, from, to)) out.push(occurrence);
  }
  return out.sort(byStart).slice(0, limit + 1);
}

// ---------------------------------------------------------------- pure preview

export interface PreviewInput {
  readonly start: string;
  readonly timeZone: string;
  readonly rrule?: string | null;
  readonly exdates?: readonly string[];
  readonly rdates?: readonly string[];
  readonly durationMinutes?: number;
}
export interface PreviewOptions { readonly limit?: number; readonly from?: number; readonly to?: number; readonly stats?: ExpandStats }
export interface PreviewOccurrence { readonly start: number; readonly end: number; readonly startLocal: string }

/** Occurrences of a rule without a store: the first `limit` (default 50, at most 10,000), or those overlapping [from, to). */
export function previewOccurrences(input: PreviewInput, options: PreviewOptions = {}): PreviewOccurrence[] {
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PREVIEW_LIMIT) invalid(`limit must be an integer from 1 to ${PREVIEW_LIMIT}`);
  const fields = inputFields({ calendarId: "preview", title: "preview", durationMinutes: 1, ...input });
  const c = compile(fields);
  assertValidSeries(c);
  const windowed = options.from !== undefined || options.to !== undefined;
  const from = options.from ?? -Infinity, to = options.to ?? Infinity;
  if (windowed && !(from < to)) invalid("from must be before to");
  const out: PreviewOccurrence[] = [];
  for (const wall of baseWalls(c, Number.isFinite(from) ? from - c.durationMs - SKEW : undefined, options.stats)) {
    if (wall + SKEW + c.durationMs < from) continue;
    if (wall - SKEW >= to) break;
    const start = wallToInstant(c.zone, wall);
    if (start >= to) break;
    if (!overlaps(start, start + c.durationMs, from, to)) continue;
    out.push({ start, end: start + c.durationMs, startLocal: formatLocal(wall) });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------- service

export interface RecurringEvents {
  createSeries(input: SeriesInput): Promise<EventSeries>;
  getSeries(seriesId: string): Promise<{ series: EventSeries; overrides: OccurrenceOverride[] } | null>;
  /** Occurrences of one calendar overlapping [from, to), earliest first, at most `limit` (default 500). */
  listOccurrences(query: WindowQuery & { readonly calendarId: string }): Promise<WindowResult>;
  seriesOccurrences(seriesId: string, query: WindowQuery): Promise<WindowResult>;
  editOccurrence(seriesId: string, recurrenceId: string, changes: OccurrenceChanges, options?: VersionOption): Promise<{ series: EventSeries; override: OccurrenceOverride }>;
  cancelOccurrence(seriesId: string, recurrenceId: string, options?: VersionOption): Promise<{ series: EventSeries; override: OccurrenceOverride }>;
  /** Removes an occurrence's override (un-cancels it and drops its changes). */
  restoreOccurrence(seriesId: string, recurrenceId: string, options?: VersionOption): Promise<EventSeries>;
  editSeries(seriesId: string, edit: { readonly scope: EditScope; readonly recurrenceId?: string; readonly changes: SeriesChanges; readonly expectedVersion?: number }): Promise<EditResult>;
  deleteOccurrences(seriesId: string, request: { readonly scope: EditScope; readonly recurrenceId?: string; readonly expectedVersion?: number }): Promise<EventSeries | null>;
  exportIcs(seriesId: string, options?: IcsOptions): Promise<string>;
}

export function createRecurringEvents(options: RecurringEventsOptions): RecurringEvents {
  const { store } = options;
  const clock = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const maxOverrides = options.maxOverridesPerSeries ?? 1000;
  const maxOccurrences = options.maxOccurrences ?? 2000;
  const maxSeries = options.maxSeriesPerQuery ?? 1000;

  function window(query: WindowQuery): { from: number; to: number; limit: number } {
    const { from, to } = query;
    const limit = query.limit ?? Math.min(500, maxOccurrences);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to) invalid("from and to must be epoch milliseconds with from before to");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxOccurrences) invalid(`limit must be an integer from 1 to ${maxOccurrences}`);
    return { from, to, limit };
  }

  async function load(seriesId: string, expectedVersion?: number): Promise<{ series: EventSeries; overrides: OccurrenceOverride[] }> {
    if (typeof seriesId !== "string" || !seriesId || seriesId.length > 200) throw new RecurringEventsError("not-found", "Series not found");
    const series = await store.getSeries(seriesId);
    if (!series) throw new RecurringEventsError("not-found", "Series not found");
    if (version(expectedVersion) !== undefined && expectedVersion !== series.version) throw new RecurringEventsError("version-conflict", "The series changed; reload and retry");
    const overrides = (await store.listOverrides([seriesId])).filter((o) => o.seriesId === seriesId);
    return { series, overrides };
  }

  async function save(current: EventSeries, next: EventSeries, changes: OverrideChanges): Promise<void> {
    if (!(await store.updateSeries(next, current.version, changes))) throw new RecurringEventsError("version-conflict", "The series changed; reload and retry");
  }

  const fieldsOf = (s: EventSeries): SeriesFields => ({
    calendarId: s.calendarId, title: s.title, description: s.description, location: s.location, timeZone: s.timeZone,
    start: s.start, durationMinutes: s.durationMinutes, rrule: s.rrule, exdates: s.exdates, rdates: s.rdates,
  });

  const shift = (values: readonly string[], delta: number): string[] => values.map((v) => formatLocal(parseLocal(v) + delta));

  /**
   * Re-anchors exceptions after a timing change: shifts EXDATEs, RDATEs and override recurrence ids by the start's
   * wall-clock delta (unless the caller set the lists), then drops EXDATEs and overrides that no longer match.
   */
  function reanchor(fields: SeriesFields, raw: Record<string, unknown>, oldExdates: readonly string[], oldRdates: readonly string[], overrides: readonly OccurrenceOverride[], delta: number, seriesId: string) {
    const exdates = raw.exdates !== undefined ? fields.exdates : shift(oldExdates, delta);
    const rdates = (raw.rdates !== undefined ? fields.rdates : shift(oldRdates, delta)).filter((r) => r !== fields.start);
    const draft = { ...fields, exdates, rdates };
    const c = compile(draft);
    assertValidSeries(c);
    const loose = compile(draft, false);
    const exWalls = exdates.map((x) => parseLocal(x));
    const exMatch = occurrenceSet(loose, exWalls);
    const keptEx = exWalls.filter((w) => exMatch.has(w)).map(formatLocal);
    const moved = overrides.map((o) => ({ ...o, seriesId, recurrenceId: formatLocal(parseLocal(o.recurrenceId) + delta) }));
    const ovMatch = occurrenceSet(c, moved.map((o) => parseLocal(o.recurrenceId)));
    const keptOv = moved.filter((o) => ovMatch.has(parseLocal(o.recurrenceId)));
    const finalFields: SeriesFields = { ...draft, exdates: keptEx };
    return { fields: finalFields, compiled: compile(finalFields), overrides: keptOv, dropped: (exdates.length - keptEx.length) + (overrides.length - keptOv.length) };
  }

  async function editAll(current: EventSeries, overrides: OccurrenceOverride[], raw: Record<string, unknown>): Promise<EditResult> {
    const fields = applyChanges(fieldsOf(current), raw);
    const timing = fields.start !== current.start || fields.rrule !== current.rrule || fields.timeZone !== current.timeZone || raw.exdates !== undefined || raw.rdates !== undefined;
    let result = { fields, compiled: compile(fields), overrides: overrides as readonly OccurrenceOverride[], dropped: 0 };
    let changes: OverrideChanges = { remove: [], upsert: [] };
    if (timing) {
      result = reanchor(fields, raw, current.exdates, current.rdates, overrides, parseLocal(fields.start) - parseLocal(current.start), current.id);
      changes = { remove: overrides.map((o) => o.recurrenceId), upsert: result.overrides };
    }
    assertValidSeries(result.compiled);
    const next: EventSeries = { ...current, ...result.fields, version: current.version + 1, updatedAt: clock(), ...computeRange(result.compiled, result.overrides) };
    await save(current, next, changes);
    return { series: next, created: null, override: null, droppedExceptions: result.dropped };
  }

  /** The original series cut to end before `ridWall`, plus what moves to the following part. */
  function truncate(current: EventSeries, overrides: readonly OccurrenceOverride[], c: Compiled, ridWall: number) {
    let rrule = current.rrule, remaining: RecurrenceRule | null = null;
    if (c.rule) {
      let before = 0;
      if (c.rule.count !== null) for (const w of ruleStream(c)) { if (w >= ridWall) break; before++; }
      rrule = formatRRule({ ...c.rule, count: null, until: { utc: true, instant: wallToInstant(c.zone, ridWall) - 1000 } });
      remaining = { ...c.rule, count: c.rule.count === null ? null : c.rule.count - before };
    }
    const early = (v: string): boolean => parseLocal(v) < ridWall;
    const fields: SeriesFields = { ...fieldsOf(current), rrule, exdates: current.exdates.filter(early), rdates: current.rdates.filter(early) };
    const keep = overrides.filter((o) => early(o.recurrenceId));
    const compiled = compile(fields);
    const original: EventSeries = { ...current, ...fields, version: current.version + 1, updatedAt: clock(), ...computeRange(compiled, keep) };
    return {
      original, remaining,
      moveExdates: current.exdates.filter((v) => !early(v)),
      moveRdates: current.rdates.filter((v) => !early(v)),
      moveOverrides: overrides.filter((o) => !early(o.recurrenceId)),
    };
  }

  function splitPoint(c: Compiled, recurrenceId: unknown): number {
    const ridWall = parseLocal(recurrenceId, "recurrenceId");
    if (!isOccurrence(c, ridWall)) throw new RecurringEventsError("not-an-occurrence", "recurrenceId is not an occurrence of the series");
    if (c.rule && ridWall > c.startWall && !isRuleOccurrence(c, ridWall)) invalid("split at an occurrence generated by the rule, not an RDATE");
    return ridWall;
  }

  async function editFollowing(current: EventSeries, overrides: OccurrenceOverride[], recurrenceId: unknown, raw: Record<string, unknown>): Promise<EditResult> {
    const c = compile(current);
    const ridWall = splitPoint(c, recurrenceId);
    if (ridWall <= c.startWall) return editAll(current, overrides, raw);
    const cut = truncate(current, overrides, c, ridWall);
    const base: SeriesFields = { ...fieldsOf(current), start: formatLocal(ridWall), rrule: cut.remaining ? formatRRule(cut.remaining) : null, exdates: [], rdates: [] };
    const fields = applyChanges(base, raw);
    const id = newId();
    const re = reanchor(fields, raw, cut.moveExdates, cut.moveRdates, cut.moveOverrides, parseLocal(fields.start) - ridWall, id);
    const now = clock();
    const created: EventSeries = { id, ...re.fields, splitFrom: current.id, version: 1, createdAt: now, updatedAt: now, ...computeRange(re.compiled, re.overrides) };
    const ok = await store.splitSeries(cut.original, current.version, { remove: cut.moveOverrides.map((o) => o.recurrenceId), upsert: [] }, created, re.overrides);
    if (!ok) throw new RecurringEventsError("version-conflict", "The series changed; reload and retry");
    return { series: cut.original, created, override: null, droppedExceptions: re.dropped };
  }

  async function putOverride(seriesId: string, recurrenceId: unknown, build: (existing: OccurrenceOverride | undefined, rid: string) => OccurrenceOverride, expectedVersion?: number) {
    const ridWall = parseLocal(recurrenceId, "recurrenceId");
    const rid = formatLocal(ridWall);
    const { series, overrides } = await load(seriesId, expectedVersion);
    const c = compile(series);
    if (!isOccurrence(c, ridWall)) throw new RecurringEventsError("not-an-occurrence", "recurrenceId is not an occurrence of the series");
    const existing = overrides.find((o) => o.recurrenceId === rid);
    if (!existing && overrides.length >= maxOverrides) throw new RecurringEventsError("too-many-overrides", `A series holds at most ${maxOverrides} overrides`);
    const override = build(existing, rid);
    const all = [...overrides.filter((o) => o.recurrenceId !== rid), override];
    const next: EventSeries = { ...series, version: series.version + 1, updatedAt: clock(), ...computeRange(c, all) };
    await save(series, next, { remove: [], upsert: [override] });
    return { series: next, override };
  }

  const blank = (seriesId: string, rid: string): OccurrenceOverride => ({
    seriesId, recurrenceId: rid, cancelled: false, start: null, durationMinutes: null, title: null, description: null, location: null, updatedAt: 0,
  });

  const service: RecurringEvents = {
    async createSeries(input) {
      const fields = inputFields(input);
      const c = compile(fields);
      assertValidSeries(c);
      const now = clock();
      const series: EventSeries = { id: newId(), ...fields, splitFrom: null, version: 1, createdAt: now, updatedAt: now, ...computeRange(c, []) };
      await store.insertSeries(series);
      return series;
    },

    async getSeries(seriesId) {
      try { return await load(seriesId); } catch (error) {
        if (error instanceof RecurringEventsError && error.code === "not-found") return null;
        throw error;
      }
    },

    async listOccurrences(query) {
      const { from, to, limit } = window(query);
      const calendarId = textField(query.calendarId, "calendarId", 200, false);
      const found = await store.listSeriesInRange(calendarId, from, to, maxSeries + 1);
      let truncated = found.length > maxSeries;
      const list = found.slice(0, maxSeries).filter((s) => s.calendarId === calendarId);
      const overrides = list.length ? await store.listOverrides(list.map((s) => s.id)) : [];
      const grouped = new Map<string, OccurrenceOverride[]>();
      for (const o of overrides) grouped.set(o.seriesId, [...(grouped.get(o.seriesId) ?? []), o]);
      const all = list.flatMap((s) => windowOccurrences(s, grouped.get(s.id) ?? [], from, to, limit)).sort(byStart);
      if (all.length > limit) truncated = true;
      return { occurrences: all.slice(0, limit), truncated };
    },

    async seriesOccurrences(seriesId, query) {
      const { from, to, limit } = window(query);
      const { series, overrides } = await load(seriesId);
      const found = windowOccurrences(series, overrides, from, to, limit);
      return { occurrences: found.slice(0, limit), truncated: found.length > limit };
    },

    async editOccurrence(seriesId, recurrenceId, changes, opts = {}) {
      const raw = onlyKeys(changes, OCCURRENCE_KEYS, "occurrence change");
      const has = (key: string): boolean => raw[key] !== undefined;
      const start = has("start") ? formatLocal(parseLocal(raw.start, "start")) : undefined;
      const minutes = has("durationMinutes") ? duration(raw.durationMinutes) : undefined;
      const title = has("title") ? textField(raw.title, "title", 500, false).trim() || invalid("title cannot be empty") : undefined;
      const description = has("description") || raw.description === null ? optionalText(raw.description, "description", 8000) : undefined;
      const location = has("location") || raw.location === null ? optionalText(raw.location, "location", 500) : undefined;
      return putOverride(seriesId, recurrenceId, (existing, rid) => {
        const prior = existing ?? blank(seriesId, rid);
        return {
          ...prior, cancelled: false, updatedAt: clock(),
          ...(start === undefined ? {} : { start }),
          ...(minutes === undefined ? {} : { durationMinutes: minutes }),
          ...(title === undefined ? {} : { title }),
          ...(description === undefined ? {} : { description }),
          ...(location === undefined ? {} : { location }),
        };
      }, opts.expectedVersion);
    },

    async cancelOccurrence(seriesId, recurrenceId, opts = {}) {
      return putOverride(seriesId, recurrenceId, (existing, rid) => ({ ...(existing ?? blank(seriesId, rid)), cancelled: true, updatedAt: clock() }), opts.expectedVersion);
    },

    async restoreOccurrence(seriesId, recurrenceId, opts = {}) {
      const rid = formatLocal(parseLocal(recurrenceId, "recurrenceId"));
      const { series, overrides } = await load(seriesId, opts.expectedVersion);
      if (!overrides.some((o) => o.recurrenceId === rid)) return series;
      const rest = overrides.filter((o) => o.recurrenceId !== rid);
      const next: EventSeries = { ...series, version: series.version + 1, updatedAt: clock(), ...computeRange(compile(series), rest) };
      await save(series, next, { remove: [rid], upsert: [] });
      return next;
    },

    async editSeries(seriesId, edit) {
      const request = onlyKeys(edit, ["scope", "recurrenceId", "changes", "expectedVersion"], "edit");
      const scope = request.scope;
      if (scope !== "this" && scope !== "following" && scope !== "all") return invalid('scope must be "this", "following" or "all"');
      const expected = version(request.expectedVersion);
      if (scope === "this") {
        const result = await service.editOccurrence(seriesId, String(request.recurrenceId ?? ""), (request.changes ?? {}) as OccurrenceChanges, expected === undefined ? {} : { expectedVersion: expected });
        return { series: result.series, created: null, override: result.override, droppedExceptions: 0 };
      }
      const raw = onlyKeys(request.changes ?? {}, CHANGE_KEYS, "series change");
      const { series, overrides } = await load(seriesId, expected);
      if (scope === "all") return editAll(series, overrides, raw);
      if (request.recurrenceId === undefined) invalid("recurrenceId is required for scope \"following\"");
      return editFollowing(series, overrides, request.recurrenceId, raw);
    },

    async deleteOccurrences(seriesId, request) {
      const raw = onlyKeys(request, ["scope", "recurrenceId", "expectedVersion"], "delete");
      const expected = version(raw.expectedVersion);
      const versionOption = expected === undefined ? {} : { expectedVersion: expected };
      if (raw.scope === "this") return (await service.cancelOccurrence(seriesId, String(raw.recurrenceId ?? ""), versionOption)).series;
      if (raw.scope !== "following" && raw.scope !== "all") return invalid('scope must be "this", "following" or "all"');
      const { series, overrides } = await load(seriesId, expected);
      if (raw.scope === "following") {
        const c = compile(series);
        const ridWall = splitPoint(c, raw.recurrenceId);
        if (ridWall > c.startWall) {
          const cut = truncate(series, overrides, c, ridWall);
          await save(series, cut.original, { remove: cut.moveOverrides.map((o) => o.recurrenceId), upsert: [] });
          return cut.original;
        }
      }
      if (!(await store.deleteSeries(series.id, series.version))) throw new RecurringEventsError("version-conflict", "The series changed; reload and retry");
      return null;
    },

    async exportIcs(seriesId, icsOptions = {}) {
      const { series, overrides } = await load(seriesId);
      return seriesToIcs(series, overrides, { ...icsOptions, now: clock() });
    },
  };
  return service;
}
