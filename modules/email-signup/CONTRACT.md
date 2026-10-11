# User signup with email verification · 0.1.0

## What installs

Seven original Apache-2.0 files under `email-signup/`:

- `core.ts`: `createEmailSignup` (`signup`, `resend`, `resendForAccount`, `confirm`, `isVerified`, `requireVerified`), `SignupError`, the `EmailSignupStore` interface, and the helpers `normalizeEmail`, `assertVerified`, `hashToken` and `constantTimeEqual`.
- `password-policy.ts`: `createPasswordPolicy` and `defaultPasswordPolicy`, in the style of NIST SP 800-63B.
- `scrypt-hasher.ts`: `createScryptHasher` and `parseScryptHash`, the default password hasher on `node:crypto`.
- `memory-store.ts`: `MemoryEmailSignupStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createEmailSignupHandler` (a server-only Fetch `Request`/`Response` adapter) and `createVerifiedGate`.
- `schema.sql` and `sql-store.ts`: the `email_signup_accounts` and `email_verification_tokens` tables and `createSqlEmailSignupStore(executor, { accountsTable?, tokensTable? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database, email service or session system. The receiving application supplies those through the integration points.

## When to use it

Use it when an app lets people create an account with an email and a password and must confirm that they own the address before they use some features. Do not use it for password reset (see `password-reset`), magic-link sign-in or invitations (see `org-invitations`). These flows have different security properties.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlEmailSignupStore(db)`. Elsewhere (or against your existing users table), provide a unique index on the normalized email and single conditional statements for `createAccount`, `markVerified`, `reserveSend` and `consumeToken`, plus an atomic `issueToken` that inserts the new link and revokes the other pending links that are not newer. |
| `sendEmail({to, link, expiresAt, idempotencyKey, reason})` | Your email provider. Pass `idempotencyKey` through so retries never deliver two copies of one link. Resolve once the message is queued to keep timing uniform. |
| `baseUrl` | The absolute `https` URL of your confirmation page. The link is `${baseUrl}?token=...`; the page POSTs the token to `/confirm`. |
| `onExistingAccount({accountId, email, verified})` | Optional. Emails the owner that someone tried to sign up with their address. |
| `onVerified(accountId)` | Optional. Runs once, for the confirm that verified the account. |
| `passwordPolicy(password, {email})` | Optional. Returns a list of problems. Default `defaultPasswordPolicy`. Add a breached-password check for production. |
| `hasher` | Optional. `{hash, verify, needsRehash?}`. Default `createScryptHasher()`. |
| `resendCooldownMs`, `maxSendsPerWindow`, `sendWindowMs`, `ttlMs`, `sendAttempts` | Optional limits. Defaults: 60 s, 5 per hour, 24 h links, 3 attempts. |
| HTTP `rateLimit(key)`, `clientIp(request)` | Your limiter (see the `rate-limit` module) and the trusted client address. |
| Gate `accountId(request)` | The signed-in account id from your session, never from the request body. |

```ts
import { createEmailSignup } from "./genlib/email-signup/core.js";
import { createSqlEmailSignupStore } from "./genlib/email-signup/sql-store.js";
import { createEmailSignupHandler, createVerifiedGate } from "./genlib/email-signup/http.js";

const signup = createEmailSignup({
  store: createSqlEmailSignupStore(db),
  sendEmail: (message) => emailQueue.enqueue(message, { idempotencyKey: message.idempotencyKey }),
  onExistingAccount: (notice) => emailQueue.enqueueAccountExistsNotice(notice.email),
  baseUrl: "https://app.example.com/verify-email",
});
export const handler = createEmailSignupHandler({
  signup, prefix: "/api/signup", allowedOrigins: [APP_ORIGIN],
  rateLimit: (key) => limiter.allow(key), clientIp: (request) => request.headers.get("x-real-ip"),
  onResult: (route, result) => { if (result.serverError) log.info("signup", route, result.serverError); },
});
export const requireVerifiedEmail = createVerifiedGate({ signup, accountId: (request) => session.accountId(request) });
// In a gated route: const refused = await requireVerifiedEmail(request); if (refused) return refused;
```

## Behavior

- **Email.** `normalizeEmail` trims and lowercases the whole address and accepts only a WHATWG valid email with a dotted domain, a local part of at most 64 and a total of at most 254 characters. The normalized form is stored, compared, rate-limit keyed and emailed. Aliases (plus tags, Gmail dots) are not folded.
- **Unique accounts.** `createAccount` is one insert against the unique email index (`ON CONFLICT (email) DO NOTHING`). Concurrent signups with the same normalized email create exactly one account.
- **Password policy.** The default allows 15 to 128 Unicode code points (NIST SP 800-63B-4 asks for at least 15 for single-factor passwords and at least 64 allowed). It blocks a small list of common passwords, a single repeated character and passwords built on the email's local part. There are no composition rules. Inputs over 4,096 characters are refused before the policy runs.
- **Password storage.** The default hasher derives a 32-byte scrypt key with N = 2^17, r = 8, p = 1 and a 16-byte random salt, from the NFKC-normalized password. It stores `$scrypt$ln=17,r=8,p=1$<salt>$<key>` (unpadded base64). `verify` compares with `timingSafeEqual` and returns false for malformed strings or parameters outside safe bounds. `needsRehash` reports weaker or malformed hashes. Costs below N = 2^15 or r = 8 are refused.
- **Enumeration safety.** `signup` throws only for format and policy problems, which reveal nothing about other accounts. Otherwise it resolves to `{ ok: true }` whether the account was created or the email was already registered. In the registered case it creates nothing, keeps the existing password and calls `onExistingAccount`. If that hook throws, the failure is reported only as `serverError: "existing-account-notice-failed"`, so the public result matches a new account whose email failed. The password is hashed on both paths. A server-only `serverError` (`existing-account`, `existing-account-notice-failed`, `rate-limited`, `delivery-failed`) explains the outcome; the HTTP layer never returns it.
- **Tokens.** Each link carries 32 random bytes, base64url encoded (43 characters). Only the SHA-256 hash is stored. Links last 24 hours by default (15 minutes to 7 days) and work once. A link is bound to the account's email when it was sent and dies if the email changes.
- **Verified gate.** `confirm(token)` consumes the token with one conditional update, then marks the account verified with another (`WHERE verified_at IS NULL`). Exactly one of several concurrent confirms succeeds; `newlyVerified` is true only for the call that made the transition, and `onVerified` runs only then. Other pending links are revoked. `isVerified`, `requireVerified` (throws `unverified`), `assertVerified(account)` and `createVerifiedGate` (403 `email-unverified`, 401 signed out) refuse unverified accounts.
- **Resend limits.** Each verification email, including the signup email, reserves a slot with one conditional update: at least `resendCooldownMs` since the last send and at most `maxSendsPerWindow` sends per `sendWindowMs`. Concurrent resends cannot exceed the limits. Each new link revokes the account's earlier links in the same atomic `issueToken` call (one `WITH ... INSERT` plus `UPDATE` on SQL). It revokes the other pending links that already exist and are not newer (`created_at` at or before the new one), so the last-issued link always survives and interleaved concurrent resends never leave zero working links. On a multi-connection database two simultaneous issues may each miss the other's uncommitted row and both stay valid. `resend(email)` is enumeration-safe; `resendForAccount(accountId)` is for signed-in users and throws `rate-limited` with `retryAfterMs`. Verified accounts get no further links.
- **Delivery.** `sendEmail` is tried up to `sendAttempts` times (waits of 250 ms, then 1 s, 2 s, ...) with the same `idempotencyKey` (`email-verification:<token id>`). If every attempt fails, the link is revoked (a copy the provider sent anyway is inert) and the failure is reported as `delivery-failed` (`serverError`, or a thrown error from `resendForAccount`). The account can resend after the cooldown.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `POST {prefix}/signup` | `{email, password}` | `202 {ok: true}` for new and registered emails; `400 {error: "invalid-email"}` or `400 {error: "weak-password", problems}` |
| `POST {prefix}/resend` | `{email}` | `202 {ok: true}`, identical for every outcome |
| `POST {prefix}/confirm` | `{token}` | `200 {verified: true}`, or `400 {error: "invalid-token"}` |

Other responses:

- 403 for POSTs without an allowed `Origin`.
- 429 `rate-limited` when `rateLimit` refuses. Every route checks `ip:<address>`; `/signup` and `/resend` also check `email:<normalized email>`.
- 400 `bad-request` for a non-JSON content type or a body over `maxRequestBytes` (default 4,096), and 400 `invalid-json` for a malformed body.
- 405 for other methods, and 404 for other paths.

Every response carries `cache-control: no-store` and `referrer-policy: no-referrer`. Confirmation is a POST so link scanners that prefetch the emailed URL do not consume it. Set `Referrer-Policy: no-referrer` on your confirmation page and keep third-party scripts off it.

## Verify

`npm run build && node --test tests/email-signup.test.mjs tests/email-signup-sql.test.mjs` covers these cases:

- email validation and normalization, and case-insensitive account matching
- four concurrent signups with one account created (memory and PGlite, including the unique index and CHECK)
- the default and injected password policies
- scrypt PHC format, salting, verification, NFKC, bounded stored parameters and `needsRehash`, including one hash at the default cost
- hash-only token storage, expiry and single use
- the verified gate (core, `assertVerified`, HTTP 403/401) and four concurrent confirms with one winner (memory and PGlite)
- cooldown, window cap, concurrent resends, revocation of earlier links, and interleaved resends that keep at least one working link (memory and PGlite)
- idempotency keys, retries and failed delivery
- enumeration-safe signup and the owner notice, including identical 202 bodies when both `sendEmail` and `onExistingAccount` throw
- invalidation after an email change
- HTTP statuses and headers: 202, 200, 400, 403, 404, 405, 429, the bounded body, `no-store` and `no-referrer`

In the receiving app, run the same cases against your real store and session. Include two concurrent signups and two concurrent confirms against the database.

## If something fails

- **Two accounts for one address:** the store's email column lacks a unique index, or the app stores emails without `normalizeEmail`. Apply `schema.sql` or add the index on the normalized value.
- **Every link is invalid:** check that the confirmation page POSTs the exact `token` query value, and that the account email was not changed after the link was sent.
- **No email arrives:** read `serverError` through `onResult`. `delivery-failed` means every `sendEmail` attempt threw and the link was revoked; `rate-limited` means the cooldown or window cap applied.
- **scrypt errors about memory:** a custom `cost` or `blockSize` exceeds the server's memory; keep N = 2^15 to 2^17 with r = 8.

## Limits

This package does not send email, sign users in or manage sessions.

- **Timing.** Response bodies are identical, but a new account also inserts a token and sends the email. Queue the email if timing matters.
- **Pre-registration.** Someone can create an unverified account for another person's address first. The owner is told when they try to sign up, and recovers it through a password reset. Delete long-unverified accounts on a schedule.
- **Retries.** Retries happen in-process; durable retries across restarts need a queue such as `email-outbox`.
- **Blocklist.** The default blocklist is small and is not a breached-password check.
- **Testing scope.** PGlite runs as a single connection, so the concurrency tests check the conditional statements, not real multi-connection contention. Bun, Deno and Workers were not tested.

Rate-limit storage, production database correctness, email deliverability, hashing cost tuning and consuming-application acceptance remain project responsibilities.
