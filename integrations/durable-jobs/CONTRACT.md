# Durable jobs and webhook inbox

Original Apache-2.0 server adapters provide pg-boss lifecycle operations and a persistent PostgreSQL inbox. The inbox and queue can be adopted independently. This pack is **experimental for external PostgreSQL/pg-boss runtime acceptance**; actual local SQL evidence is described below.

## Install and explicit setup

```sh
npm ci --ignore-scripts
npm test
```

Run from this directory using Node 24 (locally 24.19.0). The lock pins pg-boss 12.37.1 and pg 8.23.1. PGlite 0.5.8 is a test-only dependency. Importing either adapter performs no connection, migration or job. Keep these files on the trusted server.

Apply `src/inbox.sql` deliberately through the application's migration system. It creates `genlib_webhook_inbox`, a unique tenant/provider/event key, state columns and pending/lease indexes. The adapter accepts a `SqlExecutor` compatible with a pg pool/client or an application transaction. Provide database roles, schema ownership, pooling and retention policies. The migration does not configure row-level security or automatically purge receipts.

## Persistent receipt and processing contract

`receiveVerified({ tenantId, provider, eventId, rawBody, payload })` must be called **after** provider signature verification over the original bytes, timestamp/replay-window checks and tenant authorization. The type name is not cryptographic verification. Bound the incoming HTTP body before parsing; the adapter also limits raw/JSON payloads to 1 MiB. Do not let request parameters choose an unverified tenant.

Receipt insertion is a single parameterized SQL statement. Repeating an identity with the same raw-body hash increments its receipt count and returns the existing state. Reusing the identity with different bytes throws `WebhookIdentityConflict`; do not silently acknowledge it as a matching duplicate. A receipt persists across application restarts because it lives in PostgreSQL, not an in-memory set.

`claim` uses `FOR UPDATE SKIP LOCKED`, an expiring random lease token and an attempt limit. It can recover expired processing attempts and retires exhausted ones. `extend`, `complete` and `fail` update only an unexpired matching token. A former owner receives `LostInboxLease` after expiry/replacement. Completion output is bounded to 64 KiB; stored error text must already be redacted. `fail` schedules a bounded retry delay or a dead state.

`processInboxOnce(inbox, handler)` handles one default-duration lease and completes/retries it. For longer tasks, use the explicit claim/extend APIs and stop work when ownership is lost. There is no hidden polling daemon or automatic lease heartbeat. Use one consistent attempt/lease policy across workers and choose a lease comfortably above expected work duration.

A lease exposes a stable `idempotencyKey` derived from tenant/provider/event identity. Pass it to an external provider that supports idempotency or use an application outbox/transaction design. A database receipt does not guarantee exactly-once remote side effects: a worker can fail after the remote effect and before completion. Keep completed/dead receipts for the application's replay horizon; deleting them permits reprocessing.

## pg-boss runner

`createJobRunner` requires a connection string and `onError`; optional schema/pool settings are explicit. `start()` connects and lets pg-boss perform its documented schema setup. `register(name, parse, handler, options)` creates a work queue and retained dead-letter queue and starts a real worker. Payload parsing runs before handler execution. Defaults are retry limit 5, backoff, concurrency 2 and expiry 300 seconds; concurrency is bounded to 32. Call `stop()` for graceful shutdown.

`enqueue`, `schedule` and `unschedule` require the queue to be registered in this runner. Enqueue can use a pg-boss singleton key/window; this is time-window deduplication, not a permanent once-only guarantee. Handler context supplies the job ID and a stable retry idempotency key. Cron/timezone scheduling does not start itself by importing code. Monitor failures, depth, age, dead letters and graceful shutdown in the application. See [pg-boss](https://pgboss.io/) for the pinned API's operational requirements.

## Evidence and remaining acceptance

Five tests run the real inbox SQL in PGlite: uniqueness and conflicting bytes, adapter recreation, stale/expired owners, retry/dead transitions and completion. They also import actual pg-boss and check guards before startup. PGlite embeds PostgreSQL but these tests **do not establish a separately running PostgreSQL server, multi-process contention/failover or pg-boss worker execution**. Before shipping, run migration, concurrent claims, worker shutdown/restart, retry/dead-letter delivery, real provider signature fixtures and crash-after-side-effect recovery against the application's database profile. No external database or provider was contacted by these tests.

The glue is Apache-2.0; pg and pg-boss retain MIT terms. Test-only PGlite retains Apache-2.0 terms. No hosted queue, administrative dashboard or copied provider verification implementation is included. Preserve notices and review pg-boss schema/runtime release notes before upgrades.
