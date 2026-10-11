# Organization invitations · 0.2.0

## What installs

Three original Apache-2.0 TypeScript files under `org-invitations/`:

- `core.ts`: `createInvitations` (invite, inspect, accept, revoke, list pending), `InvitationError` and the `InvitationStore` interface.
- `memory-store.ts`: `MemoryInvitationStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createInvitationHandler`, a server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: the PostgreSQL table and `createSqlInvitationStore(executor, { table?, onAccepted? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database, email service or user system. The receiving application supplies those through four integration points.

## When to use it

Use it when users of a multi-tenant app (organizations, teams, workspaces) invite others by email with a role, and the invitee joins by opening a link. Do not use it for public sign-up links, referral codes or magic-link login: those have different security properties.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `InvitationStore` | On PostgreSQL: apply `schema.sql`, call `createSqlInvitationStore(db, { onAccepted })`, and insert the membership row in `onAccepted`, which runs inside the accepting transaction when the executor has `transaction`. Elsewhere: a table with a unique `token_hash` and an atomic conditional status update. |
| `authorize(actor, action, {tenantId, role})` | Your membership check for `invite`, `revoke` and `list`, including role ceilings (an admin cannot invite an owner). Return `false` to deny. |
| `authenticate(request)` | The signed-in user and their verified email, from your session or verified token. Never from the request body. |
| `sendInvitation(invitation, token)` | Your email provider. Build the link from a trusted base URL and put the token in the fragment (`/join#token=...`) so it stays out of server logs and Referer headers. |

```ts
import { createInvitations } from "./genlib/org-invitations/core.js";
import { createInvitationHandler } from "./genlib/org-invitations/http.js";

const invitations = createInvitations({ store, authorize, roles: ["member", "admin"] });
export const handler = createInvitationHandler({
  invitations, prefix: "/api/invitations", allowedOrigins: [APP_ORIGIN],
  authenticate, sendInvitation,
});
```

## Behavior

- Tokens are 32 random bytes (base64url, 43 characters). Only the SHA-256 hash is stored, and the token is returned once, to the caller that sends the email.
- `accept` requires a pending, unexpired invitation and, by default, a verified email equal to the invited one (the domain compares case-insensitively). Exactly one concurrent accept wins. Replays fail with `already-accepted`.
- Expiry is read-time: a pending invitation past `expiresAt` reads as `expired`. The default lifetime is 7 days, configurable from 5 minutes to 30 days.
- Re-inviting the same email in the same tenant revokes the earlier pending invitation, so only the newest link works.
- `revoke` authorizes against the invitation's own tenant, so ids from another tenant are refused.
- Pending invitations per tenant are capped (default 100).
- Failed email delivery revokes the new invitation and returns `502 delivery-failed`. The provider may already have sent the message, and revoking makes that link inert.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `POST {prefix}` | `{tenantId, email, role}` | `201 {invitation}` and sends the email |
| `GET {prefix}?tenantId=` | none | `200 {invitations}` (pending only) |
| `DELETE {prefix}/{id}` | none | `200 {invitation}` |
| `POST {prefix}/inspect` | `{token}` | `200 {invitation}` with tenant, email, role, status and expiry only; no sign-in needed |
| `POST {prefix}/accept` | `{token}` | `200 {invitation}` |

Error codes map to HTTP statuses:

| Code | Status |
| --- | --- |
| `forbidden`, `email-mismatch` | 403 |
| `not-found` | 404 |
| `expired`, `revoked` | 410 |
| `already-accepted`, `conflict` | 409 |
| `too-many-pending` | 429 |
| `invalid-*`, `bad-request` | 400 |
| `delivery-failed` | 502 |

Signed-out callers get 401 (except on `inspect`). State-changing requests without an allowed `Origin` get 403. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/org-invitations.test.mjs` covers these cases:

- single-use acceptance and replay
- concurrent accepts
- expiry, revocation, unknown and malformed tokens
- link rotation
- tenant and role boundaries
- forwarded links (email mismatch)
- the pending cap
- the HTTP adapter's status codes, origin check, minimal inspect response and failed-delivery revocation

`tests/org-invitations-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite. It covers the schema, core behaviors, four concurrent accepts with one winner, and a membership insert that shares the accepting transaction (a failing insert rolls the accept back).

In the receiving app, add the same cases against your real store, including two concurrent accepts against the database, and an authorization test for an ordinary member.

## If something fails

- Accept always returns `already-accepted` → your `transition` does not compare the current status; it must update only rows still `pending`.
- Accept succeeds twice under load → the update is not atomic; use one conditional `UPDATE ... RETURNING` (or a serializable transaction).
- Invitees get `email-mismatch` → pass the identity provider's verified email; set `requireEmailMatch: false` only when any signed-in account may join.

## Limits

This package does not create users, tenants or memberships, send email or rate-limit requests. Add rate limits to the invite and accept routes (see the `rate-limit` module). Production database correctness, session security, email deliverability and consuming-application acceptance remain project responsibilities.
