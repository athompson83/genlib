# Tenant isolation · 0.1.1

## What installs

Four original Apache-2.0 files under `tenant-isolation/`:

- `core.ts`: `resolveTenant`, `createTenantHandler` (Fetch `Request`/`Response` wrapper), `tenantErrorResponse`, the selectors `headerSelector`, `pathSelector` and `subdomainSelector`, `isTenantId`, `assertTenantId` and `TenantIsolationError` (with a `.code`).
- `sql.ts`: `withTenant`, `scoped`, `tenantTableSql`, `tenantPredicate`, `appRoleSql`, `inspectIsolation` and `assertIdentifier`, for any `query(text, params)` executor with `$1` placeholders that returns `{ rows }` (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).
- `test-kit.ts`: `assertTenantIsolation` and `TenantIsolationAssertionError`, a cross-tenant test kit to call from your own tests.
- `schema.sql`: the `app_user` role (NOLOGIN, NOSUPERUSER, NOBYPASSRLS) and an example `tenant_items` table with row-level security enabled and forced.

There is no hidden user, session or membership system. The receiving application supplies those.

## When to use it

Use it when one database holds several customers' (tenants', organizations', workspaces') data and a user of one tenant must never read or change another's. It gives two independent layers: PostgreSQL row-level security as the enforcement, and a tenant-scoped repository as defense in depth. Do not use it as an authorization system for roles within a tenant (see `rbac`), or for separate-database-per-tenant designs, where the connection choice is the isolation.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `session(request)` | The signed-in user `{ userId, tenantId? }` from your verified session cookie or token. `tenantId` only when it is a verified claim. Return `null` when signed out. |
| `memberships(userId)` | The user's current `{ tenantId, role }` rows from your membership table. |
| `selector` | Optional: `headerSelector('x-tenant-id')`, `pathSelector('/t')` or `subdomainSelector('app.example.com')`. Untrusted; it only chooses among memberships. |
| Executor | `{ query(text, params), transaction?(work) }`. On a pool, `transaction` must run `work` on one checked-out client between `BEGIN` and `COMMIT`/`ROLLBACK`. |
| Database role | Queries must run as a role that is neither superuser nor `BYPASSRLS`. Log in as a member of `app_user`, or pass `{ role: 'app_user' }` to `withTenant` and `GRANT app_user TO your_login_user`. |
| Tenant tables | Each needs a `tenant_id` column (text, uuid, bigint or integer) and `tenantTableSql('table', { columnType })` applied in a migration. |

```ts
import { createTenantHandler, headerSelector } from "./genlib/tenant-isolation/core.js";
import { scoped, withTenant } from "./genlib/tenant-isolation/sql.js";

export const getProject = createTenantHandler(
  { session, memberships, selector: headerSelector("x-tenant-id") },
  async (request, { tenantId }) => withTenant(db, tenantId, async (tx) => {
    const projects = scoped(tx, tenantId, { table: "projects", columns: ["name", "created_at"] });
    return Response.json(await projects.require(new URL(request.url).searchParams.get("id") ?? ""));
  }, { role: "app_user" }),
);
```

```js
// In your own test suite, against a test database:
import { assertTenantIsolation } from "./genlib/tenant-isolation/test-kit.js";
await assertTenantIsolation({
  executor: pool, client: await pool.connect(), table: "projects", tenants: ["tenant-a", "tenant-b"], role: "app_user",
  row: (tenantId, i) => ({ id: `p-${tenantId}-${i}`, name: "fixture" }),
});
```

## Behavior

- **Tenant resolution.** The session must be valid (otherwise `unauthenticated`, 401). A selector value or a verified session claim names the wanted tenant, and it must be one of the user's memberships; otherwise `not-a-member`, answered as 404 `not-found` by default so the response does not reveal which tenants exist (`hiddenStatus: 403` to change). A selector that disagrees with a session claim fails the same way. Without either, a single membership decides; several give `tenant-required` (400); none give `no-tenant` (403). Tenant ids are 1 to 128 characters of `[A-Za-z0-9_.:-]`; others give `invalid-tenant` before any lookup. Memberships are read on every request, so revocations apply at once.
- **withTenant.** Opens one transaction, runs `SELECT set_config('app.tenant_id', $1, true)` and optionally `SET LOCAL ROLE app_user`, then `fn(tx)`. Both are transaction-local: they end at `COMMIT` or `ROLLBACK`, so a pooled connection never carries a tenant into the next request. Errors roll back and rethrow.
- **Row-level security.** `tenantTableSql` emits `ENABLE` and `FORCE ROW LEVEL SECURITY` (so the table owner is filtered too), one policy whose `USING` and `WITH CHECK` are `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')`, and grants to the role. An unset setting is NULL and a reset one is `''`; both match no row, so a query that forgets `withTenant` returns nothing instead of everything. Rows written for another tenant, or moved into one, fail the `WITH CHECK`.
- **Scoped repository.** `scoped(executor, tenantId, { table, columns, idColumn?, tenantColumn? })` adds `tenant_id = $n` to every `get`, `require`, `list`, `insert`, `update` and `delete`. Another tenant's id returns `null`/`false`, and `require` throws `not-found`. Inserts set the tenant column and refuse another tenant's value (`tenant-mismatch`). Updates cannot change the tenant or id column. Column names come only from the configured list (`invalid-column`); values are always parameters.
- **inspectIsolation(executor, table, role?, { schema?, setting? }).** Reads `pg_class`, `pg_policies` and `pg_roles` for the table in `schema` (default `public`) and reports a table without RLS or without `FORCE`, a role that is superuser or `BYPASSRLS`, no permissive policy, and any permissive policy whose `USING` (except INSERT-only) or effective `WITH CHECK` (ALL, INSERT, UPDATE) does not read the tenant setting. Permissive policies are OR-ed, so one `USING (true)` opens the table; restrictive policies only narrow access and are ignored. The check is textual (the setting is referenced), not a proof of the expression; the test kit proves behavior.
- **Test kit.** `assertTenantIsolation` seeds one row per tenant through `withTenant`, then checks as tenant A: the role cannot bypass RLS, an unscoped `SELECT` sees only A, selecting, updating and deleting B's id affect nothing, inserting as B and moving A's row to B are refused, no tenant set returns no rows, and the setting does not outlive the transaction. Each check has a `status` of `passed`, `failed` or `not-checked`. The setting-lifetime check runs inside and after a transaction on one dedicated connection: pass `client` (a checked-out client), or an executor without `transaction()` is used as that client; with only a pool it is `not-checked`, because a follow-up query could land on another connection. The kit deletes its seeded rows and throws `TenantIsolationAssertionError` listing every failed check.

## Errors

`TenantIsolationError.code`: `unauthenticated` (401), `invalid-tenant` (400), `tenant-required` (400), `no-tenant` (403), `not-a-member` (404 or 403), `not-found` (404), `invalid-column` (400), `invalid-limit` (400), `tenant-mismatch` (400), `invalid-identifier` (a programming error in table, column, role or setting names; 500).

## Security notes

- Row-level security does not apply to superusers, `BYPASSRLS` roles, or the table owner unless `FORCE` is set. Check with `inspectIsolation` in a deployment check.
- Views run with their owner's rights unless created `WITH (security_invoker = true)` (PostgreSQL 15+); `SECURITY DEFINER` functions also bypass the caller's policies. Review both.
- With PgBouncer, use transaction pooling with `set_config(..., true)` as here; session-level `SET` would leak across clients.
- Unique constraints are global across tenants; a duplicate in another tenant still raises a conflict, which reveals that the value exists. Include `tenant_id` in unique keys that must be per tenant.

## Verification

`npm run build && node --test tests/tenant-isolation.test.mjs tests/tenant-isolation-sql.test.mjs`. The SQL tests run on PGlite 0.5.8, which connects as the superuser `postgres`; every database check switches to the NOLOGIN, NOBYPASSRLS role `app_user` with `SET LOCAL ROLE`. Pooled multi-connection behavior, LOGIN roles and hosted Postgres were not exercised.
