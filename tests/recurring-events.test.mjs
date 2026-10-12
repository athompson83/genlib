// SPDX-License-Identifier: Apache-2.0
// recurring-events core: RFC 5545 rule parsing and expansion, IANA time zones across DST, EXDATE/RDATE and
// RECURRENCE-ID overrides, window queries, series edits (this / this and following / all) and .ics export,
// against the in-memory store with a fake clock.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecurringEvents, parseRRule, formatRRule, previewOccurrences, RecurringEventsError,
} from "../.build/modules/recurring-events/files/core.js";
import { MemoryRecurringEventStore } from "../.build/modules/recurring-events/files/memory-store.js";

const NY = "America/New_York";
const HOUR = 3_600_000;
const DAY = 86_400_000;
const code = (expected) => (error) => error instanceof RecurringEventsError && error.code === expected;

/** Local start strings of the first `limit` occurrences. */
function dates(start, rrule, { timeZone = NY, limit = 50, exdates, rdates } = {}) {
  return previewOccurrences({ start, timeZone, rrule, ...(exdates ? { exdates } : {}), ...(rdates ? { rdates } : {}) }, { limit })
    .map((o) => o.startLocal.slice(0, 10));
}

function setup(extra = {}) {
  let now = Date.UTC(2026, 0, 1);
  let counter = 0;
  const store = extra.store ?? new MemoryRecurringEventStore();
  const events = createRecurringEvents({ store, now: () => now, newId: () => `s${++counter}`, ...extra.options });
  return { store, events, advance: (ms) => { now += ms; } };
}

const iso = (ms) => new Date(ms).toISOString();

// ------------------------------------------------------------------ expand-rules (RFC 5545 section 3.8.5.3 examples)

test("expand-rules: RFC 5545 DAILY, WEEKLY, MONTHLY and YEARLY examples with INTERVAL, COUNT and UNTIL", () => {
  assert.deepEqual(dates("1997-09-02T09:00", "FREQ=DAILY;COUNT=10"),
    ["1997-09-02", "1997-09-03", "1997-09-04", "1997-09-05", "1997-09-06", "1997-09-07", "1997-09-08", "1997-09-09", "1997-09-10", "1997-09-11"]);
  assert.deepEqual(dates("1997-09-02T09:00", "FREQ=DAILY;INTERVAL=10;COUNT=5"),
    ["1997-09-02", "1997-09-12", "1997-09-22", "1997-10-02", "1997-10-12"]);
  assert.deepEqual(dates("1997-09-02T09:00", "FREQ=DAILY;INTERVAL=2", { limit: 4 }),
    ["1997-09-02", "1997-09-04", "1997-09-06", "1997-09-08"]);
  assert.deepEqual(dates("1997-09-02T09:00", "FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH"),
    ["1997-09-02", "1997-09-04", "1997-09-09", "1997-09-11", "1997-09-16", "1997-09-18", "1997-09-23", "1997-09-25", "1997-09-30", "1997-10-02"]);
  assert.deepEqual(dates("1997-09-01T09:00", "FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR"),
    ["1997-09-01", "1997-09-03", "1997-09-05", "1997-09-15", "1997-09-17", "1997-09-19", "1997-09-29", "1997-10-01", "1997-10-03",
      "1997-10-13", "1997-10-15", "1997-10-17", "1997-10-27", "1997-10-29", "1997-10-31", "1997-11-10", "1997-11-12", "1997-11-14",
      "1997-11-24", "1997-11-26", "1997-11-28", "1997-12-08", "1997-12-10", "1997-12-12", "1997-12-22"]);
  assert.deepEqual(dates("1997-09-02T09:00", "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15"),
    ["1997-09-02", "1997-09-15", "1997-10-02", "1997-10-15", "1997-11-02", "1997-11-15", "1997-12-02", "1997-12-15", "1998-01-02", "1998-01-15"]);
  assert.deepEqual(dates("1997-09-28T09:00", "FREQ=MONTHLY;BYMONTHDAY=-3", { limit: 6 }),
    ["1997-09-28", "1997-10-29", "1997-11-28", "1997-12-29", "1998-01-29", "1998-02-26"]);
  assert.deepEqual(dates("1997-06-10T09:00", "FREQ=YEARLY;COUNT=10;BYMONTH=6,7"),
    ["1997-06-10", "1997-07-10", "1998-06-10", "1998-07-10", "1999-06-10", "1999-07-10", "2000-06-10", "2000-07-10", "2001-06-10", "2001-07-10"]);
  assert.deepEqual(dates("1997-03-13T09:00", "FREQ=YEARLY;BYMONTH=3;BYDAY=TH", { limit: 11 }),
    ["1997-03-13", "1997-03-20", "1997-03-27", "1998-03-05", "1998-03-12", "1998-03-19", "1998-03-26", "1999-03-04", "1999-03-11", "1999-03-18", "1999-03-25"]);
  // Invalid dates are skipped, not clamped: the 31st only in months that have one; Feb 29 only in leap years.
  assert.deepEqual(dates("2007-01-31T09:00", "FREQ=MONTHLY;COUNT=5"), ["2007-01-31", "2007-03-31", "2007-05-31", "2007-07-31", "2007-08-31"]);
  assert.deepEqual(dates("2024-02-29T09:00", "FREQ=YEARLY;COUNT=3"), ["2024-02-29", "2028-02-29", "2032-02-29"]);
});

test("expand-rules: BYDAY ordinals (1FR, -1SU, -2MO, 20MO) and BYDAY combined with BYMONTHDAY", () => {
  assert.deepEqual(dates("1997-09-05T09:00", "FREQ=MONTHLY;COUNT=10;BYDAY=1FR"),
    ["1997-09-05", "1997-10-03", "1997-11-07", "1997-12-05", "1998-01-02", "1998-02-06", "1998-03-06", "1998-04-03", "1998-05-01", "1998-06-05"]);
  assert.deepEqual(dates("1997-09-07T09:00", "FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU"),
    ["1997-09-07", "1997-09-28", "1997-11-02", "1997-11-30", "1998-01-04", "1998-01-25", "1998-03-01", "1998-03-29", "1998-05-03", "1998-05-31"]);
  assert.deepEqual(dates("1997-09-22T09:00", "FREQ=MONTHLY;COUNT=6;BYDAY=-2MO"),
    ["1997-09-22", "1997-10-20", "1997-11-17", "1997-12-22", "1998-01-19", "1998-02-16"]);
  assert.deepEqual(dates("1997-05-19T09:00", "FREQ=YEARLY;BYDAY=20MO", { limit: 3 }), ["1997-05-19", "1998-05-18", "1999-05-17"]);
  // Friday the 13th.
  assert.deepEqual(dates("1998-02-13T09:00", "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13", { limit: 5 }),
    ["1998-02-13", "1998-03-13", "1998-11-13", "1999-08-13", "2000-10-13"]);
  // First Saturday after the first Sunday.
  assert.deepEqual(dates("1997-09-13T09:00", "FREQ=MONTHLY;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13", { limit: 10 }),
    ["1997-09-13", "1997-10-11", "1997-11-08", "1997-12-13", "1998-01-10", "1998-02-07", "1998-03-07", "1998-04-11", "1998-05-09", "1998-06-13"]);
  // US presidential election day.
  assert.deepEqual(dates("1996-11-05T09:00", "FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8", { limit: 3 }),
    ["1996-11-05", "2000-11-07", "2004-11-02"]);
});

test("expand-rules: BYSETPOS and WKST follow the RFC 5545 examples", () => {
  assert.deepEqual(dates("1997-09-04T09:00", "FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3"), ["1997-09-04", "1997-10-07", "1997-11-06"]);
  assert.deepEqual(dates("1997-09-29T09:00", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2", { limit: 7 }),
    ["1997-09-29", "1997-10-30", "1997-11-27", "1997-12-30", "1998-01-29", "1998-02-26", "1998-03-30"]);
  // Last weekday of the month.
  assert.deepEqual(dates("2026-01-30T17:00", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", { limit: 3 }), ["2026-01-30", "2026-02-27", "2026-03-31"]);
  // WKST changes which week an INTERVAL=2 rule counts in.
  assert.deepEqual(dates("1997-08-05T09:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO"), ["1997-08-05", "1997-08-10", "1997-08-19", "1997-08-24"]);
  assert.deepEqual(dates("1997-08-05T09:00", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU"), ["1997-08-05", "1997-08-17", "1997-08-19", "1997-08-31"]);
});

test("expand-rules: rules parse case-insensitively with an optional RRULE: prefix and format back canonically", () => {
  const rule = parseRRule("rrule:freq=monthly;byday=-1fr;interval=1;wkst=mo");
  assert.equal(rule.freq, "MONTHLY");
  assert.deepEqual(rule.byday, [{ ordinal: -1, weekday: 4 }]);
  assert.equal(formatRRule(rule), "FREQ=MONTHLY;BYDAY=-1FR");
  assert.equal(formatRRule(parseRRule("FREQ=WEEKLY;UNTIL=20261231T235959Z;BYDAY=MO,WE;WKST=SU;INTERVAL=2")),
    "FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235959Z;BYDAY=MO,WE;WKST=SU");
  // UNTIL as a DATE is inclusive of that local day.
  assert.deepEqual(dates("2026-05-01T09:00", "FREQ=DAILY;UNTIL=20260503", { timeZone: "UTC" }), ["2026-05-01", "2026-05-02", "2026-05-03"]);
});

// ------------------------------------------------------------------ reject-invalid

test("reject-invalid: malformed and unsupported rules are refused with a specific code", () => {
  const invalid = [
    "", "INTERVAL=2", "FREQ=FORTNIGHTLY", "FREQ=DAILY;COUNT=3;UNTIL=20260101T000000Z", "FREQ=DAILY;FREQ=WEEKLY",
    "FREQ=DAILY;INTERVAL=0", "FREQ=DAILY;COUNT=0", "FREQ=DAILY;COUNT=abc", "FREQ=WEEKLY;BYDAY=1MO", "FREQ=MONTHLY;BYDAY=6MO",
    "FREQ=MONTHLY;BYDAY=0MO", "FREQ=MONTHLY;BYDAY=XX", "FREQ=MONTHLY;BYMONTHDAY=0", "FREQ=MONTHLY;BYMONTHDAY=32",
    "FREQ=YEARLY;BYMONTH=13", "FREQ=MONTHLY;BYSETPOS=1", "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=0", "FREQ=WEEKLY;BYMONTHDAY=1",
    "FREQ=DAILY;UNTIL=2026-01-01", "FREQ=DAILY;UNTIL=20260231T000000Z", "FREQ=DAILY;WKST=XX", "FREQ=DAILY;X-NAME=1", "FREQ=DAILY;;",
    "FREQ=DAILY;COUNT", "x".repeat(2000),
  ];
  for (const rule of invalid) assert.throws(() => parseRRule(rule), code("invalid-rule"), rule.slice(0, 40));
  for (const rule of ["FREQ=HOURLY", "FREQ=MINUTELY", "FREQ=SECONDLY", "FREQ=DAILY;BYHOUR=9", "FREQ=YEARLY;BYWEEKNO=20", "FREQ=YEARLY;BYYEARDAY=100", "FREQ=DAILY;BYMINUTE=5"]) {
    assert.throws(() => parseRRule(rule), code("unsupported-rule"), rule);
  }
});

test("reject-invalid: a start that is not an occurrence of its rule, or a rule that never occurs, is refused", async () => {
  const { events } = setup();
  const base = { calendarId: "c1", title: "Standup", timeZone: NY, durationMinutes: 15 };
  // 2026-03-03 is a Tuesday.
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", rrule: "FREQ=WEEKLY;BYDAY=MO" }), code("invalid-rule"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-01-30T09:00", rrule: "FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=30" }), code("invalid-rule"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", rrule: "FREQ=DAILY;UNTIL=20260302T000000Z" }), code("invalid-rule"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", timeZone: "Mars/Olympus" }), code("invalid-input"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-02-30T09:00" }), code("invalid-input"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", durationMinutes: 0 }), code("invalid-input"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", title: "" }), code("invalid-input"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", unknown: 1 }), code("invalid-input"));
  await assert.rejects(events.createSeries({ ...base, start: "2026-03-03T09:00", rdates: ["2026-03-01T09:00"] }), code("invalid-input"));
});

test("reject-invalid: expansion is bounded by limit, window size and the occurrence cap", async () => {
  // An infinite rule returns exactly `limit` occurrences.
  assert.equal(previewOccurrences({ start: "2026-01-01T09:00", timeZone: NY, rrule: "FREQ=DAILY" }, { limit: 1000 }).length, 1000);
  assert.throws(() => previewOccurrences({ start: "2026-01-01T09:00", timeZone: NY, rrule: "FREQ=DAILY" }, { limit: 1_000_001 }), code("invalid-input"));
  assert.throws(() => previewOccurrences({ start: "2026-01-01T09:00", timeZone: NY, rrule: "FREQ=DAILY" }, { limit: 0 }), code("invalid-input"));
  const { events } = setup({ options: { maxOccurrences: 100 } });
  const series = await events.createSeries({ calendarId: "c1", title: "Daily", timeZone: NY, start: "2026-01-01T09:00", durationMinutes: 30, rrule: "FREQ=DAILY" });
  const result = await events.seriesOccurrences(series.id, { from: Date.UTC(2026, 0, 1), to: Date.UTC(2100, 0, 1), limit: 100 });
  assert.equal(result.occurrences.length, 100);
  assert.equal(result.truncated, true);
  await assert.rejects(events.seriesOccurrences(series.id, { from: Date.UTC(2026, 0, 1), to: Date.UTC(2027, 0, 1), limit: 101 }), code("invalid-input"));
  await assert.rejects(events.seriesOccurrences(series.id, { from: Date.UTC(2027, 0, 1), to: Date.UTC(2026, 0, 1) }), code("invalid-input"));
  // COUNT is capped.
  assert.throws(() => parseRRule("FREQ=DAILY;COUNT=100001"), code("invalid-rule"));
});

// ------------------------------------------------------------------ timezone-wall-clock

test("timezone-wall-clock: a weekly 09:00 New York meeting stays at 09:00 local across both DST changes", () => {
  // RFC 5545 example: weekly for 10 occurrences; DST ended 1997-10-26.
  const occurrences = previewOccurrences({ start: "1997-09-02T09:00", timeZone: NY, rrule: "FREQ=WEEKLY;COUNT=10" }, { limit: 50 });
  assert.ok(occurrences.every((o) => o.startLocal.endsWith("T09:00:00")));
  assert.equal(iso(occurrences[7].start), "1997-10-21T13:00:00.000Z", "EDT, UTC-4");
  assert.equal(iso(occurrences[8].start), "1997-10-28T14:00:00.000Z", "EST, UTC-5");
  // Spring forward 2026-03-08.
  const spring = previewOccurrences({ start: "2026-03-01T09:00", timeZone: NY, rrule: "FREQ=WEEKLY;COUNT=3" }, { limit: 5 }).map((o) => iso(o.start));
  assert.deepEqual(spring, ["2026-03-01T14:00:00.000Z", "2026-03-08T13:00:00.000Z", "2026-03-15T13:00:00.000Z"]);
  // Southern hemisphere: Sydney leaves DST on 2026-04-05.
  const sydney = previewOccurrences({ start: "2026-03-29T10:00", timeZone: "Australia/Sydney", rrule: "FREQ=WEEKLY;COUNT=2" }, { limit: 5 }).map((o) => iso(o.start));
  assert.deepEqual(sydney, ["2026-03-28T23:00:00.000Z", "2026-04-05T00:00:00.000Z"]);
});

test("timezone-wall-clock: a time skipped by spring-forward shifts by the gap; a repeated time uses its first instance", () => {
  const gap = previewOccurrences({ start: "2026-03-07T02:30", timeZone: NY, rrule: "FREQ=DAILY;COUNT=3" }, { limit: 5 });
  assert.deepEqual(gap.map((o) => iso(o.start)), ["2026-03-07T07:30:00.000Z", "2026-03-08T07:30:00.000Z", "2026-03-09T06:30:00.000Z"]);
  assert.deepEqual(gap.map((o) => o.startLocal), ["2026-03-07T02:30:00", "2026-03-08T02:30:00", "2026-03-09T02:30:00"], "recurrence ids keep the nominal wall time");
  const overlap = previewOccurrences({ start: "2026-10-31T01:30", timeZone: NY, rrule: "FREQ=DAILY;COUNT=3" }, { limit: 5 });
  assert.deepEqual(overlap.map((o) => iso(o.start)), ["2026-10-31T05:30:00.000Z", "2026-11-01T05:30:00.000Z", "2026-11-02T06:30:00.000Z"]);
  // UNTIL in UTC is compared with real instants: 09:00 EST on 2026-11-02 is 14:00Z.
  assert.deepEqual(dates("2026-10-31T09:00", "FREQ=DAILY;UNTIL=20261102T140000Z"), ["2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(dates("2026-10-31T09:00", "FREQ=DAILY;UNTIL=20261102T135959Z"), ["2026-10-31", "2026-11-01"]);
});

test("timezone-wall-clock: stored series expose instants and the event's zone; durations are exact", async () => {
  const { events } = setup();
  const series = await events.createSeries({ calendarId: "c1", title: "Overnight", timeZone: NY, start: "2026-03-07T23:00", durationMinutes: 240, rrule: "FREQ=DAILY;COUNT=2" });
  const { occurrences } = await events.seriesOccurrences(series.id, { from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 2, 31) });
  assert.equal(occurrences.length, 2);
  // 23:00 EST + 4h crosses the spring-forward gap: ends 04:00 EDT (4 real hours).
  assert.equal(occurrences[0].end - occurrences[0].start, 4 * HOUR);
  assert.equal(occurrences[0].timeZone, NY);
  assert.equal(occurrences[0].startLocal, "2026-03-07T23:00:00");
  assert.equal(iso(occurrences[1].start), "2026-03-09T03:00:00.000Z");
});

// ------------------------------------------------------------------ exceptions

test("exceptions: EXDATE removes and RDATE adds occurrences, and both survive storage", async () => {
  assert.deepEqual(dates("2026-06-01T09:00", "FREQ=DAILY;COUNT=5", { exdates: ["2026-06-02T09:00", "2026-06-04T09:00:00"], rdates: ["2026-06-10T09:00", "2026-06-03T09:00"] }),
    ["2026-06-01", "2026-06-03", "2026-06-05", "2026-06-10"]);
  // EXDATE also removes an RDATE; COUNT counts rule occurrences before EXDATE is applied.
  assert.deepEqual(dates("2026-06-01T09:00", "FREQ=DAILY;COUNT=2", { exdates: ["2026-06-01T09:00", "2026-06-07T09:00"], rdates: ["2026-06-07T09:00"] }), ["2026-06-02"]);
  // An RDATE may carry a different time of day.
  const { events } = setup();
  const series = await events.createSeries({
    calendarId: "c1", title: "Class", timeZone: NY, start: "2026-06-01T09:00", durationMinutes: 60, rrule: "FREQ=WEEKLY;COUNT=3",
    exdates: ["2026-06-08T09:00"], rdates: ["2026-06-09T14:00"],
  });
  const { occurrences } = await events.seriesOccurrences(series.id, { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 1) });
  assert.deepEqual(occurrences.map((o) => o.startLocal), ["2026-06-01T09:00:00", "2026-06-09T14:00:00", "2026-06-15T09:00:00"]);
  const stored = await events.getSeries(series.id);
  assert.deepEqual(stored.series.exdates, ["2026-06-08T09:00:00"]);
  assert.deepEqual(stored.series.rdates, ["2026-06-09T14:00:00"]);
});

test("exceptions: a single occurrence can be moved, retitled, cancelled and restored by RECURRENCE-ID", async () => {
  const { events } = setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Sync", timeZone: NY, start: "2026-06-01T09:00", durationMinutes: 30, rrule: "FREQ=WEEKLY" });
  const window = { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 29) };
  const moved = await events.editOccurrence(s.id, "2026-06-08T09:00", { start: "2026-06-10T15:00", title: "Sync (moved)", durationMinutes: 45 });
  assert.equal(moved.series.version, 2);
  assert.equal(moved.override.recurrenceId, "2026-06-08T09:00:00");
  await events.cancelOccurrence(s.id, "2026-06-15T09:00");
  let { occurrences } = await events.seriesOccurrences(s.id, window);
  assert.deepEqual(occurrences.map((o) => [o.recurrenceId, o.startLocal, o.title, o.overridden]), [
    ["2026-06-01T09:00:00", "2026-06-01T09:00:00", "Sync", false],
    ["2026-06-08T09:00:00", "2026-06-10T15:00:00", "Sync (moved)", true],
    ["2026-06-22T09:00:00", "2026-06-22T09:00:00", "Sync", false],
  ]);
  assert.equal(occurrences[1].end - occurrences[1].start, 45 * 60_000);
  // A moved occurrence appears in windows that cover its new time, not its original one.
  const onlyOriginal = await events.seriesOccurrences(s.id, { from: Date.UTC(2026, 5, 8), to: Date.UTC(2026, 5, 9) });
  assert.equal(onlyOriginal.occurrences.length, 0);
  const onlyNew = await events.seriesOccurrences(s.id, { from: Date.UTC(2026, 5, 10), to: Date.UTC(2026, 5, 11) });
  assert.deepEqual(onlyNew.occurrences.map((o) => o.recurrenceId), ["2026-06-08T09:00:00"]);
  await events.restoreOccurrence(s.id, "2026-06-15T09:00");
  ({ occurrences } = await events.seriesOccurrences(s.id, window));
  assert.equal(occurrences.length, 4);
  // Only real occurrences can be overridden.
  await assert.rejects(events.editOccurrence(s.id, "2026-06-09T09:00", { title: "x" }), code("not-an-occurrence"));
  await assert.rejects(events.cancelOccurrence(s.id, "2026-06-08T10:00"), code("not-an-occurrence"));
  await assert.rejects(events.editOccurrence(s.id, "2026-06-22T09:00", { rrule: "FREQ=DAILY" }), code("invalid-input"));
});

test("exceptions: the override cap and optimistic versions are enforced; concurrent edits produce one conflict", async () => {
  const { events } = setup({ options: { maxOverridesPerSeries: 2 } });
  const s = await events.createSeries({ calendarId: "c1", title: "Sync", timeZone: "UTC", start: "2026-06-01T09:00", durationMinutes: 30, rrule: "FREQ=DAILY" });
  await events.cancelOccurrence(s.id, "2026-06-02T09:00");
  await events.cancelOccurrence(s.id, "2026-06-03T09:00");
  await assert.rejects(events.cancelOccurrence(s.id, "2026-06-04T09:00"), code("too-many-overrides"));
  // Editing an existing override does not count against the cap.
  await events.editOccurrence(s.id, "2026-06-03T09:00", { title: "Back on" });
  const current = (await events.getSeries(s.id)).series;
  await assert.rejects(events.editOccurrence(s.id, "2026-06-02T09:00", { title: "x" }, { expectedVersion: current.version - 1 }), code("version-conflict"));
  const results = await Promise.allSettled([
    events.editSeries(s.id, { scope: "all", changes: { title: "A" }, expectedVersion: current.version }),
    events.editSeries(s.id, { scope: "all", changes: { title: "B" }, expectedVersion: current.version }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(code("version-conflict")(results.find((r) => r.status === "rejected").reason));
});

// ------------------------------------------------------------------ window-query

test("window-query: listOccurrences returns overlapping occurrences across a calendar's series in start order", async () => {
  const { events } = setup();
  await events.createSeries({ calendarId: "c1", title: "Weekly", timeZone: NY, start: "2026-06-01T09:00", durationMinutes: 60, rrule: "FREQ=WEEKLY" });
  await events.createSeries({ calendarId: "c1", title: "Once", timeZone: "Europe/London", start: "2026-06-03T12:00", durationMinutes: 60 });
  await events.createSeries({ calendarId: "c1", title: "Ended", timeZone: NY, start: "2025-01-01T09:00", durationMinutes: 60, rrule: "FREQ=DAILY;COUNT=3" });
  await events.createSeries({ calendarId: "other", title: "Hidden", timeZone: NY, start: "2026-06-02T09:00", durationMinutes: 60, rrule: "FREQ=DAILY" });
  const { occurrences, truncated } = await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 15) });
  assert.equal(truncated, false);
  assert.deepEqual(occurrences.map((o) => `${o.title}@${iso(o.start)}`), [
    "Weekly@2026-06-01T13:00:00.000Z", "Once@2026-06-03T11:00:00.000Z", "Weekly@2026-06-08T13:00:00.000Z",
  ]);
  // An occurrence that started before `from` but is still running is included.
  const partial = await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2026, 5, 1, 13, 30), to: Date.UTC(2026, 5, 1, 14) });
  assert.deepEqual(partial.occurrences.map((o) => o.title), ["Weekly"]);
  // The limit keeps the earliest occurrences and reports truncation.
  const limited = await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 15), limit: 2 });
  assert.deepEqual(limited.occurrences.map((o) => o.title), ["Weekly", "Once"]);
  assert.equal(limited.truncated, true);
});

test("window-query: a window decades into an infinite series skips straight to it", async () => {
  const stats = { periods: 0 };
  const far = previewOccurrences({ start: "2000-01-03T09:00", timeZone: NY, rrule: "FREQ=DAILY" }, { from: Date.UTC(2090, 0, 1), to: Date.UTC(2090, 0, 8), limit: 50, stats });
  assert.deepEqual(far.map((o) => o.startLocal.slice(0, 10)), ["2090-01-01", "2090-01-02", "2090-01-03", "2090-01-04", "2090-01-05", "2090-01-06", "2090-01-07"]);
  assert.ok(stats.periods < 20, `scanned ${stats.periods} periods`);
  for (const [rule, start] of [["FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TH", "2000-01-03T09:00"], ["FREQ=MONTHLY;BYDAY=-1FR", "2000-01-28T09:00"], ["FREQ=YEARLY;BYMONTH=11;BYDAY=4TH", "2000-11-23T09:00"]]) {
    const local = { periods: 0 };
    const window = previewOccurrences({ start, timeZone: NY, rrule: rule }, { from: Date.UTC(2090, 0, 1), to: Date.UTC(2091, 0, 1), limit: 200, stats: local });
    const full = previewOccurrences({ start, timeZone: NY, rrule: rule }, { limit: 10000 }).filter((o) => o.start >= Date.UTC(2090, 0, 1) && o.start < Date.UTC(2091, 0, 1));
    assert.deepEqual(window.map((o) => o.start), full.map((o) => o.start), rule);
    assert.ok(window.length > 0 && local.periods < 40, `${rule}: ${local.periods} periods`);
  }
  // The stored series agrees; series that ended or start later are not loaded at all.
  const { events, store } = setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Daily", timeZone: NY, start: "2000-01-03T09:00", durationMinutes: 30, rrule: "FREQ=DAILY" });
  await events.createSeries({ calendarId: "c1", title: "Old", timeZone: NY, start: "2001-01-01T09:00", durationMinutes: 30, rrule: "FREQ=DAILY;UNTIL=20010201T000000Z" });
  await events.createSeries({ calendarId: "c1", title: "Later", timeZone: NY, start: "2095-01-01T09:00", durationMinutes: 30 });
  const ranged = await store.listSeriesInRange("c1", Date.UTC(2090, 0, 1), Date.UTC(2090, 0, 8), 10);
  assert.deepEqual(ranged.map((x) => x.id), [s.id]);
  const { occurrences } = await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2090, 0, 1), to: Date.UTC(2090, 0, 8) });
  assert.equal(occurrences.length, 7);
});

// ------------------------------------------------------------------ series-edits

test("series-edits: 'this and following' splits the series and leaves past occurrences unchanged", async () => {
  const { events } = setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Standup", timeZone: NY, start: "2026-06-01T09:00", durationMinutes: 15, rrule: "FREQ=WEEKLY;BYDAY=MO,WE" });
  await events.editOccurrence(s.id, "2026-06-03T09:00", { title: "Early standup", start: "2026-06-03T08:00" });
  await events.editOccurrence(s.id, "2026-06-17T09:00", { title: "Late standup" });
  const window = { calendarId: "c1", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 1) };
  const before = (await events.listOccurrences(window)).occurrences;
  const result = await events.editSeries(s.id, { scope: "following", recurrenceId: "2026-06-15T09:00", changes: { start: "2026-06-15T10:00", title: "Standup v2" } });
  assert.match(result.series.rrule, /UNTIL=20260615T125959Z/);
  assert.equal(result.created.splitFrom, s.id);
  assert.equal(result.created.start, "2026-06-15T10:00:00");
  const after = (await events.listOccurrences(window)).occurrences;
  const past = (list) => list.filter((o) => o.start < Date.UTC(2026, 5, 15)).map((o) => JSON.stringify(o));
  assert.deepEqual(past(after), past(before), "occurrences before the split are byte-for-byte identical");
  assert.deepEqual(after.filter((o) => o.start >= Date.UTC(2026, 5, 15)).map((o) => `${o.title} ${o.startLocal}`), [
    "Standup v2 2026-06-15T10:00:00", "Late standup 2026-06-17T10:00:00", "Standup v2 2026-06-22T10:00:00",
    "Standup v2 2026-06-24T10:00:00", "Standup v2 2026-06-29T10:00:00",
  ]);
  // The override after the split moved to the new series with its recurrence id shifted by the same hour.
  const created = await events.getSeries(result.created.id);
  assert.deepEqual(created.overrides.map((o) => o.recurrenceId), ["2026-06-17T10:00:00"]);
  const original = await events.getSeries(s.id);
  assert.deepEqual(original.overrides.map((o) => o.recurrenceId), ["2026-06-03T09:00:00"]);
});

test("series-edits: splitting a COUNT rule divides the remaining count; splitting at the first occurrence edits all", async () => {
  const { events } = setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Course", timeZone: "UTC", start: "2026-06-01T09:00", durationMinutes: 60, rrule: "FREQ=DAILY;COUNT=10" });
  const split = await events.editSeries(s.id, { scope: "following", recurrenceId: "2026-06-05T09:00", changes: { location: "Room 2" } });
  assert.equal(split.created.rrule, "FREQ=DAILY;COUNT=6");
  const all = (await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 1) })).occurrences;
  assert.equal(all.length, 10);
  assert.deepEqual(all.map((o) => o.location), [null, null, null, null, "Room 2", "Room 2", "Room 2", "Room 2", "Room 2", "Room 2"]);
  const first = await events.editSeries(split.created.id, { scope: "following", recurrenceId: "2026-06-05T09:00", changes: { title: "Course+" } });
  assert.equal(first.created, null);
  assert.equal(first.series.title, "Course+");
  await assert.rejects(events.editSeries(s.id, { scope: "following", recurrenceId: "2026-06-07T09:00", changes: {} }), code("not-an-occurrence"));
});

test("series-edits: 'all' edits change every occurrence, shift matching exceptions and drop ones that no longer match", async () => {
  const { events } = setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Review", timeZone: NY, start: "2026-06-01T09:00", durationMinutes: 30, rrule: "FREQ=WEEKLY", exdates: ["2026-06-15T09:00"] });
  await events.editOccurrence(s.id, "2026-06-08T09:00", { title: "Review (special)" });
  const moved = await events.editSeries(s.id, { scope: "all", changes: { start: "2026-06-01T11:00", title: "Review 2" } });
  assert.deepEqual(moved.series.exdates, ["2026-06-15T11:00:00"]);
  let { occurrences } = await events.seriesOccurrences(s.id, { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 23) });
  assert.deepEqual(occurrences.map((o) => `${o.title} ${o.startLocal}`), ["Review 2 2026-06-01T11:00:00", "Review (special) 2026-06-08T11:00:00", "Review 2 2026-06-22T11:00:00"]);
  // A rule change that keeps every exception's date drops nothing; one that removes them drops the override and EXDATE.
  const rule = await events.editSeries(s.id, { scope: "all", changes: { rrule: "FREQ=WEEKLY;BYDAY=MO,TU" } });
  assert.equal(rule.droppedExceptions, 0);
  const sparse = await events.editSeries(s.id, { scope: "all", changes: { rrule: "FREQ=WEEKLY;INTERVAL=3" } });
  assert.equal(sparse.droppedExceptions, 2);
  assert.deepEqual(sparse.series.exdates, []);
  assert.deepEqual((await events.getSeries(s.id)).overrides, []);
  ({ occurrences } = await events.seriesOccurrences(s.id, { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 23) }));
  assert.deepEqual(occurrences.map((o) => o.startLocal), ["2026-06-01T11:00:00", "2026-06-22T11:00:00"]);
  // scope "this" is an occurrence edit.
  const one = await events.editSeries(s.id, { scope: "this", recurrenceId: "2026-06-22T11:00", changes: { title: "One-off" } });
  assert.equal(one.override.title, "One-off");
  await assert.rejects(events.editSeries(s.id, { scope: "sometimes", changes: {} }), code("invalid-input"));
  await assert.rejects(events.editSeries("missing", { scope: "all", changes: {} }), code("not-found"));
});

test("series-edits: deleting this, this and following, or all occurrences", async () => {
  const { events } = setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Gym", timeZone: "UTC", start: "2026-06-01T07:00", durationMinutes: 60, rrule: "FREQ=DAILY;COUNT=10" });
  const list = async () => (await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 1) })).occurrences.map((o) => o.startLocal.slice(8, 10));
  await events.deleteOccurrences(s.id, { scope: "this", recurrenceId: "2026-06-02T07:00" });
  assert.deepEqual(await list(), ["01", "03", "04", "05", "06", "07", "08", "09", "10"]);
  await events.deleteOccurrences(s.id, { scope: "following", recurrenceId: "2026-06-05T07:00" });
  assert.deepEqual(await list(), ["01", "03", "04"]);
  await events.deleteOccurrences(s.id, { scope: "all" });
  assert.deepEqual(await list(), []);
  assert.equal(await events.getSeries(s.id), null);
});

// ------------------------------------------------------------------ ics export

test("ics export: a series with VTIMEZONE, RRULE, EXDATE, RDATE and RECURRENCE-ID overrides, escaped and folded", async () => {
  const { events } = setup();
  const s = await events.createSeries({
    calendarId: "c1", title: "Plan; review, and \"ship\"", description: "Line one\nLine two — ünïcødé ".repeat(4), location: "Room 1",
    timeZone: NY, start: "2026-03-02T09:00", durationMinutes: 90, rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231", exdates: ["2026-03-16T09:00"], rdates: ["2026-03-11T14:00"],
  });
  await events.editOccurrence(s.id, "2026-03-09T09:00", { start: "2026-03-10T09:30", title: "Moved" });
  await events.cancelOccurrence(s.id, "2026-03-23T09:00");
  const ics = await events.exportIcs(s.id, { uidDomain: "cal.example.com" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "CRLF line endings only");
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, `folded: ${line}`);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /BEGIN:VTIMEZONE\r\nTZID:America\/New_York\r\n/);
  assert.match(unfolded, /BEGIN:DAYLIGHT\r\nDTSTART:20260308T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\n/);
  assert.match(unfolded, /BEGIN:STANDARD\r\nDTSTART:20261101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\n/);
  const events_ = unfolded.split("BEGIN:VEVENT").slice(1);
  assert.equal(events_.length, 2);
  const [master, override] = events_;
  assert.match(master, /\r\nUID:s1@cal\.example\.com\r\n/);
  assert.match(master, /\r\nDTSTART;TZID=America\/New_York:20260302T090000\r\n/);
  assert.match(master, /\r\nDURATION:PT1H30M\r\n/);
  assert.match(master, /\r\nRRULE:FREQ=WEEKLY;UNTIL=20270101T045959Z;BYDAY=MO\r\n/, "UNTIL converted to UTC");
  assert.match(master, /\r\nEXDATE;TZID=America\/New_York:20260316T090000,20260323T090000\r\n/, "cancelled overrides export as EXDATE");
  assert.match(master, /\r\nRDATE;TZID=America\/New_York:20260311T140000\r\n/);
  assert.match(master, /\r\nSUMMARY:Plan\\; review\\, and "ship"\r\n/);
  assert.match(master, /\r\nDESCRIPTION:Line one\\nLine two/);
  assert.match(master, /\r\nDTSTAMP:20260101T000000Z\r\n/);
  assert.match(override, /\r\nUID:s1@cal\.example\.com\r\n/);
  assert.match(override, /\r\nRECURRENCE-ID;TZID=America\/New_York:20260309T090000\r\n/);
  assert.match(override, /\r\nDTSTART;TZID=America\/New_York:20260310T093000\r\n/);
  assert.match(override, /\r\nSUMMARY:Moved\r\n/);
  // A UTC series has no VTIMEZONE and uses Z times.
  const utc = await events.createSeries({ calendarId: "c1", title: "UTC", timeZone: "UTC", start: "2026-03-02T09:00", durationMinutes: 30, rrule: "FREQ=DAILY;COUNT=2" });
  const plain = await events.exportIcs(utc.id);
  assert.ok(!plain.includes("VTIMEZONE"));
  assert.match(plain, /\r\nDTSTART:20260302T090000Z\r\n/);
  await assert.rejects(events.exportIcs(utc.id, { uidDomain: "bad domain" }), code("invalid-input"));
});

// ------------------------------------------------------------------ review fixes: conversion cost, equivalence, VTIMEZONE horizon

test("window-query: COUNT series convert only the occurrences near a window or range end to instants", async () => {
  const { offsetLookups } = await import("../.build/modules/recurring-events/files/timezone.js");
  const { events } = setup();
  const before = offsetLookups.count;
  for (let i = 0; i < 5; i++) {
    await events.createSeries({ calendarId: "c1", title: `Long ${i}`, timeZone: NY, start: "2016-01-01T09:00", durationMinutes: 30, rrule: "FREQ=DAILY;COUNT=10000" });
  }
  const createCost = offsetLookups.count - before;
  assert.ok(createCost < 5 * 100, `create used ${createCost} offset lookups for 5 series`);
  const queryStart = offsetLookups.count;
  const { occurrences } = await events.listOccurrences({ calendarId: "c1", from: Date.UTC(2043, 4, 1), to: Date.UTC(2043, 4, 8) });
  const queryCost = offsetLookups.count - queryStart;
  assert.equal(occurrences.length, 35);
  assert.ok(queryCost < 5 * 200, `window query used ${queryCost} offset lookups`);
  const previewStart = offsetLookups.count;
  const preview = previewOccurrences({ start: "2016-01-01T09:00", timeZone: NY, rrule: "FREQ=DAILY;COUNT=10000" }, { from: Date.UTC(2043, 4, 1), to: Date.UTC(2043, 4, 8) });
  assert.equal(preview.length, 7);
  assert.ok(offsetLookups.count - previewStart < 200, `preview used ${offsetLookups.count - previewStart} offset lookups`);
  // A UTC UNTIL far from the window is not converted occurrence by occurrence either.
  const untilStart = offsetLookups.count;
  previewOccurrences({ start: "2016-01-01T09:00", timeZone: NY, rrule: "FREQ=DAILY;UNTIL=20431231T000000Z" }, { from: Date.UTC(2043, 4, 1), to: Date.UTC(2043, 4, 8) });
  assert.ok(offsetLookups.count - untilStart < 200, `UNTIL preview used ${offsetLookups.count - untilStart} offset lookups`);
});

test("window-query: randomized windows near DST edges equal the full expansion in several zones", () => {
  let seed = 20261012;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const zones = ["America/New_York", "Europe/London", "Australia/Sydney", "Australia/Lord_Howe", "America/Santiago", "Asia/Kolkata", "UTC"];
  const rules = [
    "FREQ=DAILY;COUNT=400", "FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=SU,WE", "FREQ=WEEKLY;INTERVAL=2;COUNT=150",
    "FREQ=MONTHLY;BYDAY=-1SU", "FREQ=MONTHLY;BYMONTHDAY=1,15;UNTIL=20290101T000000Z", "FREQ=DAILY;UNTIL=20280401T020000Z",
  ];
  let compared = 0;
  for (let i = 0; i < 60; i++) {
    const timeZone = pick(zones), rrule = pick(rules);
    const hour = pick(["00:30", "01:30", "02:00", "02:30", "03:00", "23:30", "09:00"]);
    const durationMinutes = pick([1, 30, 90, 600, 1500]);
    // The first local date from a random day in March 2026 that the rule accepts as its start.
    let start = null;
    for (let d = Math.floor(random() * 28); start === null; d++) {
      const candidate = `${new Date(Date.UTC(2026, 2, 1 + d)).toISOString().slice(0, 10)}T${hour}`;
      try { previewOccurrences({ start: candidate, timeZone, rrule }, { limit: 1 }); start = candidate; } catch { /* not an occurrence */ }
    }
    const input = { start, timeZone, rrule, durationMinutes };
    const full = previewOccurrences(input, { limit: 3000 });
    for (let w = 0; w < 6; w++) {
      const anchor = pick(full).start + Math.floor((random() - 0.5) * 3 * DAY);
      // Stay inside the expanded prefix so an endless rule's truncated full list is still complete for the window.
      const from = anchor, to = Math.min(anchor + Math.floor(random() * 20 * DAY) + 1, full.at(-1).start);
      if (to <= from) continue;
      const expected = full.filter((o) => o.start < to && (o.end > from || o.start >= from)).slice(0, 500);
      assert.deepEqual(previewOccurrences(input, { from, to, limit: 500 }), expected, `${timeZone} ${rrule} ${start} [${from}, ${to})`);
      compared++;
    }
  }
  assert.ok(compared > 300, `compared ${compared} windows`);
});

test("ics export: an endless series that started decades ago carries current VTIMEZONE observances", async () => {
  let now = Date.UTC(2026, 9, 12);
  const events = createRecurringEvents({ store: new MemoryRecurringEventStore(), now: () => now, newId: () => "old" });
  const s = await events.createSeries({ calendarId: "c1", title: "Anniversary", timeZone: NY, start: "1975-07-01T09:00", durationMinutes: 60, rrule: "FREQ=YEARLY" });
  const ics = (await events.exportIcs(s.id)).replace(/\r\n /g, "");
  const tz = ics.slice(ics.indexOf("BEGIN:VTIMEZONE"), ics.indexOf("END:VTIMEZONE"));
  // Observances cover the start and run through ten years after the export (2036), not 50 years after the start.
  assert.match(tz, /BEGIN:STANDARD\r\nDTSTART:19750101T000000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0500\r\n/, "base observance at local midnight");
  for (const year of [1975, 2026, 2027, 2036]) {
    // 1975 DST began on February 23 (US energy emergency), so spring is February to April.
    assert.match(tz, new RegExp(`${year}0[2-4]\\d\\dT020000`), `spring transition in ${year}`);
    assert.match(tz, new RegExp(`${year}1[01]\\d\\dT020000`), `autumn transition in ${year}`);
  }
  assert.doesNotMatch(tz, /2037\d{4}T/);
  // Bounded: a series starting in the year 1100 still yields a compact zone.
  const store = new MemoryRecurringEventStore();
  const svc = createRecurringEvents({ store, now: () => now, newId: () => "b" });
  await svc.createSeries({ calendarId: "c1", title: "Old", timeZone: NY, start: "1100-01-01T09:00", durationMinutes: 60, rrule: "FREQ=YEARLY" });
  const big = await svc.exportIcs("b");
  assert.ok(big.length < 40_000, `ics is ${big.length} bytes`);
  assert.match(big.replace(/\r\n /g, ""), /2036\d{4}T020000/);
});
