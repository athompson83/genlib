Add tenant invitations to this app (teamnotes, TypeScript on Node 22, see README.md).

- `POST /tenants/:tenantId/invitations` with `{ "email", "role" }` (`role` is `admin` or `member`): only that tenant's admins. Returns `201 { id, email, role, token, expiresAt }`. The token is the secret the invitee receives by email (sending email is out of scope); it is returned only in this response. Invitations expire 7 days after creation (use `clock.now()`).
- `GET /tenants/:tenantId/invitations`: admins list pending invitations as `{ id, email, role, expiresAt }`, never the token.
- `DELETE /tenants/:tenantId/invitations/:id`: admins revoke; `204`.
- `POST /invitations/accept` with `{ "token" }`: the signed-in user whose email matches the invitation (case-insensitive) joins the tenant with that role; returns `200 { tenantId, role }`. A token works once.

Errors: 400 invalid input, 401 not signed in, 403 not allowed (including an email mismatch), 404 unknown invitation or token, 410 expired, revoked or already used, 409 when the user is already a member.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it). Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
