Add user signup with email verification to this app (teamnotes, TypeScript on Node 22, see README.md).

First create `src/mailer.ts` exactly as follows; tests replace `send`, so always call it through `mailer.`:

```ts
export interface Mail { to: string; subject: string; text: string; idempotencyKey: string }
export const mailer = {
  send: async (message: Mail): Promise<void> => { console.log('mail', message.to, message.subject) },
}
```

Then export these functions from `src/signup.ts` (the HTTP routes and sign-in sessions are out of scope):

- `signup(email: string, password: string)` resolves to `{ ok: true, userId: string, emailSent: boolean }` or `{ ok: false, error: 'invalid_email' | 'weak_password' | 'email_taken' }`. A new account is added to `db.users` as `{ id, email, name }` with the normalized address and the part before `@` as its name, and starts unverified.
- `confirmEmail(token: string)` resolves to `{ ok: true, userId: string }` or `{ ok: false, error: 'invalid_token' }`.
- `resendVerification(email: string)` resolves to `{ ok: true, emailSent: boolean }` or `{ ok: false, error: 'invalid_email' | 'rate_limited' }`. For an address with no account, or an account that is already verified, it resolves to `{ ok: true, emailSent: false }` and sends nothing.
- `checkPassword(email: string, password: string)` resolves to `true` only when the address belongs to an account created by `signup` and the password is that account's password.
- `canUseGatedFeature(userId: string)` resolves to `true` for verified accounts and `false` for unverified or unknown ones. The users already in the seed data count as verified.

Requirements:

- **Email addresses** are validated and normalized before they are stored, compared or used. Normalize by trimming surrounding whitespace and lowercasing the whole address. A valid normalized address is at most 254 characters with exactly one `@`; the local part is 1 to 64 characters of ASCII letters, digits and ``.!#$%&'*+/=?^_`{|}~-``, does not start or end with `.` and has no `..`; the domain is two or more dot-separated labels of 1 to 63 ASCII letters, digits or hyphens, none starting or ending with a hyphen. Anything else is `invalid_email`.
- **One account per address.** Signups whose addresses normalize to the same value create exactly one account, including when they run concurrently; the others get `email_taken`. An address already used by an existing user is taken.
- **Password policy** follows NIST SP 800-63B: at least 8 characters counted as Unicode code points, passwords of up to at least 64 characters accepted, no composition rules (no required digits, symbols or mixed case), and a blocklist of common passwords checked case-insensitively that includes at least `password`, `password1`, `passw0rd`, `12345678`, `123456789`, `1234567890`, `11111111`, `qwerty123`, `qwertyuiop`, `iloveyou`, `abc12345` and `letmein1`. Failing the policy is `weak_password` and creates nothing.
- **Password storage.** Store the password only as a slow, salted hash: scrypt from `node:crypto` with a cost of at least N = 2^15, r = 8, p = 1 and a random salt of at least 16 bytes (or Argon2id or bcrypt at an equivalent cost, if you can do so without a runtime dependency). Acceptance: the database never contains the password or a fast unsalted digest of it, two accounts with the same password store different values, and checking a password takes a slow-hash amount of time (at least 15 ms).
- **Verification link.** Signup sends one verification email `to` the normalized address whose `text` contains `https://teamnotes.test/verify?token=<token>`. The token is random (at least 128 bits from a CSPRNG), written with the characters `A-Z a-z 0-9 _ -`, at least 22 characters long, valid for 24 hours (`clock.now()`), and works once. The database stores only a hash of it, never the token itself.
- **Delivery.** Send through `mailer.send`. If a send throws, retry it before `signup`/`resendVerification` returns, up to 3 attempts in total (any pause between attempts must keep the total under 200 ms). Every attempt for the same message carries the same non-empty `idempotencyKey`; different messages (each new link, each welcome email) carry different keys. `emailSent` reports whether an attempt succeeded. If all 3 attempts fail, the account still exists but that link must not work.
- **Verified gate.** An account cannot use gated features until a valid link is confirmed. Confirming marks the account verified exactly once and then sends exactly one email with the subject `Welcome to teamnotes`, even when the same link is confirmed several times concurrently; only one of those calls gets `ok: true`.
- **Resend limits.** At most one verification email per address every 60 seconds and at most 5 in any rolling hour, counting the signup email. A refused resend is `rate_limited`, sends nothing and leaves the current link working; concurrent resends cannot exceed the limits. A successful resend sends a new link and invalidates every earlier link for that account.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it). Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
