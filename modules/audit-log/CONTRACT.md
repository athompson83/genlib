# Audit log · 0.1.0

## What installs

Five original Apache-2.0 files under `audit-log/`:

- `core.ts`: `createAuditLog` (record, query, export, verifyChain, checkpoint, purgeExpired), `AuditLogError`, `redactDetails`, `canonicalJson`, `hashInput`, `csvCell`, `GENESIS_HASH`, `DEFAULT_REDACT_KEYS` and the `AuditStore` interface.
- `memory-store.ts`: `MemoryAuditStore`, a per-process reference store for tests and prototypes. It ignores `tx`.
- `schema.sql` and `sql-store.ts`: the PostgreSQL `audit_log` and `audit_log_heads` tables, owner-checked append-only triggers, the `audit_log_lock_head` function, the `audit_log_purge` retention function and `createSqlAuditStore(executor)`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).
- `http.ts`: `createAuditLogHandler`, a server-only, read-only Fetch `Request`/`Response` adapter for querying and exporting.

There is no hidden database, user system or scheduler. The receiving application supplies those through the integration points below.

## When to use it

Use it when a multi-tenant app must show tenant administrators who did what (sign-ins, permission changes, deletions, exports, settings changes) and must keep that record trustworthy: written with the change, not editable through the app, verifiable and kept for a declared period. Do not use it as an application log or metrics stream (see `structured-logger`), or as a change-data-capture history of every column.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `AuditStore` | On PostgreSQL: apply `schema.sql` as a dedicated owner role, grant the application role only `SELECT, INSERT` on `audit_log`, `SELECT` on `audit_log_heads` and `EXECUTE` on `audit_log_lock_head`, and call `createSqlAuditStore(db)`. Elsewhere: an append that writes through the caller's transaction and serializes per tenant, plus append-only enforcement. |
| `tx` in `record(tx, entry)` | The open transaction's query executor of the change being audited. `null` records on its own in a transaction from `db.transaction`. |
| `authorize(actor, action, {tenantId})` | Your membership check for `read` (query) and `export`. Return `true` only for administrators of that tenant. |
| `retentionMs` | Required. The declared retention period. |
| `purgeExpired()` | Call from a scheduled job (daily) with a role that may execute `audit_log_purge`. |
| `hmacKey` | Optional 32+ random bytes from your secret store, for HMAC-SHA-256 hashes. |
| `checkpoint(tenantId)` | Optional. Store the returned `{seq, hash}` outside the database (object storage with retention lock, a ticket, an email), refresh it after each purge, and pass it to `verifyChain` later. |
| `redactKeys`, `maskEmails`, `redactPatterns` | Optional. Emails are masked by default; `maskEmails: false` keeps them. Add keys and patterns for other personal data. |
| `authenticate(request)` | The signed-in user from your session or verified token, for the HTTP handler. |

```ts
import { createAuditLog } from "./genlib/audit-log/core.js";
import { createSqlAuditStore } from "./genlib/audit-log/sql-store.js";
import { createAuditLogHandler } from "./genlib/audit-log/http.js";

const audit = createAuditLog({ store: createSqlAuditStore(db), authorize, retentionMs: 365 * 86_400_000, hmacKey });

await db.transaction(async (tx) => {
  await tx.query("UPDATE members SET role = $1 WHERE id = $2", [role, memberId]);
  await audit.record(tx, {
    tenantId, actor: { id: user.id }, action: "member.role-change", target: { type: "member", id: memberId },
    outcome: "success", requestId, details: { from: oldRole, to: role },
  });
});

export const auditApi = createAuditLogHandler({ audit, prefix: "/api/audit", authenticate });
```

## Behavior

- **Entries** hold `id`, `tenantId`, `seq` (1, 2, 3 per tenant), `at` (epoch ms from `now`), `actorType` (`user`, `service`, `system` or `api-key`), `actorId`, `action` (lowercase dotted, 1 to 128 characters), `targetType`/`targetId`, `outcome` (`success`, `failure` or `denied`), `requestId`, `details`, `prevHash` and `hash`. Invalid input throws `AuditLogError`, which rolls the caller's transaction back.
- **Atomicity**: the SQL store locks the tenant's `audit_log_heads` row through `audit_log_lock_head` (SECURITY DEFINER, `SELECT ... FOR UPDATE`) on the caller's executor, builds the entry and inserts it, so the entry and the head advance commit or roll back with the change. Concurrent appends for one tenant wait on that lock.
- **Hash chain**: `hash` is SHA-256 (or HMAC-SHA-256 with `hmacKey`) over canonical JSON (sorted keys) of every field plus `prevHash`. The first entry's `prevHash` is 64 zeros. `verifyChain(tenantId, checkpoint?)` walks from the retention anchor to the head and returns `{ ok: true, count, head }` or `{ ok: false, reason, seq }` with `hash-mismatch` (edited), `sequence-gap` (deleted or tail removed), `broken-link` (reordered or inserted), `head-mismatch`, `checkpoint-mismatch`, `checkpoint-purged` (the checkpoint is older than the anchor, after a real or forged purge; never accepted) or `purged-rows-present` (rows left at or below the anchor, a faked purge). Actor and target ids must be well-formed UTF-16.
- **Append-only** on PostgreSQL: triggers refuse `UPDATE`, `DELETE` and `TRUNCATE` on `audit_log`; an insert must extend the head exactly; the head's seq and hash change only through the SECURITY DEFINER insert trigger, and its anchor and deletions only inside `audit_log_purge`. The triggers check that `current_user` is the table owner, which only the definer functions are; the `audit_log.purging` flag is required as well but is never sufficient, because any role can set it. Both definer functions are revoked from `PUBLIC`.
- **Redaction** runs before hashing, so secrets are never stored or hashed. Values of keys in `DEFAULT_REDACT_KEYS` (compared without case, `-`, `_`, `.` or spaces) and of keys containing `password`, `secret`, `token`, `apikey`, `privatekey`, `authorization`, `cookie` or `credential` become `[REDACTED]`. Inside strings, Luhn-valid card numbers become `[REDACTED card ending 4242]`, US SSNs (`ddd-dd-dddd`) become `[REDACTED ssn]`, bearer tokens and JWTs become `[REDACTED]`, and emails become `a***@example.com` unless `maskEmails` is `false`. Names, postal addresses and phone numbers in free text are not detected. Lone UTF-16 surrogates in keys and values become U+FFFD before hashing, so the hash matches what the database stores. Details are bounded (depth 8, 100 keys, 100 items, 2,048 characters per string); details whose canonical JSON exceeds `maxDetailsSize` (default 8,192) are replaced by `{"[truncated]": true, "size": n}`.
- **Query** (`query(actor, {tenantId, actorId?, action?, actionPrefix?, from?, to?, cursor?, limit?})`) checks `authorize(actor, "read")`, returns entries newest first by `seq` with an opaque keyset cursor, `limit` 1 to 200 (default 50). `from` is inclusive and `to` exclusive. Only the requested tenant's entries are read.
- **Export** (`export(actor, {tenantId, format: "csv" | "ndjson", pageSize?, ...filters})`) checks `authorize(actor, "export")` before returning an async generator of text chunks read in pages (default 500). CSV cells that start with `=`, `+`, `-`, `@`, tab or carriage return get a leading apostrophe; cells with commas, quotes or newlines are quoted.
- **Retention**: entries older than `retentionMs` are hidden from query and export at once. `purgeExpired(tenantId?)` deletes each tenant's contiguous oldest prefix older than the cutoff (via `audit_log_purge` on PostgreSQL) and stores the last purged entry's seq and hash as the anchor, so `verifyChain` still passes, and deleting the oldest remaining entry is still detected.

## HTTP routes

`createAuditLogHandler({ audit, prefix, authenticate })`:

| Route | Result |
| --- | --- |
| `GET {prefix}?tenantId=&actorId=&action=&actionPrefix=&from=&to=&cursor=&limit=` | `200 {entries, nextCursor}` |
| `GET {prefix}/export?format=csv\|ndjson&tenantId=&...` | `200` streamed attachment (`text/csv` or `application/x-ndjson`) |

`from`/`to` accept epoch milliseconds or an ISO 8601 date-time. Signed-out callers get 401, non-administrators 403, invalid parameters 400, other paths 404 and other methods 405 with `allow: GET`. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/audit-log.test.mjs tests/audit-log-sql.test.mjs` covers recording and validation, the hash formula, redaction before hashing, tamper detection, HMAC keys, tenant-admin authorization, filters and cursors, CSV injection escaping and paged NDJSON, retention hiding and purge with the anchor, concurrent records and the HTTP handler.

`tests/audit-log-sql.test.mjs` runs on PostgreSQL semantics through PGlite: the schema, commit and rollback together with a business row, the append-only triggers, NOLOGIN non-superuser roles (the application role cannot move the anchor or delete rows even after setting the purge flag; a retention role with `EXECUTE` purges), tampering by a database owner who disables the triggers (including a forged anchor), the retention purge function, surrogates in details and concurrent transactions.

In the receiving app, add an acceptance test that a real action (for example a role change) writes its entry, that an ordinary member gets 403 on the audit route, and that the application role cannot `UPDATE` or `DELETE` `audit_log`.

## If something fails

- `entry does not extend the chain` → the append ran outside a transaction or another writer bypassed the store; pass the transaction executor or `null` with an executor that has `transaction()`.
- `verifyChain` reports `hash-mismatch` after an upgrade → the hashed field set or the `hmacKey` changed; keep the key and verify old chains with the version that wrote them.
- The retention job fails with permission denied → grant `EXECUTE` on `audit_log_purge` to the job's role, and make sure the table owner owns the function.
- Recording fails with permission denied for `audit_log_lock_head` → grant `EXECUTE` on it to the application role.
- `verifyChain` reports `checkpoint-purged` after a legitimate purge → take a new checkpoint after each purge; an older one cannot be proven.
- Audit routes are slow on large tenants → keep the `(tenant_id, actor_id, seq)`, `(tenant_id, action, seq)` and `(tenant_id, at)` indexes, and filter by time.

## Limits

Hashes without `hmacKey` can be recomputed by someone with database write access; store checkpoints outside the database. Triggers do not stop the owner, a superuser or a role that can alter the table. Redaction is key- and pattern-based and does not find names or addresses in free text. Legal holds and per-tenant retention periods are not built in. The SQL tests run on PGlite, a single connection. Production role configuration, backup immutability, compliance mapping and consuming-application acceptance remain project responsibilities.
