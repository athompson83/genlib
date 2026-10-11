# Cron scheduled tasks for multi-instance apps · 0.1.0

## What installs

Five original Apache-2.0 files under `scheduled-tasks/`:

- `cron.ts`: `parseCron`, `nextOccurrence`, `nextOccurrences`, `latestOccurrences`, `resolveTimeZone` and `wallTimeToInstant`. A dependency-free cron engine that evaluates schedules in any IANA time zone through `Intl.DateTimeFormat`.
- `core.ts`: `createScheduler` (`save`, `get`, `list`, `remove`, `runs`, `tick`), `SchedulerError`, `exponentialBackoff`, and the `SchedulerStore` interface.
- `memory-store.ts`: `MemorySchedulerStore`, for tests and single-process prototypes.
- `schema.sql` and `sql-store.ts`: the `scheduled_tasks` and `scheduled_task_runs` tables and `createSqlSchedulerStore(executor, { table?, runTable? })`. It works with any `query(text, params)` executor that uses `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden timer, queue or database. Your application calls `tick()` and supplies the store and the handlers.

## When to use it

Use it for recurring server work such as nightly reports, hourly syncs, cleanup, digests and renewals, in an app that runs more than one instance. Each occurrence must run once, a slow run must not pile up, and downtime must have a defined result. Use a job queue for one-off background work triggered by requests. Use the `cron-next` capability when you only need the next time in UTC.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlSchedulerStore(db)`. Elsewhere, provide a unique `(schedule_id, scheduled_for)` key, single-statement conditional updates for materialize, claim, slot, heartbeat and finish, and a due-run query that returns at most one run per schedule. |
| `handlers` | `{ name: async (ctx) => {...} }`. A schedule refers to a handler by name, so stored rows never contain code. `ctx` holds `scheduleId`, `runId`, `scheduledFor`, `attempt`, `payload`, `instanceId`, `signal` and `heartbeat()`. |
| `instanceId` | Unique per process, for example `web-${hostname}-${pid}`. |
| `tick()` | Called from your loop, worker or platform cron route, at least once per `graceMs` (default 60 s). |
| `onFailure(info)` | Optional. Called once when a run fails for good. Use it for alerting. |
| `now`, `newId`, `timers` | Optional injections: the clock, run ids, and the heartbeat timer (`false` disables it). |

```ts
import { createScheduler } from "./genlib/scheduled-tasks/core.js";
import { createSqlSchedulerStore } from "./genlib/scheduled-tasks/sql-store.js";

const scheduler = createScheduler({
  store: createSqlSchedulerStore(db),
  instanceId: `web-${process.env.HOSTNAME}-${process.pid}`,
  handlers: {
    "daily-report": async ({ scheduledFor, payload, signal }) => { await buildReport(scheduledFor, payload, signal); },
  },
  onFailure: ({ schedule, run, error }) => log.error("scheduled task failed", { id: schedule.id, run: run.id, error }),
});

await scheduler.save({
  id: "daily-report", cron: "0 7 * * MON-FRI", timeZone: "America/New_York", handler: "daily-report",
  payload: { team: "ops" }, overlap: "skip", catchUp: "latest", maxAttempts: 3,
});

// In each instance, every 15 seconds (or from a cron route once a minute):
await scheduler.tick();
```

## Behavior

### Cron and time

- **Syntax.** Five fields: minute, hour, day-of-month, month and day-of-week.
  - Each field is a comma list of `*`, `N`, `A-B` or a name (`JAN`-`DEC`, `SUN`-`SAT`, any case), with an optional `/step`. `N/step` runs from N to the field maximum.
  - Day-of-week 0 and 7 are both Sunday.
  - Macros: `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight` and `@hourly`.
  - Rejected: seconds fields, `?`, `L`, `W`, `#` and `@reboot`, as well as out-of-range values, reversed ranges, empty list items and zero steps.
- **Validation on save.** `save` fails with these codes:
  - `invalid-cron` (the message names the field)
  - `invalid-time-zone`
  - `unknown-handler` (the name is not registered)
  - `invalid-option`
  - `invalid-payload` (not plain JSON, or over 64 KiB as UTF-8 bytes of the serialized JSON)
  - `never-runs` (no run within 29 years, for example `0 0 30 2 *`)
- **Day rule (Vixie).** When both day fields are restricted (neither starts with `*`), a day matches if either field matches. Otherwise both must match. Leap days are searched for up to 29 years ahead, which covers the 2096 to 2104 gap.
- **Time zones.** Schedules match local wall-clock minutes in `timeZone` (default UTC). Names are stored in canonical form, so `america/new_york` becomes `America/New_York`. Two cases need special handling:
  - **Spring forward.** A wall time in the skipped hour runs once, at the first valid instant after the gap. In New York, 02:30 on 2026-03-08 runs at 03:00 EDT.
  - **Fall back.** A repeated wall time runs once, at its first occurrence. In New York, 01:30 on 2026-11-01 runs at 01:30 EDT only.

### Scheduling and execution

- **Materializing.** `tick` reads schedules whose `nextRunAt` is due. It computes the occurrences to run under the catch-up policy, then performs one atomic step: if `next_run_at` is unchanged, it advances it and inserts run rows. Inserts with an existing `(schedule_id, scheduled_for)` are ignored. Two instances therefore cannot create the same occurrence twice.
- **Fair claiming.** Each query for due runs returns at most one run per schedule (its earliest), and a schedule whose run was deferred is left out of the tick's later queries. A busy schedule's backlog therefore cannot crowd other schedules out.
- **Claiming.** A due run (pending and due, or running with an expired lease) is claimed with one conditional update. The claim sets the lease and increments `attempt`. Exactly one instance wins.
- **Overlap.** For `skip` and `queue`, the claimer must also take the schedule's slot. The slot is a conditional update on the schedule row, sharing the run's lease.
  - `skip`: an occurrence that came due while another run held the slot becomes `skipped`, with the error `overlap: a previous run is still executing`. An older backlog run or a retry waits instead.
  - `queue`: the claim is undone (back to `pending`, attempt restored) and the run starts after the slot is released.
  - `allow`: there is no slot, and runs may overlap.
- **Leases.** The default lease is 60 s and the minimum is 3 s (`MIN_LEASE_MS`). While a handler runs, an automatic heartbeat every `leaseMs/3` extends the run lease and the slot. Handlers can also call `ctx.heartbeat()`. A heartbeat succeeds only while the lease is live and still owned. Otherwise it returns false and aborts `ctx.signal`.
- **Crash recovery.** After an expired lease, another instance reclaims the same run (the attempt increments) and the slot. The stale worker's result is discarded and counted as `lostLease`.
- **Catch-up.** This policy applies to occurrences between the stored `nextRunAt` and now:
  - `none` runs only an occurrence at most `graceMs` late.
  - `latest` (the default) runs the most recent one.
  - `all` runs the most recent `maxCatchUp` (default 10, maximum 1,000), oldest first.

  The computation looks backward from now, so a month of downtime costs the same as an hour.
- **Failures.** When a handler throws, the run is retried after `min(retryMaxMs, retryBaseMs * 2^(attempt-1))`, by default 30 s doubling to 1 h. After `maxAttempts` (default 3) the run becomes `failed` and `onFailure` is called once. An error thrown by the hook is counted in `hookErrors`.
  - A run reclaimed after a crash during its final attempt fails without running again.
  - A handler name that is no longer registered fails immediately.
  - Errors are stored truncated to 1,000 characters.
- **History.** `runs(id)` returns runs newest first, with `status` (`pending`, `running`, `succeeded`, `failed` or `skipped`), `attempt`, `startedAt`, `finishedAt` and `error`.
- **Updates.** Re-saving with the same cron, zone and enabled state keeps the pending `nextRunAt`. Changing any of them recomputes it from now. Disabling sets `nextRunAt` to null, and pending runs of a disabled schedule are skipped. `remove` deletes the schedule and its history.
- **Tick summary.** `tick` returns `{materialized, claimed, succeeded, retried, failed, skipped, deferred, lostLease, hookErrors}`. Passing `tick(now)` fixes the tick's time, including leases and heartbeats, for drivers and tests.

## Verify

`npm run build && node --test tests/scheduled-tasks.test.mjs tests/scheduled-tasks-sql.test.mjs` covers these cases:

- parsing, rejection and save-time validation
- next runs with the Vixie rule and leap days
- America/New_York spring-forward and fall-back
- exactly-once execution with three instances on the memory store and four on PGlite
- a unique claim under concurrent materialization
- a queue schedule with a backlog of more than 100 rows not starving another schedule (memory and PGlite)
- a run with the minimum 3 s lease and a handler lasting four leases executing once
- the payload limit counted in UTF-8 bytes
- skip, queue and allow overlap
- heartbeats and crash recovery (memory and PGlite)
- the none, latest and all catch-up policies with a cap
- retries with backoff, `onFailure`, truncated errors and a crash in the final attempt

In the receiving app, run two instances against your real PostgreSQL. Check that each occurrence of a minutely schedule has exactly one row in `scheduled_task_runs`, and kill one instance mid-run to watch the other recover it.

## If something fails

- **Nothing runs.** Check that `tick()` is actually called. Also check `nextRunAt` in `scheduled_tasks` and that the schedule is `enabled`.
- **Runs are skipped with `overlap`.** The previous run was still executing. Make the job faster, use `queue`, or space the schedule out.
- **A run executed twice.** A worker crashed (or paused longer than `leaseMs` without heartbeating) after doing the work. Raise `leaseMs`, keep the heartbeat on, and make the handler idempotent per `scheduledFor`.
- **A job ran at an unexpected hour.** Check `timeZone`, and the DST rules above. Frequent jobs pause during the repeated fall-back hour; use UTC for those.
- **`never-runs` on save.** The day and month combination never occurs, for example the 31st in a 30-day month.

## Limits

- **At least once.** A crash after the effects were committed but before finishing retries the run, so handlers must be idempotent.
- **Wall-clock schedules.** Frequent schedules run once per wall time, so they pause during the repeated fall-back hour.
- **Time-zone data.** The conversion assumes at most one offset change within 26 hours, and the results depend on the runtime's ICU time-zone data.
- **No handler timeout.** The automatic heartbeat keeps a hung handler's lease alive, so watch `signal` and enforce your own deadlines.
- **Queue order.** Under `queue`, a retry waiting for its backoff can run after a newer occurrence.
- **Testing scope.** PGlite runs one connection, so contention across separate connections is not exercised in the tests.
- **Retention.** Rows are never pruned automatically.

Tick hosting, production database correctness, handler idempotency and consuming-application acceptance remain project responsibilities.
