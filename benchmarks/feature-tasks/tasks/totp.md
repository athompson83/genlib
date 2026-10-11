Add TOTP two-factor authentication (authenticator apps) to this app (pyaccounts, Python standard library only, see README.md).

- `POST /2fa/enroll` (signed in): returns `200 { "secret", "otpauth_uri" }`. The secret is a new random base32 string (RFC 4648 alphabet, no padding) of at least 160 bits. The URI is `otpauth://totp/Teamnotes:<username>?secret=<secret>&issuer=Teamnotes`.
- `POST /2fa/confirm` with `{ "code" }` (signed in): enables two-factor when the code is valid for the enrolled secret (`200 { "enabled": true }`), otherwise 400. Until confirmed, login does not ask for a code.
- `POST /login` with `{ "username", "password", "code"? }`: when two-factor is enabled, a missing code is `401 { "error": "code_required" }` and a wrong one `401 { "error": "invalid_code" }`. Codes follow RFC 6238 (HMAC-SHA1, 6 digits, 30-second steps); accept the current step and one step either side. A code (time step) that already logged this user in cannot be used again. After 5 consecutive failed codes, login for that user is locked for 15 minutes: `429 { "error": "locked" }`, even with a correct code. A successful login resets the counter.
- `POST /2fa/disable` with `{ "password", "code" }` (signed in): disables two-factor when both are valid.

Use `clock.now()` for time. Persist new state in `accounts/db.py` so `reset_db()` clears it. Do not add dependencies. Keep existing behavior, add tests for the new behavior, and make `python3 -m unittest discover -s tests` pass.
