Add recurring calendar events to this app (teamnotes, TypeScript on Node 22, see README.md).

Export these functions from `src/recurrence.ts` (HTTP routes and authentication are out of scope; the caller passes the tenant id). They may be synchronous or return Promises; tests `await` every result.

```ts
export interface EventInput {
  title: string
  timeZone: string          // IANA zone, e.g. 'America/New_York'
  start: string             // local wall-clock start in timeZone: 'YYYY-MM-DDTHH:MM:SS'
  durationMinutes: number
  rrule?: string | null     // RFC 5545 RRULE value, e.g. 'FREQ=WEEKLY;BYDAY=MO,WE'; absent/null = one-off event
  exdates?: string[]        // local 'YYYY-MM-DDTHH:MM:SS' values in timeZone
  rdates?: string[]         // local 'YYYY-MM-DDTHH:MM:SS' values in timeZone
}
export interface EventRecord {
  id: string; tenantId: string; title: string; timeZone: string; start: string; durationMinutes: number
  rrule: string | null; exdates: string[]; rdates: string[]
}
export interface Occurrence {
  eventId: string
  title: string
  originalStart: string     // local start the recurrence produced, before any override: 'YYYY-MM-DDTHH:MM:SS'
  localStart: string        // local wall-clock time of the actual start in the event's zone: 'YYYY-MM-DDTHH:MM:SS'
  start: string             // actual start instant in UTC: 'YYYY-MM-DDTHH:MM:SSZ'
  end: string               // start + duration in UTC: 'YYYY-MM-DDTHH:MM:SSZ'
}
```

- `validateRule(rrule: string)` → `{ ok: true }` or `{ ok: false, error: 'invalid_rrule' }` (syntax and part-combination rules below; it does not know the start).
- `createEvent(tenantId: string, input: EventInput)` → `{ ok: true, event: EventRecord }` or `{ ok: false, error }` with `error` one of `'unknown_tenant' | 'invalid_title' | 'invalid_time_zone' | 'invalid_start' | 'invalid_duration' | 'invalid_rrule' | 'invalid_date'`. When several inputs are wrong, report the first in that order. A failed call stores nothing.
- `getEvent(tenantId: string, eventId: string)` → `EventRecord | null`.
- `listOccurrences(tenantId: string, window: { from: string; to: string; limit?: number })` → `{ ok: true, occurrences: Occurrence[], truncated: boolean }` or `{ ok: false, error: 'unknown_tenant' | 'invalid_window' }`.
- `overrideOccurrence(tenantId: string, eventId: string, originalStart: string, change: { cancelled: true } | { start?: string; durationMinutes?: number; title?: string })` → `{ ok: true }` or `{ ok: false, error: 'not_found' | 'invalid_occurrence' | 'invalid_override' | 'invalid_start' | 'invalid_duration' | 'invalid_title' }`.
- `editFollowing(tenantId: string, eventId: string, originalStart: string, changes: { title?: string; start?: string; durationMinutes?: number; rrule?: string | null })` → `{ ok: true, original: EventRecord, created: EventRecord }` or `{ ok: false, error: 'not_found' | 'invalid_occurrence' | 'invalid_title' | 'invalid_start' | 'invalid_duration' | 'invalid_rrule' }`.

Persist events (with their overrides) in the in-memory database: add them to `Db` and `seed()` in `src/db.ts` so `resetDb()` clears them. Do not add runtime dependencies.

## Inputs

- `tenantId` must be a tenant in `db.tenants`, otherwise `unknown_tenant` (`createEvent`, `listOccurrences`) or `not_found` (`getEvent` returns `null`; `overrideOccurrence`, `editFollowing`).
- `title`: a string that is non-empty after trimming and at most 200 characters after trimming; stored trimmed. Otherwise `invalid_title`.
- `timeZone`: valid when `new Intl.DateTimeFormat('en-US', { timeZone })` accepts it and it does not start with `+` or `-`. Otherwise `invalid_time_zone`.
- Local date-times (`start`, EXDATE/RDATE values, override and `editFollowing` starts, `originalStart` arguments) are exactly `YYYY-MM-DDTHH:MM:SS` with a real calendar date, year 1970 to 2100, hour 00–23, minute and second 00–59. No offset, no `Z`, no milliseconds. A bad `start` is `invalid_start`; a bad EXDATE/RDATE entry, or `exdates`/`rdates` present but not an array, is `invalid_date`. The record keeps `exdates` and `rdates` deduplicated and sorted ascending.
- `durationMinutes`: an integer from 1 to 10080, otherwise `invalid_duration`. It is exact elapsed time: `end` = `start` + duration, even across a DST change.

## RRULE syntax and validation

The value is `NAME=VALUE` parts separated by `;`, optionally preceded by `RRULE:`. Names and values are case-insensitive. Anything below that is not allowed is `invalid_rrule`:

- Every part has a name, `=` and a non-empty value; no empty parts (so no leading, trailing or doubled `;`); no part name appears twice. List values are comma-separated with no empty items; duplicates in a list are ignored.
- Supported parts only: `FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `WKST`. Any other part (`BYHOUR`, `BYWEEKNO`, `BYYEARDAY`, `X-…` and so on) is invalid.
- `FREQ` is required and is `DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`.
- `INTERVAL` and `COUNT`: positive integers written as plain digits (no sign, no leading zero).
- `UNTIL`: `YYYYMMDDTHHMMSSZ` (UTC) or `YYYYMMDDTHHMMSS` (local time in the event's zone), a real date-time. Date-only values are invalid. `COUNT` and `UNTIL` together are invalid.
- `BYDAY`: items `[+|-][n]DD` with `DD` one of `MO TU WE TH FR SA SU`. The ordinal `n`, when present, is 1–53 (a sign without digits, or 0, is invalid). Ordinals are invalid with `FREQ=DAILY` or `WEEKLY`, and limited to 1–5 with `FREQ=MONTHLY`.
- `BYMONTHDAY`: integers 1–31 or −31 to −1, an optional `+` allowed. Invalid with `FREQ=WEEKLY`.
- `BYMONTH`: integers 1–12.
- `BYSETPOS`: integers 1–366 or −366 to −1, an optional `+` allowed; only valid when the rule also has `BYDAY`, `BYMONTHDAY` or `BYMONTH`.
- `WKST`: one of the seven day codes. Default `MO`.

In `createEvent` (and for a new `rrule` in `editFollowing`) an `UNTIL` earlier than the start is also `invalid_rrule`: a UTC `UNTIL` is compared with the start instant, a local `UNTIL` with the local start.

## Expansion and time zones

Expand rules as RFC 5545 defines them (DTSTART, RRULE, RDATE, EXDATE and RECURRENCE-ID semantics), in the local wall-clock time of the event's zone, converting local times to instants with the platform's `Intl` time-zone data and RFC 5545's rules for local times that do not exist or occur twice. `localStart` is the wall-clock time of the actual start instant; `originalStart` is the value the rule or RDATE produced. No occurrence later than local year 2200 is ever produced, and every call must return promptly, also for rules that can never match.

## Window query

`listOccurrences` returns the tenant's occurrences whose actual `start` instant is in `[from, to)`. `from` and `to` are UTC strings exactly of the form `YYYY-MM-DDTHH:MM:SSZ` with a real date-time, and `to` must be later than `from`; `limit` is an integer from 1 to 1000, default 100. Anything else is `invalid_window`. Occurrences are ordered by start instant, then by event creation order (events created earlier first), then by `originalStart`. At most `limit` are returned; `truncated` is `true` exactly when more occurrences fell in the window. A series' occurrences far from its start (thousands of occurrences ahead, or a window in the year 2150) must be returned correctly. Each `Occurrence` has exactly the fields listed above.

## Overrides

`overrideOccurrence` changes one occurrence, identified by its `originalStart`, which must be a current occurrence of that event (generated by its rule or an RDATE and not removed by EXDATE); otherwise `invalid_occurrence`.

- `{ cancelled: true }` removes it from results. `cancelled` with any other field, `cancelled` set to anything other than `true`, or a change with none of `start`, `durationMinutes`, `title`, is `invalid_override`.
- Otherwise the given fields replace the occurrence's start (a local date-time in the event's zone, resolved by the same gap and fall-back rules), duration and/or title (`invalid_start`, `invalid_duration`, `invalid_title` as for events). A moved occurrence keeps its `originalStart`, is placed and window-filtered by its new start, and can move to any date.
- A new override for the same `originalStart` replaces the previous one entirely.

## This-and-following edits

`editFollowing` splits a series at `originalStart`, which must be a rule-generated original start later than the event's start that is not an EXDATE; otherwise `invalid_occurrence` (also when the event has no rule).

- The original event keeps exactly its occurrences, EXDATEs, RDATEs and overrides with original start earlier than the split point. Its stored `rrule` text may be rewritten.
- A new event is created in the same tenant and zone, with `start` = `changes.start` if given, otherwise the split point; `title` and `durationMinutes` from `changes` or the original; `rrule` = `changes.rrule` if given (`null` makes it a one-off), otherwise the original rule, with `COUNT` reduced by the number of rule occurrences the original keeps (its start included). The EXDATEs, RDATEs and overrides at or after the split point move to the new event unchanged; an override whose `originalStart` is not an occurrence of the new event has no effect.
- The new event comes after all existing events in creation order. Returns both records.

## Tenant isolation

Events, occurrences and overrides of one tenant are never visible to, or changeable through, another tenant id: `getEvent` returns `null`, `overrideOccurrence` and `editFollowing` return `not_found`, and `listOccurrences` returns only the tenant's own events.

Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
