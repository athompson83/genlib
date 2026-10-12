Add two-factor authentication with an authenticator app (TOTP) to this app (teamnotes, TypeScript on Node 22, see README.md).

First add these two keys to the `config` object in `src/config.ts` exactly as written; tests may replace them, so read them from `config` each time you use them:

```ts
  // 32-byte keys (base64) protecting two-factor secrets and recovery codes.
  twoFactorEncryptionKey: process.env.TWO_FACTOR_ENCRYPTION_KEY ?? 'dGVhbW5vdGVzLXRlc3QtMmZhLWVuY3J5cHRpb24tayE=',
  recoveryCodePepper: process.env.RECOVERY_CODE_PEPPER ?? 'dGVhbW5vdGVzLXRlc3QtcmVjb3ZlcnktcGVwcGVyISE=',
```

Then create `src/security-log.ts` exactly as follows; tests replace `record`, so always call it through `securityLog.`:

```ts
export interface SecurityEvent { userId: string; type: string; ok: boolean }
export const securityLog = {
  record: async (event: SecurityEvent): Promise<void> => { console.log('security', event.userId, event.type, event.ok) },
}
```

Export these functions from `src/twofactor.ts` (sign-in, sessions, HTTP routes and QR rendering are out of scope; `userId` is a key of `db.users`):

- `beginEnrollment(userId)` resolves to `{ ok: true, secret: string, otpauthUri: string }` or `{ ok: false, error: 'already_enabled' | 'unknown_user' }`.
- `confirmEnrollment(userId, code)` resolves to `{ ok: true, recoveryCodes: string[] }` or `{ ok: false, error: 'invalid_code' | 'no_enrollment' }`.
- `isTwoFactorEnabled(userId)` resolves to a boolean.
- `verifyTwoFactor(userId, code)` (an authenticator code) and `verifyRecoveryCode(userId, code)` each resolve to `{ ok: true }` or `{ ok: false, error: 'invalid_code' | 'locked' | 'not_enabled' }`.
- `markReauthenticated(userId)` resolves once the app has recorded that the user just re-entered their credentials (`clock.now()`); the sign-in flow calls it.
- `disableTwoFactor(userId)` resolves to `{ ok: true }` or `{ ok: false, error: 'reauth_required' | 'not_enabled' }`.
- `regenerateRecoveryCodes(userId)` resolves to `{ ok: true, recoveryCodes: string[] }` or `{ ok: false, error: 'reauth_required' | 'not_enabled' }`.

Every check of a code (enrollment confirmation, authenticator code, recovery code) awaits `securityLog.record({ userId, type, ok })` before it resolves, with `ok` telling whether the code was accepted; choose your own `type` names.

Requirements:

- **Secret provisioning.** Enrollment generates a new secret of at least 160 bits from a CSPRNG, returned as base32 (RFC 4648 alphabet `A-Z2-7`, upper case, no padding), and `otpauthUri` = `otpauth://totp/Teamnotes:<the user's email>?secret=<secret>&issuer=Teamnotes` (label percent-encoded as needed; `algorithm=SHA1`, `digits=6` and `period=30` may be added). Enrolling again before confirming replaces the pending secret. Enrolling while two-factor is enabled is `already_enabled`.
- **Confirm enrollment.** Two-factor becomes enabled (and required) only after `confirmEnrollment` receives a valid code for the pending secret. Until then `isTwoFactorEnabled` is false and `verifyTwoFactor` is `not_enabled`. Confirmation returns the first set of recovery codes.
- **Code verification** follows RFC 6238: HMAC-SHA1, 6 digits, 30-second steps from the Unix epoch, using `clock.now()`. Accept the current step and one step either side, nothing further. A code that is not exactly 6 ASCII digits is `invalid_code`.
- **Replay protection.** Once a step is accepted for an account (including the step that confirmed enrollment), that step and every earlier step are refused for that account. A recovery code works once. When the same code is submitted several times concurrently, exactly one call succeeds.
- **Attempt limits.** Failed calls of `verifyTwoFactor` and `verifyRecoveryCode` share one per-account count. After 5 consecutive failures the account is locked for 15 minutes from the fifth failure: both functions return `locked` even for a correct code, without checking it and without extending the lock. A success resets the count, and so does the end of a lock. Concurrent wrong guesses cannot get more than 5 codes checked.
- **Secret protection.** The secret, pending or confirmed, is stored only encrypted with an authenticated cipher (for example AES-256-GCM from `node:crypto`) under `config.twoFactorEncryptionKey`: the database never contains the secret in base32, hex or base64, and verification does not work if that key is replaced. After enrollment no function returns the secret again.
- **Recovery codes.** Each set has exactly 10 distinct codes, each at least 10 characters with at least 50 bits from a CSPRNG. They are stored only as keyed hashes (for example HMAC-SHA-256 with `config.recoveryCodePepper`): never in plaintext and never as an unkeyed digest. Regenerating replaces every earlier code.
- **Step-up.** `disableTwoFactor` and `regenerateRecoveryCodes` require `markReauthenticated` within the previous 10 minutes; otherwise they are `reauth_required` and change nothing. Disabling deletes the secret and recovery codes; enrolling again starts with a new secret.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it). Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
