# Soft delete and restore · 0.1.0

## What installs

Five original Apache-2.0 files under `soft-delete/`:

- `core.ts`: `createSoftDelete` (remove, restore, listTrash, get, purgeExpired), `SoftDeleteError`, `DEFAULT_RETENTION_MS`, `IDENTIFIER` and the `SoftDeleteStore` interface.
- `memory-store.ts`: `MemorySoftDeleteStore`, a per-process reference store for tests and prototypes, with live-row unique checks.
- `http.ts`: `createTrashHandler`, a server-only Fetch `Request`/`Response` adapter that lists and restores trash entries.
- `schema.sql` and `sql-store.ts`: the PostgreSQL `soft_delete_batches` trash table, the commented column/index/view pattern for your own tables, and `createSqlSoftDeleteStore(executor, { batchTable? })` with `liveCondition(alias?)` and `liveViewSql(table)`, for any `query(text, params)` executor with `$1` placeholders and `transaction(work)`.

It works on your application's own tables. There is no hidden database, scheduler or user system.

## When to use it

Use it when users of a multi-tenant app delete projects, documents, contacts or similar records and should be able to undo that from a trash for a while, with dependents (tasks, comments, files rows) following the parent. Do not use it as account deletion or a legal erasure: purge removes database rows, not backups or copies elsewhere (see `account-deletion`).

## Integration points

| Point | What the application supplies |
| --- | --- |
| Table columns | `id`, `tenant_id`, `deleted_at bigint`, `deleted_by`, `delete_batch` on each soft-deletable table; partial unique indexes `WHERE deleted_at IS NULL` instead of unique constraints; plain (NO ACTION) foreign keys. |
| `entities` | `{ table: { unique?: [[column, ...]], children?: [{ entity, foreignKey }] } }`. Names are validated SQL identifiers. Self-references (folder trees) are allowed. |
| `SoftDeleteStore` | On PostgreSQL: apply `schema.sql` and call `createSqlSoftDeleteStore(db)`. Elsewhere: implement the interface with real transactions. |
| Default reads | Read from `liveViewSql(table)` views or add `liveCondition()` to every list, search, count and export query. A row-level security policy (see `schema.sql`) is the strongest option. |
| `authorize(actor, action, {tenantId, entity})` | Your membership check for `delete`, `restore`, `trash` (list) and `read`. Return `false` to deny. |
| `retentionMs` | How long entries stay restorable. Default 30 days. |
| Scheduler | Calls `purgeExpired()` from trusted server code (for example `durable-jobs`). |
| `authenticate(request)` | The signed-in user, for the trash API. |

```ts
import { createSoftDelete } from "./genlib/soft-delete/core.js";
import { createSqlSoftDeleteStore } from "./genlib/soft-delete/sql-store.js";
import { createTrashHandler } from "./genlib/soft-delete/http.js";

const softDelete = createSoftDelete({
  store: createSqlSoftDeleteStore(db), authorize, retentionMs: 30 * 86_400_000,
  entities: {
    projects: { unique: [["slug"]], children: [{ entity: "tasks", foreignKey: "project_id" }] },
    tasks: { children: [{ entity: "comments", foreignKey: "task_id" }] },
    comments: {},
  },
});
// In your own DELETE /projects/:id route:
await softDelete.remove(user, { tenantId, entity: "projects", id });
export const trashApi = createTrashHandler({ softDelete, prefix: "/api/trash", allowedOrigins: [APP_ORIGIN], authenticate });
// Nightly job:
await softDelete.purgeExpired();
```

## Behavior

- **Delete** marks the row only while it is live (`UPDATE ... WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`) with `deleted_at`, `deleted_by` and a new batch id in `delete_batch`, then marks live children through every declared relation, breadth first, with the same batch id, and writes one trash entry with `count` and `purgeAfter = deletedAt + retentionMs`. All in one transaction. A missing or other-tenant id is `not-found`; an already deleted row is `already-deleted`. Rows that were deleted earlier keep their own batch.
- **Hidden by default**: `get` returns only live rows. On PostgreSQL the live view or `liveCondition()` keeps deleted rows out of lists, search, counts and exports, and partial unique indexes let a new row reuse a deleted row's unique value.
- **Restore** takes a trash entry id. It is refused with `retention-expired` once `now >= purgeAfter`, with `parent-deleted` while the record's parent row is soft-deleted, and with `conflict` (carrying `conflicts: [{entity, id, columns}]`) when a live row of the tenant now holds a declared unique value of any row in the batch. A unique violation from an undeclared index is also reported as `conflict`. Nothing changes on refusal. Otherwise it claims the entry (deleting it, which serializes concurrent restores and the purge job) and clears the marks of exactly the batch's rows.
- **Trash** lists one tenant's entries newest first, keyset-paginated with an opaque cursor, optionally filtered by entity. `limit` is 1 to 100 (default 20).
- **Purge** finds entries with `purgeAfter <= now`, oldest first, and handles each in its own transaction: it claims the entry, deletes the record and its soft-deleted descendants deepest first (so plain foreign keys hold), then any remaining rows of the batch. An entry already restored or purged is skipped, so the job is idempotent and safe to rerun. An entry whose transaction fails (for example a live row added under the deleted parent holds the foreign key) is rolled back, stays in the trash and is returned in `failed` as `{id, tenantId, entity, code}` (SQLSTATE or error name, never row data); the job pages past it with a keyset cursor, so other entries and tenants are still purged. It is retried once per run, without backoff; alert on a non-empty `failed`.
- **Tenancy**: every statement filters by `tenant_id`; only the purge job's due-entry query spans tenants.

## HTTP routes

`createTrashHandler({ softDelete, prefix, authenticate, allowedOrigins })`:

| Route | Result |
| --- | --- |
| `GET {prefix}?tenantId=&entity=&cursor=&limit=` | `200 {entries, nextCursor}` |
| `POST {prefix}/{trashId}/restore?tenantId=` | `200 {entry, records}` |

| Code | Status |
| --- | --- |
| `forbidden` | 403 |
| `not-found` | 404 |
| `conflict` (body includes `conflicts`), `parent-deleted`, `already-deleted` | 409 |
| `retention-expired` | 410 |
| `invalid-*` | 400 |

Signed-out callers get 401. POST requests without an allowed `Origin` get 403. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/soft-delete.test.mjs tests/soft-delete-sql.test.mjs` covers:

- the delete marks, the trash entry and the kept row
- hidden-by-default reads, counts and search
- restore with children inside the window, refusal after it
- authorization for delete, restore and trash across roles and tenants
- the unique conflict on restore and success once it is resolved
- cascade by batch, children deleted earlier staying in the trash, `parent-deleted`, and self-referencing trees
- purge children first, waiting entries kept, a second run purging nothing, and a failing entry kept and reported while later entries are purged
- the trash API

`tests/soft-delete-sql.test.mjs` runs on PostgreSQL semantics through PGlite with real foreign keys, partial unique indexes and live views. It covers counts through the view, cascade by batch, a partial-unique-index conflict (declared and undeclared) with rollback, and purge idempotency, including a parent entry that expires before an older child entry and an entry blocked by a live child under the real foreign key.

In the receiving app, add an ordinary-member authorization test and check that every list, search and export query reads live rows only.

## If something fails

- Deleted rows show up in a list or export → that query reads the base table; use the live view or `liveCondition()`, or add the RLS policy.
- Creating a record fails with a duplicate key although the old one is deleted → the table still has a plain unique constraint; replace it with a partial unique index `WHERE deleted_at IS NULL`.
- Restore always returns `conflict` → a live row holds the value; rename or delete it, then restore.
- `purgeExpired()` returns an entry in `failed` with code `23503` → a live row references a soft-deleted parent (it was added after the delete); delete or move it, and the next run purges the entry.

## Limits

Only reads through the view, the condition or a policy hide deleted rows. Unique sets are per tenant. Cascade follows declared single-column relations only; join tables, polymorphic references, files in object storage, search indexes and caches need their own handling. Purge removes database rows, not backups. The SQL tests run on PGlite, a single connection. Production database correctness, retention and erasure duties, session security and consuming-application acceptance remain project responsibilities.
