# Password reset by email link · 0.1.0

## What installs

Five original Apache-2.0 files under `password-reset/`:

- `core.ts`: `createPasswordReset` (`request`, `verify`, `complete`), `PasswordResetError`, the `PasswordResetStore` and `ResetUsers` interfaces, and the helpers `normalizeEmail`, `hashToken` and `constantTimeEqual`.
- `memory-store.ts`: `MemoryPasswordResetStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createPasswordResetHandler`, a server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: the `password_reset_tokens` table and `createSqlPasswordResetStore(executor, { table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database, email service, password hasher or session system. The receiving application supplies those through the integration points.

## When to use it

Use it for the "forgot password?" flow of an app that signs users in with an email and password: the user enters an email, receives a one-time link, and sets a new password on your form. Do not use it for magic-link sign-in, email verification or invitations (see `org-invitations`). These flows have different security properties.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlPasswordResetStore(db)`. Elsewhere, provide a table with a unique `token_hash` and a single conditional consume (`used_at IS NULL AND revoked_at IS NULL AND expires_at > now`). |
| `users.findByEmail(normalizedEmail)` | Your user lookup. It gets the email trimmed with its domain lowercased, and returns `{id, email}` or `null`. |
| `users.setPasswordHash(userId, hash)` | Writes the new hash to your user table. |
| `hashPassword(password)` | A maintained Argon2id, scrypt or bcrypt library. Never hand-roll it. |
| `passwordPolicy(password)` | Optional. Returns a list of problems, such as a minimum length or a breached-password check. |
| `sendEmail({to, link, expiresAt, ip?})` | Your email provider. To keep response timing uniform, resolve once the message is queued. |
| `revokeSessions(userId)` | Optional. Signs the user out everywhere after a reset. |
| `baseUrl` | The absolute `https` URL of your reset form. The link is `${baseUrl}?token=...`. |
| HTTP `rateLimit(key)`, `clientIp(request)` | Your limiter (see the `rate-limit` module) and the trusted client address. |

```ts
import { createPasswordReset } from "./genlib/password-reset/core.js";
import { createSqlPasswordResetStore } from "./genlib/password-reset/sql-store.js";
import { createPasswordResetHandler } from "./genlib/password-reset/http.js";

const reset = createPasswordReset({
  store: createSqlPasswordResetStore(db), users, hashPassword, passwordPolicy,
  sendEmail: (message) => emailQueue.enqueue(message), revokeSessions,
  baseUrl: "https://app.example.com/reset-password",
});
export const handler = createPasswordResetHandler({
  reset, prefix: "/api/password-reset", allowedOrigins: [APP_ORIGIN],
  rateLimit: (key) => limiter.allow(key), clientIp: (request) => request.headers.get("x-real-ip"),
  onRequestResult: (result) => { if (result.serverError) log.warn("password reset", result.serverError); },
});
```

## Behavior

- **Enumeration safety.** `request(email, {ip?})` always resolves to `{ ok: true }`. It generates and hashes a token whether or not the account exists. It stores the token and sends the email only for existing accounts. A malformed address or a failed send adds a server-only `serverError` (`invalid-email` or `delivery-failed`), which the HTTP layer never returns.
- **Tokens.** Each token is 32 random bytes, base64url encoded (43 characters). Only its SHA-256 hash is stored. Lookups go through the unique hash index and are confirmed with a constant-time comparison.
- **Lifetime and cap.** Links last 30 minutes by default (configurable from 5 minutes to 24 hours). At most `maxActivePerUser` links (default 3) stay valid per user. Older ones are revoked when a new one is issued.
- **Failed delivery.** If `sendEmail` throws, the new token is revoked, so a message the provider sent anyway carries a dead link.
- **Verify.** `verify(token)` returns `{ valid, expiresAt }` without consuming the token. Use it to decide whether to show the form.
- **Complete.** `complete(token, password)` works in this order:
  1. Checks that the token is usable.
  2. Runs the password policy. A rejected password leaves the link usable.
  3. Hashes the password.
  4. Consumes the token with one conditional update, so exactly one concurrent completion wins.
  5. Writes the hash.
  6. Revokes the user's other pending links and calls `revokeSessions`.
- **Errors.** Unknown, malformed, expired, used and revoked tokens all fail with the same `invalid-token` code and message.
- **Email binding.** A token is bound to the account's email at request time. If the account's email has changed, or the old address now belongs to someone else, the link is invalid and gets revoked.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `POST {prefix}/request` | `{email}` | `202 {ok: true}`, identical for every outcome |
| `GET {prefix}/verify?token=` | none | `200 {valid, expiresAt?}` |
| `POST {prefix}/complete` | `{token, password}` | `204`, or `400 {error: "invalid-token"}`, or `400 {error: "weak-password", problems}` |

Other responses:

- 403 for POSTs without an allowed `Origin`.
- 429 `rate-limited` when `rateLimit` refuses. `/request` checks `ip:<address>` and `email:<lowercased email>`, and `/complete` checks `ip:<address>`.
- 400 `bad-request` for a non-JSON content type or a body over `maxRequestBytes` (default 4,096).
- 400 `invalid-json` for a malformed body.
- 405 for other methods, and 404 for paths outside the prefix.

Every response carries `cache-control: no-store` and `referrer-policy: no-referrer`, because the token is in the link's query string. Also set `Referrer-Policy: no-referrer` on the page that renders your reset form, and keep the form free of third-party scripts.

## Verify

`npm run build && node --test tests/password-reset.test.mjs tests/password-reset-sql.test.mjs` covers these cases:

- identical request results for known and unknown accounts, with no email or token for unknown ones
- hash-only storage
- verify without consumption
- expiry, and indistinguishable failures for bad tokens
- single use, and four concurrent completes with one winner (memory and PGlite)
- weak passwords that do not consume the token
- revocation of other links and the `revokeSessions` call
- the `maxActivePerUser` cap
- invalidation after an email change
- revocation on failed delivery
- HTTP statuses and headers: 202, 200, 204, 400, 403, 405, 429, the bounded body, `no-store` and `no-referrer`

In the receiving app, run the same cases against your real store and user table. Include two concurrent completes against the database.

## If something fails

- **Every link is invalid:** check that `findByEmail` receives and compares the normalized email (domain lowercased), and that it returns the same `id` the token was issued for.
- **Two completes both succeed:** your `consume` is not one conditional statement. Use `UPDATE ... WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2 RETURNING`.
- **No email arrives:** read `serverError` through `onRequestResult`. A `delivery-failed` value means `sendEmail` threw and the token was revoked.

## Limits

This package does not send email, hash passwords, store users or end sessions.

- **Timing.** Response bodies are identical for every outcome, but latency still includes the insert and the email send for existing accounts. Queue the email if timing matters.
- **Email-change race.** The email binding is checked just before the consume, so a change in that instant goes undetected.
- **Failed hash write.** If `setPasswordHash` fails after the consume, the link is spent and the user must request a new one.
- **Testing scope.** PGlite runs as a single connection, so the concurrency tests check the conditional statement, not real multi-connection contention.

Rate-limit storage, production database correctness, email deliverability, hashing parameters and consuming-application acceptance remain project responsibilities.
