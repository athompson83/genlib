# Two-factor authentication with an authenticator app (TOTP) · 0.1.0

## What installs

Five original Apache-2.0 files under `two-factor/`:

- `core.ts`: `createTwoFactor` (`beginEnrollment`, `confirmEnrollment`, `verify`, `verifyRecoveryCode`, `isEnabled`, `status`, `regenerateRecoveryCodes`, `disable`, `reencryptSecret`), `TwoFactorError`, the `TwoFactorStore` interface, and the helpers `totpCode`, `base32Encode`, `base32Decode`, `buildOtpauthUri`, `hashRecoveryCode`, `normalizeRecoveryCode` and `constantTimeEqual`.
- `memory-store.ts`: `MemoryTwoFactorStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createTwoFactorHandler`, a server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: the `two_factor_enrollments`, `two_factor_recovery_codes` and `two_factor_attempts` tables and `createSqlTwoFactorStore(executor, { prefix? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

Everything uses Web Crypto. There is no hidden database, key store, session system or QR renderer.

## When to use it

Use it to add a second sign-in factor from an authenticator app (Google Authenticator, 1Password, Authy, Microsoft Authenticator and others) to an app with its own password sign-in. Do not use it for SMS or email codes, passkeys/WebAuthn, or as a replacement for a hosted identity provider that already offers MFA.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlTwoFactorStore(db)`. Elsewhere, implement `TwoFactorStore` with one conditional statement each for `activate`, `advanceStep`, `consumeRecoveryCode` and `registerAttempt`. |
| `encryption` | `{ currentKeyId, keys: { [id]: 32-byte Uint8Array or AES-GCM CryptoKey } }` from your secret manager. |
| `recoveryPepper` | At least 32 random bytes (or an HMAC CryptoKey), stored outside the database. |
| `issuer` | Your product name, shown in the authenticator app. No colon. |
| `authenticatedAt` | When the user last proved their password. `disable` and `regenerateRecoveryCodes` need it. |
| HTTP `authenticate(request)` | `{ userId, stage, accountName?, authenticatedAt? }` from your session. `stage` is `"signed-in"` or `"second-factor-pending"`. |
| HTTP `onVerified(event, request)` | Upgrades the second-factor-pending session. Return headers such as `set-cookie`. |
| HTTP `rateLimit(key)`, `clientIp(request)` | Your limiter (see the `rate-limit` module) and the trusted client address. |
| QR code | Render `otpauthUri` with the `qr-code` module or any QR library. Never send it to a third-party QR service. |

```ts
import { createTwoFactor } from "./genlib/two-factor/core.js";
import { createSqlTwoFactorStore } from "./genlib/two-factor/sql-store.js";
import { createTwoFactorHandler } from "./genlib/two-factor/http.js";

const twoFactor = createTwoFactor({
  store: createSqlTwoFactorStore(db), issuer: "Example",
  encryption: { currentKeyId: "2026-10", keys: { "2026-10": secrets.totpKey } },
  recoveryPepper: secrets.recoveryPepper,
});
export const handler = createTwoFactorHandler({
  twoFactor, prefix: "/api/2fa", allowedOrigins: [APP_ORIGIN],
  authenticate: (request) => sessions.twoFactorView(request), // { userId, stage, accountName, authenticatedAt }
  rateLimit: (key) => limiter.allow(key), clientIp: (request) => request.headers.get("x-real-ip"),
  onVerified: ({ userId }, request) => sessions.completeSecondFactor(request, userId), // returns { "set-cookie": ... }
});
// After a correct password: if (await twoFactor.isEnabled(user.id)) start a second-factor-pending session.
```

## Behavior

- **Provisioning.** `beginEnrollment(userId, {accountName})` creates a secret of 20 random bytes (160 bits; configurable to 64) and returns it in base32 with `otpauth://totp/Issuer:account?secret=…&issuer=…&algorithm=SHA1&digits=6&period=30`, where the issuer and label are percent-encoded. This is the only time the secret leaves the server. An `accountName` that is empty, over 200 characters or contains `:` fails with `bad-request` (HTTP 400). The HTTP adapter defaults the label to the user id with `:` replaced by `-`. Calling it again while pending replaces the pending secret. Once 2FA is active it is refused with `already-enabled`.
- **Confirmation.** `confirmEnrollment(userId, code)` enables 2FA only for a valid code for the current pending secret. The pending secret expires after 15 minutes (1 to 60 configurable). The code's time step is recorded, so it cannot then be replayed at sign-in. It returns 10 recovery codes, shown once.
- **Verification.** Codes follow RFC 6238 (HMAC-SHA-1, 6 digits, 30 seconds). The window is the current step and one step either side. All three candidates are computed and compared in constant time. Spaces are ignored; anything other than six ASCII digits fails.
- **Replay protection.** The highest accepted step is stored. A code for that step or an earlier one is refused. The store advances it with one conditional update, so exactly one of several concurrent verifies of a code wins.
- **Attempt limits.** Every confirm, verify and recovery-code attempt is counted before it is checked, in a fixed per-account window (5 per 15 minutes by default), so concurrent guesses cannot exceed the limit. Over the limit, even a correct code gets `rate-limited` with `retryAfterMs`. A success clears the count.
- **Secrets at rest.** Secrets are encrypted with AES-256-GCM, a random 12-byte IV and additional data bound to the user id, and stored with their key id. Old key ids keep decrypting. `reencryptSecret(userId)` moves a row to the current key. A missing key or tampered row fails with `secret-unreadable`. `status` never includes the secret.
- **Recovery codes.** Each code has 50 random bits, written as `XXXXX-XXXXX` in base32. Only `HMAC-SHA-256(pepper, normalized code)` is stored. A code works once, even under concurrency. Input is case-, space- and dash-insensitive. `regenerateRecoveryCodes` replaces every code.
- **Step-up.** `disable` and `regenerateRecoveryCodes` require `authenticatedAt` within the last 10 minutes (1 to 60 configurable), and not in the future. Otherwise they throw `reauthentication-required` and change nothing. `disable` deletes the secret and recovery codes.

## HTTP routes

| Route | Stage | Body | Result |
| --- | --- | --- | --- |
| `GET {prefix}/status` | signed-in | none | `200 {enabled, pending, recoveryCodesRemaining}` |
| `POST {prefix}/enroll` | signed-in | `{}` | `200 {secret, otpauthUri, expiresAt}` |
| `POST {prefix}/enroll/confirm` | signed-in | `{code}` | `200 {recoveryCodes}` |
| `POST {prefix}/verify` | either | `{code}` | `200 {ok: true}` plus `onVerified` headers |
| `POST {prefix}/recovery` | either | `{code}` | `200 {ok: true, remaining}` plus `onVerified` headers |
| `POST {prefix}/recovery-codes/regenerate` | signed-in | `{}` | `200 {recoveryCodes}` |
| `POST {prefix}/disable` | signed-in | `{}` | `204` |

Errors:

- 400 `invalid-code`, `bad-request` (non-JSON type, body over `maxRequestBytes`, default 4,096) or `invalid-json`.
- 401 when `authenticate` returns null.
- 403 for POSTs without an allowed `Origin`, `second-factor-required` when a second-factor-pending session calls a settings route, and `reauthentication-required`.
- 409 `not-enabled`, `already-enabled` or `no-pending-enrollment`.
- 429 from the `rateLimit` hook (keys `ip:<address>` and `user:<id>`) or the attempt limit, with `retry-after`.
- 500 `server-error` for an unreadable secret (details stay server-side).
- 405 for other methods, and 404 for unknown paths.

Every response carries `cache-control: no-store` and `referrer-policy: no-referrer`.

## Verify

`npm run build && node --test tests/two-factor.test.mjs tests/two-factor-sql.test.mjs` covers:

- RFC 6238 Appendix B vectors and RFC 4648 base32
- 160-bit secrets and the encoded otpauth URI
- confirm-before-enable, pending expiry and replacement
- the ±1 step window and malformed codes
- step replay, including the confirming step, and four concurrent verifies with one winner (memory and PGlite)
- the shared, concurrency-safe attempt limit and its reset
- ciphertext-only storage, user-bound AAD, key rotation and `reencryptSecret`
- HMAC-only recovery codes, single use under concurrency and regeneration
- step-up refusals
- HTTP routes, stage checks, origin, auth, rate-limit hook, lockout `retry-after`, bounded body and `no-store`

In the receiving app, run the same cases against your real store, plus two concurrent verifies of one code against the database, and test sign-in end to end with a real authenticator app.

## If something fails

- **Every code is rejected:** check the server clock (NTP). The window only tolerates 30 seconds of drift either way. Then check that the app scanned the latest QR code; a restarted enrollment replaces the secret.
- **`secret-unreadable` after a deploy:** the key id stored on the row is missing from `encryption.keys`. Restore the old key, then run `reencryptSecret` for every user before removing it.
- **Two verifies of one code both succeed:** your `advanceStep` is not one conditional statement. Use `UPDATE … WHERE user_id = $1 AND status = 'active' AND (last_used_step IS NULL OR last_used_step < $2) RETURNING`.
- **Users locked out:** the per-account limit counts every attempt. Tune `maxAttempts` and `attemptWindowMs`, and put IP limits in the `rateLimit` hook.

## Limits

This package does not render QR codes, verify passwords, store users or manage sessions.

- **Factors.** TOTP only: no SMS, email codes, WebAuthn or passkeys.
- **Lockout abuse.** Someone who knows the password can lock the real user out for one window. That is the trade-off of a per-account limit.
- **Lost keys.** Losing the encryption key makes every secret unreadable. Users then need recovery codes and must re-enroll.
- **Core callers.** The session-stage check lives in the HTTP adapter. If you call `regenerateRecoveryCodes` or `disable` directly, call them only from fully signed-in sessions.
- **Testing scope.** PGlite runs as a single connection, so the concurrency tests check the conditional statements, not real multi-connection contention.

Production database correctness, key management, session handling and consuming-application acceptance remain project responsibilities.
