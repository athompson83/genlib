# Recurring calendar events (RRULE) · 0.1.1

## What installs

Nine original Apache-2.0 files under `recurring-events/`:

- `core.ts`: `createRecurringEvents` (series, occurrences, edits, export), `previewOccurrences` (store-free expansion), the `RecurringEventStore` interface and the `EventSeries`, `OccurrenceOverride` and `Occurrence` types. It re-exports `parseRRule`, `formatRRule` and `RecurringEventsError`.
- `rrule.ts`: RFC 5545 RRULE parsing, canonical formatting and expansion over local wall time. It extends the Genlib `rrule` capability with BYSETPOS, WKST, mixed plain and ordinal BYDAY, local and DATE forms of UNTIL, and direct jumps to a window.
- `timezone.ts`: IANA offsets through `Intl.DateTimeFormat`, wall-time to instant conversion and local date-time text.
- `ics.ts`: `seriesToIcs`, the RFC 5545 export.
- `errors.ts`: `RecurringEventsError` with a stable `code`.
- `memory-store.ts`: `MemoryRecurringEventStore`, for tests and prototypes.
- `schema.sql` and `sql-store.ts`: the `recurring_event_series` and `recurring_event_overrides` tables, and `createSqlRecurringEventStore(executor, { seriesTable?, overridesTable? })`.
- `http.ts`: `createRecurringEventsHandler`, an optional server-only Fetch adapter. The core does not import it.

There is no hidden database, session or sharing model. The application supplies persistence and authorization.

Install profiles: `core`, `memory`, `sql`, `http`, and `expander` (`rrule.ts`, `timezone.ts`, `errors.ts`). Use `add recurring-events --profile expander` when the app keeps its own storage, API and edit rules and needs only expansion: `parseRRule(text)`, `ruleWalls(rule, startWall, { fromWall, stopWall })` (ascending local wall times as epoch-style milliseconds, COUNT and local UNTIL applied; apply a UTC UNTIL against instants), `zoneFor(timeZone)` and `wallToInstant(zone, wall)` (a time skipped by DST moves forward by the gap, a repeated time takes its first instance). The expander has no fixed routes, storage or split behavior.

## When to use it

Use it for calendar events that repeat: meetings, classes, shifts, bookings and reminders shown on a calendar. Do not use it for background job schedules. Use `scheduled-tasks` (cron) for those. It does not cover free/busy search, attendees or invitations.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlRecurringEventStore(db)`. `db` needs `query(text, params)` and `transaction(work)`. Elsewhere, implement `RecurringEventStore`, where each write is atomic and conditional on `version`. |
| `calendarId` | Your calendar, team or user key. Window queries are per calendar. |
| `timeZone` + `start` | The event's IANA zone and its local wall time (`2026-06-01T09:00`). Never pre-convert to UTC. |
| HTTP `authorize(request, {operation, calendarId, seriesId})` | Your session and sharing check. It must return true for the caller to proceed. |
| HTTP `routes`, `statusFor`, `prefix` | Paths (`"PATCH /events/:id"`) and statuses that match your API. |
| `icsOptions.uidDomain` | Your domain, so exported UIDs are globally unique. |

```ts
import { createRecurringEvents } from "./genlib/recurring-events/core.js";
import { createSqlRecurringEventStore } from "./genlib/recurring-events/sql-store.js";
import { createRecurringEventsHandler } from "./genlib/recurring-events/http.js";

const events = createRecurringEvents({ store: createSqlRecurringEventStore(db) });
await events.createSeries({ calendarId: team.id, title: "Standup", timeZone: "America/New_York",
  start: "2026-06-01T09:00", durationMinutes: 15, rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
export const handler = createRecurringEventsHandler({
  events, prefix: "/api/calendar", allowedOrigins: [APP_ORIGIN],
  authorize: async (request, { calendarId }) => canUseCalendar(await session(request), calendarId),
  icsOptions: { uidDomain: "app.example.com" },
});
```

## Behavior

- **Rules.** Supported parts are FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT (at most 10,000), UNTIL, BYDAY (ordinals such as `2TU` and `-1FR` with MONTHLY or YEARLY), BYMONTHDAY, BYMONTH, BYSETPOS and WKST.
  - UNTIL can be UTC (`…Z`), floating local, or a DATE. A DATE includes the whole local day.
  - Matching is case-insensitive, and an `RRULE:` prefix is accepted.
  - Malformed rules fail with `invalid-rule`. FREQ=HOURLY, MINUTELY and SECONDLY, and the parts BYHOUR, BYMINUTE, BYSECOND, BYYEARDAY, BYWEEKNO, RSCALE and SKIP, fail with `unsupported-rule` instead of being ignored.
  - Invalid dates, such as the 31st of a short month or February 29th in a common year, are skipped, not clamped.
  - Rules are stored in canonical form.
- **Start.** The start must be the rule's first occurrence, otherwise the series fails with `invalid-rule`. This also rejects rules that never occur. RDATEs may not precede the start.
- **Time zones.** Occurrences keep their local wall time across DST changes. A local time that a forward transition skips is read with the offset from before the gap, so 02:30 becomes 03:30. A repeated local time means its first occurrence. A UTC UNTIL is compared with real instants. Durations are exact.
- **Exceptions.** EXDATE removes occurrences, including RDATEs. RDATE adds occurrences, which may be at another time of day. COUNT counts rule occurrences before EXDATEs are removed.
  - An override keyed by RECURRENCE-ID (the original local start) can move one occurrence or change its duration, title, description or location.
  - `cancelOccurrence` cancels an occurrence and `restoreOccurrence` removes its override.
  - Only real occurrences can be overridden. Anything else fails with `not-an-occurrence`.
  - A series holds at most `maxOverridesPerSeries` overrides (default 1,000).
- **Window queries.** `listOccurrences({calendarId, from, to, limit})` loads only the series whose stored `[rangeStart, rangeEnd)` overlaps the window. It returns occurrences that overlap `[from, to)` in start order, at most `limit` (default 500, at most `maxOccurrences`), with `truncated`.
  - Expansion jumps directly to the period that contains `from`. COUNT rules count from the start instead, but they compare local wall times cheaply and convert only occurrences within a day of the window to instants.
  - A moved occurrence appears in windows that cover its new time.
- **Series edits.** `editSeries(id, {scope, recurrenceId?, changes, expectedVersion?})`:
  - `this` writes an override.
  - `following` splits the series. The original gets `UNTIL` one second before the split occurrence, and a COUNT becomes the number of earlier occurrences. A new series, with `splitFrom` set to the original, starts at the split, or at `changes.start`, and carries the remaining COUNT. Later EXDATEs, RDATEs and overrides move with it. Earlier occurrences do not change. Splitting at the first occurrence is the same as `all`.
  - `all` edits the series. When start, rule or zone change, EXDATEs, RDATEs and override recurrence ids shift by the change in start wall time. Any that no longer match are dropped and counted in `droppedExceptions`.
  - Every write is conditional on `version`, so a stale `expectedVersion` or a concurrent writer fails with `version-conflict`.
  - `deleteOccurrences` takes the same three scopes.
- **Export.** `exportIcs(id)` returns a VCALENDAR with:
  - a VTIMEZONE built from the zone's real transitions, from the start year through the range end (ten years after the export for an endless series)
  - the master VEVENT, with DTSTART;TZID, DURATION, RRULE (UNTIL converted to UTC), EXDATE (including cancelled occurrences), RDATE, SUMMARY, DESCRIPTION, LOCATION and SEQUENCE
  - one VEVENT with RECURRENCE-ID for each changed occurrence

  Text is escaped, lines are folded at 75 octets, and line endings are CRLF. A UTC series uses `Z` times and no VTIMEZONE.

## HTTP routes

These are the defaults, relative to `prefix`. Each one can be replaced through `routes`.

| Operation | Default | Result |
| --- | --- | --- |
| `createSeries` | `POST /series` | `201 {series}` |
| `getSeries` | `GET /series/:id` | `200 {series, overrides}` |
| `editSeries` | `PATCH /series/:id` with `{scope, recurrenceId?, changes, expectedVersion?}` | `200 {series, created, override, droppedExceptions}` |
| `deleteSeries` | `DELETE /series/:id?scope=&recurrenceId=&expectedVersion=` | `200 {series}` (null when deleted) |
| `listOccurrences` | `GET /occurrences?calendarId=&from=&to=&limit=` | `200 {occurrences, truncated}` |
| `seriesOccurrences` | `GET /series/:id/occurrences?from=&to=&limit=` | `200 {occurrences, truncated}` |
| `exportIcs` | `GET /series/:id/ics` | `200 text/calendar` attachment |

`from` and `to` take epoch milliseconds or ISO 8601 date-times with `Z` or an offset.

Default statuses, each of which can be replaced through `statusFor`:

| Status | Codes |
| --- | --- |
| 400 | `invalid-input`, `invalid-rule`, `unsupported-rule`, `bad-request`, `invalid-json` |
| 403 | `forbidden`: a refused create or list, or a non-GET request without an allowed Origin |
| 404 | `not-found`: a missing series, or one in a calendar the caller may not use |
| 404 | `no-route` |
| 405 | `method-not-allowed` |
| 409 | `version-conflict` |
| 413 | `payload-too-large` (over `maxRequestBytes`, default 65,536) |
| 415 | `unsupported-media-type` |
| 422 | `not-an-occurrence`, `too-many-overrides` |

Every response carries `cache-control: no-store` and `x-content-type-options: nosniff`.

## Verify

`npm run build && node --test tests/recurring-events.test.mjs tests/recurring-events-sql.test.mjs tests/recurring-events-http.test.mjs` covers:

- the RFC 5545 example vectors, including BYSETPOS and WKST
- invalid and unsupported rules, and expansion bounds
- DST gaps and overlaps in New York and Sydney
- EXDATE, RDATE, and moved, cancelled and restored occurrences
- window queries across series, including a window decades away
- this, following and all edits and deletes
- `.ics` structure
- concurrent edits with a single winner (memory and PGlite)
- the SQL round trip and atomic splits
- HTTP routes, overrides, authorization and limits

In the receiving app, run the same window and edit cases against your real store and authorization.

## If something fails

- **Occurrences are an hour off after DST:** the start was stored as a UTC instant or with a fixed offset. Store local wall time plus an IANA zone.
- **`invalid-rule` on create:** the start is not the rule's first occurrence. For example, a Tuesday start with `BYDAY=MO`. Move the start to the first occurrence.
- **An override disappeared after an "all" edit:** the new rule or start no longer produces that occurrence. The response reports it in `droppedExceptions`.
- **Frequent `version-conflict`:** reload the series and retry with its current `version`.

## Limits

- **Unsupported rules.** Sub-daily frequencies, BYHOUR, BYMINUTE, BYSECOND, BYYEARDAY, BYWEEKNO, RSCALE and SKIP are refused. All-day (DATE-valued) events are not modeled.
- **Scan cap.** One expansion scans at most 100,000 periods and stops at year 9999.
- **Export only.** There is no `.ics` import.
- **VTIMEZONE horizon.** Observances are sampled weekly from local midnight on January 1 of the start year through the series' range end. An endless series is covered through ten years after the export. The output lists the start year plus at most the newest 100 years, so a series spanning more than that has a gap between them. Transitions less than a week apart are not represented.
- **Runtime data.** Time-zone results depend on the runtime's ICU data.
- **Testing scope.** PGlite runs as a single connection, so the tests do not cover real multi-connection contention.

Authorization, sharing, attendees, reminders and production database correctness remain project responsibilities.
