# Feature flags with gradual rollout and A/B assignment · 0.1.0

## What installs

Five original Apache-2.0 files under `feature-rollout/`:

- `core.ts`: `createFeatureFlags` (evaluate, expose, conversions, stitching, analysis, change notification and the `admin` API), the pure `evaluateFlag` and `validateFlagInput`, `twoProportionZTest`, the hashing helpers `fnv1a32`, `stableHash` and `bucketOf`, `FeatureFlagError`, and the `FeatureFlagStore` interface.
- `memory-store.ts`: `MemoryFeatureFlagStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createFeatureFlagHandler`, a server-only Fetch `Request`/`Response` adapter, plus `DEFAULT_ROUTES` and `DEFAULT_STATUS`.
- `schema.sql` and `sql-store.ts`: five tables (`feature_flags`, `feature_flag_audit`, `feature_flag_assignments`, `feature_flag_exposures`, `feature_flag_conversions`) and `createSqlFeatureFlagStore(executor)`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

The core works without `http.ts`. There is no hidden database, analytics service or identity system: the application supplies the store, the actor and the subject.

## When to use it

Use it to ship a feature to a growing share of users or tenants, turn it off instantly, and run A/B experiments whose results you analyze in the app's own database. Flags are not authorization: keep permission checks separate (see `rbac` and `entitlements`). For a hosted experimentation platform with a warehouse and dashboards, use one (for example GrowthBook or Unleash) instead.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlFeatureFlagStore(db)`. Elsewhere, implement `FeatureFlagStore`: a version-conditional flag write that appends its audit row atomically, and insert-if-absent assignments, exposures and conversions. |
| `authorize(actor, action, flagKey)` | Returns `true` to allow `read`, `create`, `update`, `delete` or `audit`. Without it every admin call fails with `forbidden`. |
| Subject | `{ userId?, anonymousId?, tenantId? }` from trusted server context: the session user and tenant, and an anonymous-id cookie. |
| `onExposure(event)` | Optional. Called once per unit per experiment. Forward it to your analytics. |
| `cacheTtlMs`, `refresh()` | How stale a server may be (default 5,000 ms). Call `refresh()` from pub/sub (for example `LISTEN/NOTIFY`) to apply changes sooner. |
| HTTP `authenticate(request)`, `subject(request)` | The signed-in operator (or `null`) and the evaluation subject. |
| HTTP `routes`, `statusFor`, `prefix`, `allowedOrigins` | Your URL shape, status conventions, mount path and, for cookie-authenticated admin UIs, the exact allowed origins. |

```ts
import { createFeatureFlags } from "./genlib/feature-rollout/core.js";
import { createSqlFeatureFlagStore } from "./genlib/feature-rollout/sql-store.js";
import { createFeatureFlagHandler } from "./genlib/feature-rollout/http.js";

export const flags = createFeatureFlags({
  store: createSqlFeatureFlagStore(db),
  authorize: (actor, action) => roles.of(actor.id).includes(action === "read" || action === "audit" ? "flag-viewer" : "flag-admin"),
  onExposure: (event) => analytics.track("experiment_exposure", event),
});
export const handler = createFeatureFlagHandler({
  flags, prefix: "/api/flags",
  authenticate: (request) => session.operator(request),
  subject: (request) => ({ userId: session.userId(request), tenantId: session.tenantId(request), anonymousId: cookies(request).aid }),
});
// Server render: show the variant and record the exposure only where it is rendered.
const hero = await flags.expose("hero-copy", subject);
```

## Behavior

- **Flag definition.** A flag has a `key` (`[A-Za-z0-9._-]{1,100}`), `enabled`, `rolloutPercent` (0 to 100, two decimals), `bucketBy` (`user` or `tenant`), `allowUsers`, `denyUsers`, `allowTenants`, `denyTenants`, `variants` (up to 20, integer weights 0 to 10,000, at least one positive) and `salt`. Invalid input fails with `invalid-flag` and a `problems` list. Unknown fields are rejected too.
- **Sticky buckets.** The bucket is `stableHash("key:id") % 10000`, where `stableHash` is FNV-1a 32 followed by the MurmurHash3 fmix32 finalizer. The id is `userId`, then `anonymousId` (or `tenantId` when `bucketBy` is `tenant`). A subject is on when its bucket is below `rolloutPercent × 100`, so raising the percentage only adds subjects.
- **Precedence.** Kill switch (`enabled: false`), then user deny, user allow, tenant deny, tenant allow, a stored experiment assignment, and finally the rollout bucket. Each result reports `reason` (`disabled`, `user-deny`, `user-allow`, `tenant-deny`, `tenant-allow`, `assigned`, `rollout`, `excluded`, `no-subject` or `not-found`), `bucket`, `version`, `variant` and `variantSource`.
- **Runtime config.** Flags are read from the store and cached for `cacheTtlMs`. Concurrent loads share one read. When a reload finds new versions, `subscribe` listeners get `{ changed: [keys] }`. If the store fails, the last good config is served and the reload is retried after one TTL. A server with no config yet surfaces the error.
- **Audited admin.** `admin.create`, `update` (optional `expectedVersion`) and `remove` check `authorize`. Each change and its audit entry (`id`, `flagKey`, `action`, `actor`, `at`, `before`, `after`) commit together, conditional on the version: concurrent writers at one version get one winner and `conflict` for the rest. `admin.audit` lists entries newest first. The SQL audit table rejects `UPDATE` and `DELETE` with a trigger.
- **Experiments.** A flag with variants is an experiment. A variant is chosen by `stableHash("key:[salt:]variant:id") % totalWeight`, salted by the key, so experiments are independent and a zero-weight variant gets no new subjects.
- **Runs.** Each flag has a `runId`, set on create and replaced whenever `salt` changes. Assignments, exposures and conversions are stored per run, so a new salt or deleting and recreating the key reruns the experiment: subjects are reassigned from the hash, exposed afresh, and `analyze` starts empty. Other edits (weights, traffic, lists) keep the run and its sticky assignments.
- **Exposure.** `expose(key, subject)` evaluates and, when the flag is on, stores the assignment (insert-if-absent) and records an exposure once per unit. Evaluating alone writes nothing.
- **Stickiness.** Once exposed, a subject keeps its variant when weights, traffic or the variant list change, including when its variant's weight drops to 0 or the rollout percentage is lowered (reason `assigned`). If its variant is removed, it is reassigned with `variantSource: "reassigned"` and `previousVariant`, and the new variant is stored. Kill switch and deny lists still win.
- **Identity stitching.** Assignment lookup checks `user:<id>` first, then `anon:<id>`. A signed-in visitor with an anonymous assignment keeps it (`variantSource: "stitched"`), and `expose` copies it to the user under the same unit, so it is not counted twice. `stitch(anonymousId, userId)` copies all of a visitor's assignments at sign-in.
- **Analysis.** `trackConversion(key, subject, metric?)` counts once per unit, and only for exposed units. `analyze(key, { metric?, control?, alpha? })` returns per-variant exposures, conversions, rate, lift and a pooled two-proportion z-test against control (the first variant by default), with a two-sided p-value. Conversions count toward the variant first shown (intention to treat).

## HTTP routes

Paths are relative to `prefix`. Override any of them with `routes` (`"METHOD /path"`, `:key` for the flag key).

| Name | Default | Result |
| --- | --- | --- |
| `listFlags` | `GET /flags` | `200 {flags}` |
| `createFlag` | `POST /flags` | `201 {flag}` |
| `getFlag` | `GET /flags/:key` | `200 {flag}` |
| `updateFlag` | `PATCH /flags/:key` | `200 {flag}`. The body holds the fields to change and an optional `expectedVersion`. |
| `deleteFlag` | `DELETE /flags/:key?version=` | `204` |
| `flagAudit` | `GET /flags/:key/audit?limit=` | `200 {entries}` |
| `evaluate` | `POST /evaluate` | `200 {flags: {key: {on, variant, reason}}}`. The body is `{keys?, expose?}`, with at most 100 keys; omit `keys` for all flags. As a GET route it reads `?keys=a,b&expose=1`. |

Default error statuses (override with `statusFor`):

| Code | Status |
| --- | --- |
| `invalid-flag`, `bad-request`, `invalid-json` | 400 |
| `unauthenticated` | 401 |
| `forbidden` | 403, also for a disallowed `Origin` |
| `not-found` | 404 |
| `method-not-allowed` | 405 |
| `conflict`, `exists` | 409 |
| `no-route` | 404 |

Bodies over `maxRequestBytes` (default 65,536) get `bad-request`. Every response carries `cache-control: no-store`. The evaluate subject comes only from `subject(request)`; ids or flag settings in the body are ignored.

## Verify

`npm run build && node --test tests/feature-rollout.test.mjs tests/feature-rollout-sql.test.mjs` covers these cases:

- sticky buckets and the FNV-1a reference vectors
- monotonic rollout, and tenant bucketing
- precedence and reasons
- validation
- the TTL cache, change notification and stale-on-failure behavior
- authorization, audit contents and one winner among concurrent writers
- weights and zero weights, and experiment independence
- exposure once per unit under concurrency
- stitching
- stickiness when weights, traffic or the variant list change
- the z-test against reference values
- the HTTP routes, statuses and overrides
- on PGlite: the audited atomic writes, the append-only trigger and the experiment flow

In the receiving app, run the same cases against your real store, including two concurrent admin updates and concurrent exposes.

## If something fails

- **A change does not show up:** another server is still inside `cacheTtlMs`. Wait one TTL, or call `refresh()` from your pub/sub.
- **Every admin call is `forbidden`:** pass `authorize`, and check that the actor has a non-empty `id`.
- **Exposures double after sign-in:** pass both `anonymousId` and `userId` to `expose` (or call `stitch`), so the user inherits the anonymous unit.
- **Results look wrong after a weight change:** analysis counts the variant first shown. Subjects evaluated but never exposed have no stored assignment.

## Limits

- **Buckets.** The bucket is FNV-1a 32 followed by fmix32 over `"key:id"`, modulo 10,000. This is the same hash the `feature-flags` capability's TypeScript recipe uses, so buckets agree, and variants agree when the salt is empty. Earlier recipe versions used plain FNV-1a and differ.
- **Statistics.** The z-test is a normal approximation without sequential-testing or multiple-comparison correction. Peeking repeatedly inflates false positives.
- **Propagation.** Changes reach other servers within `cacheTtlMs` unless the app calls `refresh()`.
- **Old runs.** Rows of earlier runs (a changed salt, or a deleted flag) stay in the store but are never read or counted. Purge them on a schedule if you do not need the history.
- **Rate limiting.** The adapter has none. Put it behind your gateway's limiter.
- **Testing scope.** PGlite runs as a single connection, so the concurrency tests check the conditional statements, not real multi-connection contention.

Production database correctness, analytics delivery and consuming-application acceptance remain project responsibilities.
