// SPDX-License-Identifier: Apache-2.0
// recurring-events on PostgreSQL semantics (PGlite): schema.sql applies, series and overrides round-trip, window
// queries use the stored range bounds, splits are atomic, and version checks let exactly one concurrent edit win.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createRecurringEvents } from "../.build/modules/recurring-events/files/core.js";
import { createSqlRecurringEventStore } from "../.build/modules/recurring-events/files/sql-store.js";

const schema = readFileSync(new URL("../modules/recurring-events/files/schema.sql", import.meta.url), "utf8");
const executor = (db) => ({
  query: (text, params) => db.query(text, params),
  transaction: (work) => db.transaction((tx) => work(executor(tx))),
});

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  let counter = 0;
  const store = createSqlRecurringEventStore(executor(db));
  const events = createRecurringEvents({ store, now: () => Date.UTC(2026, 0, 1), newId: () => `s${++counter}` });
  return { db, store, events };
}

const NY = "America/New_York";
const june = { calendarId: "c1", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 1) };

test("sql: schema applies; series, EXDATE/RDATE and overrides round-trip; window queries use range bounds", async () => {
  const { db, store, events } = await setup();
  const s = await events.createSeries({
    calendarId: "c1", title: "Standup", description: "Daily sync", timeZone: NY, start: "2026-06-01T09:00", durationMinutes: 15,
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", exdates: ["2026-06-03T09:00"], rdates: ["2026-06-06T10:00"],
  });
  await events.createSeries({ calendarId: "c1", title: "Old", timeZone: NY, start: "2020-01-01T09:00", durationMinutes: 15, rrule: "FREQ=DAILY;COUNT=5" });
  await events.createSeries({ calendarId: "c2", title: "Other", timeZone: NY, start: "2026-06-02T09:00", durationMinutes: 15 });
  const read = await events.getSeries(s.id);
  assert.deepEqual(read.series, s);
  await events.editOccurrence(s.id, "2026-06-05T09:00", { start: "2026-06-05T11:30", title: "Moved standup", location: "Room 4" });
  await events.cancelOccurrence(s.id, "2026-06-08T09:00");
  const { overrides } = await events.getSeries(s.id);
  assert.deepEqual(overrides.map((o) => [o.recurrenceId, o.cancelled, o.start, o.title, o.location]).sort(), [
    ["2026-06-05T09:00:00", false, "2026-06-05T11:30:00", "Moved standup", "Room 4"],
    ["2026-06-08T09:00:00", true, null, null, null],
  ]);
  const { occurrences } = await events.listOccurrences({ ...june, to: Date.UTC(2026, 5, 11) });
  assert.deepEqual(occurrences.map((o) => `${o.title} ${o.startLocal}`), [
    "Standup 2026-06-01T09:00:00", "Moved standup 2026-06-05T11:30:00", "Standup 2026-06-06T10:00:00", "Standup 2026-06-10T09:00:00",
  ]);
  const ranged = await store.listSeriesInRange("c1", june.from, june.to, 10);
  assert.deepEqual(ranged.map((x) => x.title), ["Standup"], "ended series and other calendars are not loaded");
  const row = (await db.query("SELECT range_end, exdates, rdates FROM recurring_event_series WHERE id = $1", [s.id])).rows[0];
  assert.equal(row.range_end, null);
  assert.deepEqual(row.exdates, ["2026-06-03T09:00:00"]);
  assert.deepEqual(row.rdates, ["2026-06-06T10:00:00"]);
});

test("sql: 'this and following' split is atomic and keeps the past; 'all' edits and deletes cascade overrides", async () => {
  const { db, events } = await setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Course", timeZone: NY, start: "2026-06-01T18:00", durationMinutes: 90, rrule: "FREQ=WEEKLY;COUNT=6" });
  await events.editOccurrence(s.id, "2026-06-08T18:00", { title: "Course (guest)" });
  await events.editOccurrence(s.id, "2026-06-22T18:00", { title: "Course (exam)" });
  const before = (await events.listOccurrences(june)).occurrences.filter((o) => o.start < Date.UTC(2026, 5, 15));
  const split = await events.editSeries(s.id, { scope: "following", recurrenceId: "2026-06-15T18:00", changes: { start: "2026-06-15T19:00", location: "Hall B" } });
  assert.equal(split.created.rrule, "FREQ=WEEKLY;COUNT=4");
  const after = (await events.listOccurrences({ ...june, to: Date.UTC(2026, 6, 15) })).occurrences;
  assert.deepEqual(after.filter((o) => o.start < Date.UTC(2026, 5, 15)), before);
  assert.deepEqual(after.filter((o) => o.start >= Date.UTC(2026, 5, 15)).map((o) => `${o.title} ${o.startLocal} ${o.location}`), [
    "Course 2026-06-15T19:00:00 Hall B", "Course (exam) 2026-06-22T19:00:00 Hall B", "Course 2026-06-29T19:00:00 Hall B", "Course 2026-07-06T19:00:00 Hall B",
  ]);
  const moved = await db.query("SELECT series_id, recurrence_id FROM recurring_event_overrides ORDER BY recurrence_id");
  assert.deepEqual(moved.rows.map((r) => [r.series_id, r.recurrence_id]), [[s.id, "2026-06-08T18:00:00"], [split.created.id, "2026-06-22T19:00:00"]]);
  await events.editSeries(split.created.id, { scope: "all", changes: { title: "Course II" } });
  await events.deleteOccurrences(s.id, { scope: "all" });
  const left = await db.query("SELECT series_id FROM recurring_event_overrides");
  assert.deepEqual(left.rows.map((r) => r.series_id), [split.created.id], "deleting a series removes its overrides");
});

test("sql: exactly one of four concurrent edits or splits with the same version wins", async () => {
  const { events } = await setup();
  const s = await events.createSeries({ calendarId: "c1", title: "Sync", timeZone: "UTC", start: "2026-06-01T09:00", durationMinutes: 30, rrule: "FREQ=DAILY" });
  const results = await Promise.allSettled([
    events.editSeries(s.id, { scope: "all", changes: { title: "A" }, expectedVersion: 1 }),
    events.editSeries(s.id, { scope: "following", recurrenceId: "2026-06-05T09:00", changes: { title: "B" }, expectedVersion: 1 }),
    events.editSeries(s.id, { scope: "this", recurrenceId: "2026-06-02T09:00", changes: { title: "C" }, expectedVersion: 1 }),
    events.deleteOccurrences(s.id, { scope: "following", recurrenceId: "2026-06-10T09:00", expectedVersion: 1 }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results.filter((x) => x.status === "rejected")) assert.equal(r.reason.code, "version-conflict");
  const { series } = await events.getSeries(s.id);
  assert.equal(series.version, 2);
});
