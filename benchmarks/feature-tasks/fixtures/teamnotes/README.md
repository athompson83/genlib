# teamnotes

A small multi-tenant notes API. Node 22 runs the TypeScript sources directly (type stripping); there is no build step and no runtime dependency.

- `src/server.ts` exports `handle(request: Request): Promise<Response>`, the whole HTTP API.
- `src/auth.ts` resolves the signed-in user from `Authorization: Bearer session:<userId>` (stand-in for real sessions) and checks memberships.
- `src/db.ts` is the in-memory database (`db`) with `resetDb()` for tests.
- `src/clock.ts` exports `clock.now()` (milliseconds); tests replace it to control time.
- `src/config.ts` holds configuration.

Run `npm test`. Routes today:

| Method | Path | Who | Result |
| --- | --- | --- | --- |
| GET | /tenants/:tenantId/notes | member | `200 [{ id, title, body, authorId, createdAt }]` |
| POST | /tenants/:tenantId/notes | member | `201 { id, ... }` from `{ title, body }` |

Errors are JSON `{ "error": "<code>" }` with 400 (bad input), 401 (not signed in), 403 (not allowed), 404 (unknown).

Node runs TypeScript in strip-only mode: no enums, namespaces or constructor parameter properties.
