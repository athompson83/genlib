# Role-based access control · 0.1.0

## What installs

Five original Apache-2.0 files under `rbac/`:

- `core.ts`: `createRbac` (can, assert, permissionsFor, grant, revoke, listAssignments, grantAsSystem, describeRoles), `RbacError`, `MANAGE_PERMISSION`, `isPermissionPattern` and the `RbacStore` interface.
- `memory-store.ts`: `MemoryRbacStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createRbacHandler`, a server-only Fetch `Request`/`Response` adapter, and `requirePermission`, a wrapper for your other route handlers.
- `schema.sql` and `sql-store.ts`: the PostgreSQL table and `createSqlRbacStore(executor, { table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database or user system. The application supplies the store, the role definition and the signed-in subject.

## When to use it

Use it when a multi-tenant server app (organizations, teams, workspaces) needs roles such as owner, admin, editor and viewer, optionally per project or document, with checks like `invoice:delete`. Do not use it for row ownership rules ("authors may edit their own posts"), attribute-based policies or relationship graphs; combine those checks with this module or use a policy engine.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `roles` | A static definition: `{ role: { permissions, inherits?, protected? } }`. Permissions are `resource:action` with `*` wildcards (`invoice:*`, `*:read`, `*`); prefix `!` to deny. Give managing roles `rbac:manage`; flag the owner role `protected: true`. |
| `RbacStore` | On PostgreSQL: apply `schema.sql` and call `createSqlRbacStore(db)`. Elsewhere: a unique key on `(tenant, subject, role, resource or '')` and a last-holder guard that is one atomic step. |
| First owner | Call `rbac.grantAsSystem({ tenantId, subjectId, role: "owner" })` from trusted tenant-creation code. It skips actor checks, so never expose it through a route. |
| `authenticate(request)` | The signed-in subject id from your session or verified token. Never from the request body. |
| `getCtx(request)` for `requirePermission` | The subject plus the tenant (and optional resource) the route acts on, resolved from trusted server state. |

```ts
import { createRbac } from "./genlib/rbac/core.js";
import { createSqlRbacStore } from "./genlib/rbac/sql-store.js";
import { createRbacHandler, requirePermission } from "./genlib/rbac/http.js";

const rbac = createRbac({
  store: createSqlRbacStore(db),
  roles: {
    viewer: { permissions: ["*:read"] },
    editor: { permissions: ["invoice:create", "invoice:update", "!invoice:delete"], inherits: ["viewer"] },
    admin: { permissions: ["rbac:manage", "invoice:*", "project:*"], inherits: ["viewer"] },
    owner: { permissions: ["*"], protected: true },
  },
});
export const rbacRoutes = createRbacHandler({ rbac, prefix: "/api/rbac", allowedOrigins: [APP_ORIGIN], authenticate });
export const deleteInvoice = requirePermission(rbac, "invoice:delete", async (request) => {
  const user = await authenticate(request);
  return user && { subjectId: user.subjectId, tenantId: tenantFromPath(request) };
})(handleDeleteInvoice);
```

## Behavior

- **Definitions are checked at creation.** An unknown inherited role, an inheritance cycle, an invalid role name or an invalid permission string throws `RangeError`. Inheritance copies both allows and denies.
- **Checks fail closed.** `can(subjectId, permission, { tenantId, resourceId? })` returns `{ allowed, reason, via? }`. The permission must be concrete (`invoice:read`); a wildcard, empty or malformed permission returns `invalid-permission`. A malformed tenant or resource returns `invalid-context`. Other reasons are `allowed`, `denied-by-rule` and `no-matching-role`.
- **Deny wins.** A deny pattern on any applicable role overrides every allow, including allows from the subject's other roles. `via` names the denying role in that case, and otherwise the first granting role in name order.
- **Scope.** Assignments apply only in their own tenant. A tenant-wide assignment (`resourceId` null) applies to every resource; a resource-scoped one applies only when the check names that resource. An assignment at or past `expiresAt` is ignored, and a role removed from the definition grants nothing.
- `assert` throws `RbacError("forbidden")`. `permissionsFor` returns `{ roles, allow, deny }` as sorted patterns.
- **Grant and revoke** need `rbac:manage` in the tenant, or on the resource for a resource-scoped assignment.
- **Anti-escalation.** The role being granted or revoked must not grant anything the actor lacks: every allow must be covered by one of the actor's allows, and every actor deny that overlaps it must be matched by a deny in the role. So an admin cannot make anyone an owner, promote themselves or remove an owner.
- **Idempotent grants.** Granting an existing assignment returns `created: false` and keeps `createdAt` and `grantedBy`; a new `expiresAt` replaces the old one, which also revives an expired assignment.
- **Last owner.** Revoking the last active tenant-wide holder of a `protected` role throws `last-owner`. The SQL store does the check and the delete in one statement that first locks every holder row of that role (`FOR UPDATE`, ordered), so two concurrent revokes of the last two owners cannot both succeed. Protected roles cannot be granted with `expiresAt`, so the last owner never lapses silently.
- `listAssignments(actorId, tenantId, { subjectId?, cursor?, limit? })` needs `rbac:manage`, includes expired rows, orders by subject, role and resource, and pages by an opaque keyset cursor (`limit` 1 to 100, default 50).

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}/me/permissions?tenantId=&resourceId=` | none | `200 {tenantId, resourceId, roles, allow, deny}` for the signed-in subject |
| `GET {prefix}/assignments?tenantId=&subjectId=&cursor=&limit=` | none | `200 {assignments, nextCursor}` |
| `POST {prefix}/assignments` | `{tenantId, subjectId, role, resourceId?, expiresAt?}` | `201 {assignment, created: true}`, or `200` when it already existed |
| `DELETE {prefix}/assignments` | `{tenantId, subjectId, role, resourceId?}` | `200 {removed}` |

| Code | Status |
| --- | --- |
| `forbidden`, `escalation` | 403 |
| `last-owner` | 409 |
| `invalid-*`, `bad-request`, invalid JSON | 400 |

Signed-out callers get 401. State-changing requests without an exact allowed `Origin` get 403. Bodies must be `application/json` and at most 4 KB. Responses carry `cache-control: no-store`.

`requirePermission(rbac, permission, getCtx)(handler)` returns 401 JSON when `getCtx` returns null, 403 `{error: "forbidden", reason}` when the check fails, and otherwise calls `handler`.

## Verify

`npm run build && node --test tests/rbac.test.mjs tests/rbac-sql.test.mjs`

`tests/rbac.test.mjs` uses the memory store and the HTTP adapter. It covers these cases:

- creation-time validation and cycle rejection
- wildcards, inheritance and deny precedence
- fail-closed shapes, tenant isolation and resource scope
- expiry, anti-escalation and idempotent grants
- last-owner protection, including two concurrent revokes
- paging
- every route, the 401/403/409/400 statuses, the origin check and the `requirePermission` wrapper

`tests/rbac-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite. It covers the schema, the COALESCE unique index, the core behaviors and repeated concurrent revokes of the last two owners (exactly one succeeds each round). It also checks four concurrent guarded removals (one holder always remains) and that expired or other-tenant owners never count.

In the receiving app, add tests for an ordinary member's denial and success on your real routes, and run two concurrent last-owner revokes against your production database.

## If something fails

- Every check returns `invalid-permission` → you passed a pattern (`invoice:*`) to `can`; checks take one concrete `resource:action`.
- Grants fail with `escalation` → the actor lacks a permission the role grants, or has a deny the role lacks; give the role the same deny or grant from a stronger role.
- The first owner cannot be created → use `grantAsSystem` from tenant-creation code; `grant` needs an actor who already holds `rbac:manage`.
- Two owners were both removed under load → your custom store's guard is not atomic; lock the holder rows or use a serializable transaction around the count and delete.

## Limits

This package does not authenticate users, cache decisions or evaluate attribute and relationship rules. Roles are code, not runtime data. The PGlite tests run on one connection, so real parallel lock behavior is not exercised. Production database correctness, session security and consuming-application acceptance remain project responsibilities.
