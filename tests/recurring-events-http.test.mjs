// SPDX-License-Identifier: Apache-2.0
// recurring-events Fetch adapter: default routes, overridable routes and statuses, authorization, origin checks,
// bounded JSON bodies and .ics download.
import assert from "node:assert/strict";
import test from "node:test";
import { createRecurringEvents } from "../.build/modules/recurring-events/files/core.js";
import { MemoryRecurringEventStore } from "../.build/modules/recurring-events/files/memory-store.js";
import { createRecurringEventsHandler } from "../.build/modules/recurring-events/files/http.js";

const ORIGIN = "https://app.example.com";
const BASE = "https://app.example.com";

function setup(extra = {}) {
  let counter = 0;
  const events = createRecurringEvents({ store: new MemoryRecurringEventStore(), now: () => Date.UTC(2026, 0, 1), newId: () => `s${++counter}` });
  const access = [];
  const handler = createRecurringEventsHandler({
    events, prefix: "/api/calendar", allowedOrigins: [ORIGIN],
    authorize: (request, info) => { access.push(info); return request.headers.get("x-user") === "ann" && info.calendarId === "team"; },
    ...extra,
  });
  const call = (method, path, body, headers = {}) => handler(new Request(BASE + path, {
    method,
    headers: { "x-user": "ann", ...(method === "GET" ? {} : { origin: ORIGIN }), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }));
  return { events, handler, call, access };
}

const weekly = { calendarId: "team", title: "Planning", timeZone: "America/New_York", start: "2026-06-01T09:00", durationMinutes: 60, rrule: "FREQ=WEEKLY;BYDAY=MO" };

test("http: create, read, list a window, edit this/following/all, export .ics and delete through the default routes", async () => {
  const { call } = setup();
  const created = await call("POST", "/api/calendar/series", weekly);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  const { series } = await created.json();
  assert.equal(series.rrule, "FREQ=WEEKLY;BYDAY=MO");

  const got = await call("GET", `/api/calendar/series/${series.id}`);
  assert.equal(got.status, 200);
  assert.deepEqual((await got.json()).overrides, []);

  const list = await call("GET", "/api/calendar/occurrences?calendarId=team&from=2026-06-01T00:00:00Z&to=2026-06-15T00:00:00Z");
  assert.equal(list.status, 200);
  const listed = await list.json();
  assert.deepEqual(listed.occurrences.map((o) => o.startLocal), ["2026-06-01T09:00:00", "2026-06-08T09:00:00"]);
  assert.equal(listed.truncated, false);
  const epoch = await call("GET", `/api/calendar/series/${series.id}/occurrences?from=${Date.UTC(2026, 5, 1)}&to=${Date.UTC(2026, 5, 9)}&limit=1`);
  assert.deepEqual((await epoch.json()).truncated, true);

  const one = await call("PATCH", `/api/calendar/series/${series.id}`, { scope: "this", recurrenceId: "2026-06-08T09:00", changes: { title: "Planning (short)", durationMinutes: 30 }, expectedVersion: 1 });
  assert.equal(one.status, 200);
  assert.equal((await one.json()).override.title, "Planning (short)");
  const stale = await call("PATCH", `/api/calendar/series/${series.id}`, { scope: "all", changes: { title: "x" }, expectedVersion: 1 });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, "version-conflict");
  const split = await call("PATCH", `/api/calendar/series/${series.id}`, { scope: "following", recurrenceId: "2026-06-15T09:00", changes: { start: "2026-06-15T14:00" } });
  assert.equal(split.status, 200);
  const { created: next } = await split.json();
  assert.equal(next.start, "2026-06-15T14:00:00");

  const ics = await call("GET", `/api/calendar/series/${series.id}/ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get("content-type"), /^text\/calendar; charset=utf-8/);
  assert.match(ics.headers.get("content-disposition"), /^attachment; filename="s1\.ics"$/);
  assert.match(await ics.text(), /RECURRENCE-ID;TZID=America\/New_York:20260608T090000/);

  const bad = await call("PATCH", `/api/calendar/series/${series.id}`, { scope: "this", recurrenceId: "2026-06-09T09:00", changes: { title: "x" } });
  assert.equal(bad.status, 422);
  assert.equal((await bad.json()).error, "not-an-occurrence");
  const deleted = await call("DELETE", `/api/calendar/series/${next.id}?scope=all`);
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).series, null);
  assert.equal((await call("GET", `/api/calendar/series/${next.id}`)).status, 404);
});

test("http: invalid rules, inputs, JSON and bodies map to 400s; unknown paths 404; wrong methods 405", async () => {
  const { call } = setup({ maxRequestBytes: 2048 });
  const rule = await call("POST", "/api/calendar/series", { ...weekly, rrule: "FREQ=WEEKLY;BYDAY=1MO" });
  assert.equal(rule.status, 400);
  assert.equal((await rule.json()).error, "invalid-rule");
  const unsupported = await call("POST", "/api/calendar/series", { ...weekly, rrule: "FREQ=HOURLY" });
  assert.equal((await unsupported.json()).error, "unsupported-rule");
  assert.equal((await call("POST", "/api/calendar/series", { ...weekly, durationMinutes: -1 })).status, 400);
  assert.equal((await (await call("POST", "/api/calendar/series", "{not json")).json()).error, "invalid-json");
  assert.equal((await call("POST", "/api/calendar/series", { ...weekly, title: "x".repeat(4000) })).status, 413);
  assert.equal((await call("POST", "/api/calendar/series", JSON.stringify(weekly), { "content-type": "text/plain" })).status, 415);
  assert.equal((await call("GET", "/api/calendar/occurrences?calendarId=team&from=yesterday&to=2026-06-15T00:00:00Z")).status, 400);
  assert.equal((await call("GET", "/api/calendar/nowhere")).status, 404);
  assert.equal((await call("GET", "/elsewhere/series")).status, 404);
  assert.equal((await call("PUT", "/api/calendar/occurrences", {})).status, 405);
});

test("http: authorization denies other users and calendars, hides other calendars' series, and checks Origin", async () => {
  const { call, events, access } = setup();
  const hidden = await events.createSeries({ ...weekly, calendarId: "private" });
  const denied = await call("POST", "/api/calendar/series", weekly, { "x-user": "mallory" });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error, "forbidden");
  assert.equal((await call("GET", "/api/calendar/occurrences?calendarId=private&from=0&to=1000")).status, 403);
  // A series in a calendar the caller cannot see answers 404, not 403.
  assert.equal((await call("GET", `/api/calendar/series/${hidden.id}`)).status, 404);
  assert.equal((await call("PATCH", `/api/calendar/series/${hidden.id}`, { scope: "all", changes: { title: "x" } })).status, 404);
  assert.equal((await call("DELETE", `/api/calendar/series/${hidden.id}?scope=all`)).status, 404);
  assert.equal((await call("GET", `/api/calendar/series/${hidden.id}/ics`)).status, 404);
  assert.equal((await events.getSeries(hidden.id)).series.title, "Planning", "untouched");
  assert.ok(access.some((a) => a.operation === "editSeries" && a.seriesId === hidden.id && a.calendarId === "private"));
  // Unsafe methods need an allowed Origin.
  const noOrigin = await call("POST", "/api/calendar/series", weekly, { origin: "https://evil.example" });
  assert.equal(noOrigin.status, 403);
});

test("http: routes, prefix and statusFor can be overridden to match an app's API surface", async () => {
  const { call } = setup({
    prefix: "/v2",
    routes: {
      createSeries: "PUT /events", getSeries: "GET /events/:id", editSeries: "POST /events/:id/edit", listOccurrences: "GET /calendar/instances",
      exportIcs: "GET /events/:id/calendar.ics", deleteSeries: "POST /events/:id/delete",
    },
    statusFor: { "invalid-rule": 422, "version-conflict": 412, "not-found": 410 },
  });
  const created = await call("PUT", "/v2/events", weekly);
  assert.equal(created.status, 201);
  const { series } = await created.json();
  assert.equal((await call("GET", `/v2/events/${series.id}`)).status, 200);
  assert.equal((await call("POST", "/v2/series", weekly)).status, 404, "default path no longer served");
  const instances = await call("GET", "/v2/calendar/instances?calendarId=team&from=2026-06-01T00:00:00Z&to=2026-06-08T00:00:00Z");
  assert.equal((await instances.json()).occurrences.length, 1);
  assert.equal((await call("PUT", "/v2/events", { ...weekly, rrule: "FREQ=WEEKLY;BYMONTHDAY=1" })).status, 422);
  assert.equal((await call("POST", `/v2/events/${series.id}/edit`, { scope: "all", changes: {}, expectedVersion: 9 })).status, 412);
  assert.equal((await call("GET", "/v2/events/missing")).status, 410);
  assert.equal((await call("GET", `/v2/events/${series.id}/calendar.ics`)).status, 200);
  assert.equal((await call("POST", `/v2/events/${series.id}/delete?scope=all`)).status, 200);
  assert.throws(() => setup({ routes: { getSeries: "FETCH /x" } }), /route/);
  assert.throws(() => setup({ statusFor: { "not-found": 99 } }), /status/);
});
