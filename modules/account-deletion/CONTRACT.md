# Account deletion with a grace period · 0.1.0

## What installs

Five original Apache-2.0 files under `account-deletion/`:

- `core.ts`: `createAccountDeletion` (request, cancel, status, isDisabled, describePolicy, runDue), `AccountDeletionError` and the `AccountDeletionStore` interface.
- `memory-store.ts`: `MemoryAccountDeletionStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createAccountDeletionHandler`, a server-only Fetch `Request`/`Response` adapter, and `publicView`, which drops the worker's claim token.
- `schema.sql` and `sql-store.ts`: the PostgreSQL `account_deletions` table and `createSqlAccountDeletionStore(executor, { table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden user table, session store or scheduler. The receiving application supplies those through the integration points below.

## When to use it

Use it when users can delete their own account (or support staff can delete one on request), the deletion should wait out a grace period in which the user can change their mind, and each kind of personal data needs an explicit outcome: deleted, anonymized or retained for a stated reason. Do not use it for soft-deleting individual records or for data export (a separate feature).

## Integration points

| Point | What the application supplies |
| --- | --- |
| `AccountDeletionStore` | On PostgreSQL: apply `schema.sql` and call `createSqlAccountDeletionStore(db)`. Elsewhere: one live (pending, executing or completed) request per user, enforced atomically, and conditional claim, renew, step, complete and release statements that check the lease token. |
| `authorize(actor, action, {userId, self})` | Allow `request`, `cancel` and `read` for the owner (`self: true`) and for the admins you choose. Return `false` to deny. |
| `revokeSessions(userId)` | Revoke every session, refresh token and API token of the user. Called on request. |
| `policy` | Ordered entries `{ name, action: "delete" \| "anonymize" \| "retain", reason, run? }`. `run` is required for delete and anonymize and must be idempotent. Put the account row last. |
| `actor.authenticatedAt` | When the caller last proved their credentials (sign-in, password or passkey prompt). Requests and cancels need it within `recentAuthMs`. |
| `isDisabled(userId)` | Call it from sign-in and request authentication. For a disabled account, allow only the cancel flow. |
| `runDue({limit})` | Call it from a scheduler or the `durable-jobs` module. |
| `authenticate(request)` | The caller for the HTTP adapter, with `authenticatedAt`. |

```ts
import { createAccountDeletion } from "./genlib/account-deletion/core.js";
import { createSqlAccountDeletionStore } from "./genlib/account-deletion/sql-store.js";
import { createAccountDeletionHandler } from "./genlib/account-deletion/http.js";

const deletion = createAccountDeletion({
  store: createSqlAccountDeletionStore(db),
  authorize: async (actor, _action, { self }) => self || (await isSupportAdmin(actor.userId)),
  revokeSessions: (userId) => sessions.revokeAll(userId),
  graceMs: 30 * 86_400_000,
  policy: [
    { name: "uploads", action: "delete", reason: "User files", run: ({ userId }) => storage.deletePrefix(`users/${userId}/`) },
    { name: "comments", action: "anonymize", reason: "Keep threads readable", run: ({ userId }) => db.query("UPDATE comments SET author_id = NULL WHERE author_id = $1", [userId]) },
    { name: "invoices", action: "retain", reason: "Tax records kept 7 years" },
    { name: "user", action: "delete", reason: "The account itself", run: ({ userId }) => db.query("DELETE FROM users WHERE id = $1", [userId]) },
  ],
});
export const api = createAccountDeletionHandler({ deletion, prefix: "/api/account-deletion", allowedOrigins: [APP_ORIGIN], authenticate });
// In a scheduled job: await deletion.runDue({ limit: 20 });
```

## Behavior

- **Request** checks the user id, then `authorize`, then that `actor.authenticatedAt` lies within `recentAuthMs` (default 5 minutes) of now; otherwise `reauth-required`. It refuses `already-pending` while a request is open and `already-deleted` after completion. The store enforces this in the insert itself (a unique index over pending, executing and completed rows), so a request racing completion cannot reopen a deleted account. It inserts the pending row first, so the account is disabled from that moment, then calls `revokeSessions`. When revocation throws, the pending row is discarded and `revoke-failed` is raised: nothing stays scheduled while sessions may be live.
- **Grace period**: the request is due at `requestedAt + graceMs` (default 30 days, 0 to 365 days). `isDisabled` is true while pending or executing and after completion.
- **Cancel** needs the same authorization and recent authentication. The owner has no session during the grace period, so the sign-in flow verifies their credentials and calls `cancel` with a fresh actor before issuing a new session. It succeeds only while the request is pending and before `scheduledFor`, as one conditional store step; afterwards it fails with `too-late`.
- **runDue** claims up to `limit` (default 10, 1 to 100) due requests in one atomic step: pending with `scheduledFor <= now`, or executing with an expired lease. Each claim sets a fresh claim token, a lease of `leaseMs` (default 5 minutes) and `attempts + 1`. Requests claimed together are processed one after another, so before each request and each handler the worker renews its lease conditionally on still holding the token; when renewal fails, another worker has taken the request over and it is reported under `lost` without running anything. Policy entries run in order; after each, the step name is recorded and the lease renewed, both only while the worker still holds the token. Steps already recorded are skipped, so a retry resumes where the previous run stopped.
- **Failures**: a handler that throws releases the claim with `lastError` and makes the request claimable again after `retryDelayMs` (default 60 seconds). A worker that crashes keeps nothing: its lease expires and the next run resumes. A stale worker whose lease was taken over gets `false` from the store and reports the request under `lost`.
- **Completion** sets `completed` with `completedAt`, clears the claim and lastError, and is never run again.
- **describePolicy** returns the declared entries without functions, for a privacy notice or an audit record.

## HTTP routes

`createAccountDeletionHandler({ deletion, prefix, authenticate, allowedOrigins, maxRequestBytes? })`; `{userId}` may be `me`.

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}/{userId}` | none | `200 {deletion}` (latest request or `null`) |
| `POST {prefix}/{userId}` | optional `{reason}` | `202 {deletion}` |
| `DELETE {prefix}/{userId}` | none | `200 {deletion}` (cancelled) |

| Code | Status |
| --- | --- |
| `reauth-required` | 401 |
| `forbidden` | 403 |
| `already-pending`, `not-pending`, `too-late` | 409 |
| `already-deleted` | 410 |
| `too-large` | 413 |
| `revoke-failed` | 503 |
| `invalid-*`, `bad-request` | 400 |

Signed-out callers get 401. State-changing requests without an allowed `Origin` get 403. Bodies are at most 4,096 bytes by default. Responses carry `cache-control: no-store` and never include the claim token.

## Verify

`npm run build && node --test tests/account-deletion.test.mjs tests/account-deletion-sql.test.mjs` covers re-authentication, the grace period and disabled gate, cancel and too-late, session revocation and its failure, the ordered delete/anonymize/retain policy and its validation, owner/admin authorization, failed-step retry, crash resume with a stale worker, concurrent runs and the HTTP routes.

`tests/account-deletion-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite: the schema, the partial unique index, two concurrent `runDue` calls executing each due account exactly once (interleaved statements on one connection), lease renewal skipping a request another worker took over, a request racing completion, crash resume after lease expiry and failed-step retry.

In the receiving app, test each policy handler against your real tables (including a second run, to prove idempotence), an ordinary user's denial on another account, and that sign-in refuses a disabled account.

## If something fails

- A step runs twice → expected after a crash between the handler and its step record; make the handler idempotent (`DELETE ... WHERE`, `UPDATE ... SET author_id = NULL`).
- Two workers run the same account → your store's claim reads then writes; use one conditional `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) AND <due> RETURNING`.
- Requests stay `executing` with `lastError` → a handler keeps failing; inspect `lastError` and `attempts` and alert on them.
- Users still signed in after requesting → `revokeSessions` does not cover every token type, or sign-in does not call `isDisabled`.

## Limits

This package does not delete data itself, verify passwords, store users, send confirmation emails, purge backups or notify third-party processors; declare those as policy handlers or handle them in the application. Failed steps retry without a maximum. The SQL concurrency test runs on PGlite, a single connection: it proves the conditional claim when statements interleave, not behavior under real multi-connection contention. Legal retention periods, erasure obligations and consuming-application acceptance remain project responsibilities.
