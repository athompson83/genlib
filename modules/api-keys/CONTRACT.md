# API keys · 0.1.0

## What installs

Five original Apache-2.0 files under `api-keys/`:

- `core.ts`: `createApiKeys` (create, list, revoke, verify), `ApiKeyError`, `parseApiKey`, `randomBase62`, `timingSafeEqual`, `ALPHABET` and the `ApiKeyStore` interface.
- `memory-store.ts`: `MemoryApiKeyStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `authenticateRequest(keys, request, requiredScopes?, { realm? })`, a server-only Fetch helper for `Authorization: Bearer`.
- `schema.sql` and `sql-store.ts`: the PostgreSQL `api_keys` table and `createSqlApiKeyStore(executor, { table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden user system, secret store or audit log. The receiving application supplies those through the integration points below.

## When to use it

Use it when customers of a multi-tenant app call your API from their own servers, scripts or CI with a long-lived key limited to one workspace and a set of scopes. Do not use it for browser sessions, OAuth access tokens for third-party apps, or one-time links (password reset, invitations): those need sessions, an OAuth server or one-time tokens.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `pepper` | At least 32 random bytes (string or `Uint8Array`) from your secret store. Every stored hash is an HMAC under it. |
| `ApiKeyStore` | On PostgreSQL: apply `schema.sql` and call `createSqlApiKeyStore(db)`. Elsewhere: a unique `lookupId`, and `revoke` and `touchLastUsed` as single conditional writes. |
| `authorize(actor, action, {tenantId})` | Your membership check for `create`, `list` and `revoke`. Return `false` to deny. |
| `holderScopes(actor, tenantId)` | The scopes the member holds. A new key may only carry scopes from this list. |
| `appPrefix` | 2 to 16 lowercase letters or digits (default `sk`), so leaked keys are recognizable. |
| `acceptEnvironments` | Which of `live` and `test` this deployment accepts (default both). |
| `lastUsedIntervalMs` | Minimum time between last-used writes per key (default 60,000; 0 writes every time). |
| `onAudit(event)` | Optional. Receives `key.created`, `key.revoked`, `key.used` and `key.denied` events. |

```ts
import { createApiKeys } from "./genlib/api-keys/core.js";
import { createSqlApiKeyStore } from "./genlib/api-keys/sql-store.js";
import { authenticateRequest } from "./genlib/api-keys/http.js";

const keys = createApiKeys({
  store: createSqlApiKeyStore(db), authorize, holderScopes, pepper: secrets.API_KEY_PEPPER,
  appPrefix: "acme", acceptEnvironments: ["live"], onAudit: (event) => auditLog.insert(event),
});

// Signed-in settings page: show `key` once, then only `info.prefix`.
const { key, info } = await keys.create(user, { tenantId, name: "CI", scopes: ["invoices:read"] });

// Public API route.
export async function GET(request: Request) {
  const auth = await authenticateRequest(keys, request, ["invoices:read"]);
  if (!auth.ok) return auth.response;
  return Response.json(await invoices.list(auth.principal.tenantId));
}
```

## Behavior

- **Key format** is `<appPrefix>_<live|test>_<lookupId>_<secret>`. The lookup id is 12 base62 characters, unique per key and not secret. The secret is 43 base62 characters (log2(62) × 43 ≈ 256 bits). Both come from the platform CSPRNG by rejection sampling: bytes at or above 248 are discarded, so every character is equally likely. The first three parts form `prefix`, which is safe to show in lists, logs and audit events. A lookup-id collision retries up to 5 times, then fails with `exhausted`.
- **Show once, hash at rest.** `create` returns the plaintext `key` once with its `info`. The store keeps only `keyHash`, the hex HMAC-SHA-256 of the whole key under the pepper. `list` and `revoke` return `ApiKeyInfo`, which has neither the key nor the hash. A database leak without the pepper cannot be used to check guesses.
- **Verify** parses the key, finds the record by lookup id, computes the HMAC and compares digests in constant time. An unknown lookup id is compared against a dummy digest, so it costs the same HMAC work. Malformed, unknown and wrong-secret keys all fail with `invalid-key`. Then `revoked`, `expired`, `environment-not-allowed` and `insufficient-scope` (every required scope must be on the key). Error messages never include the presented key. Success returns `{tenantId, keyId, prefix, environment, scopes}`.
- **Revocation and expiry** are read from the store on every verify, with no cache, so they apply to the next request. Revoking twice returns the key unchanged.
- **Management** checks `authorize` against the key's own tenant. `create` refuses scopes the actor does not hold (`scope-exceeds-holder`). Scopes are 1 to 50 unique names matching `[a-z][a-z0-9_.:-]{0,63}`.
- **Last used** is written only when the stored time is older than `lastUsedIntervalMs`, through one conditional update, so busy keys cause at most one write per interval.
- **Audit** events carry the tenant, key id, prefix, actor and time, never the secret or hash. The row also records `createdBy`, `createdAt`, `revokedAt`, `revokedBy` and `lastUsedAt`. Audit and last-used failures are swallowed so authentication keeps working.

## HTTP helper

`authenticateRequest` reads `Authorization: Bearer <key>` (scheme case-insensitive, one token):

| Case | Result |
| --- | --- |
| valid key with the required scopes | `{ ok: true, principal }` |
| no header | `401`, `www-authenticate: Bearer realm="api"` |
| malformed header | `401`, `error="invalid_request"` |
| invalid, revoked, expired or wrong-environment key | `401`, `error="invalid_token"` |
| missing scope | `403`, `error="insufficient_scope", scope="..."` |

Error bodies are `{ "error": "<code>" }` with `cache-control: no-store`.

## Verify

`npm run build && node --test tests/api-keys.test.mjs tests/api-keys-sql.test.mjs` covers these cases:

- key format, entropy, uniqueness and rejection sampling with injected bytes
- the stored hash equals an independently computed HMAC, and no row, list, revoke, error or audit output contains the secret
- lookup by lookup id, one HMAC for known and unknown ids, and identical failures for wrong, unknown and malformed keys
- tenant and scope limits, revocation, expiry and environments
- authorization for create, list and revoke, and refusal of scopes the creator does not hold
- throttled last-used writes and the audit event sequence
- the Bearer helper's 401 and 403 responses

`tests/api-keys-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite: the row content, revoke on the next verify, `ON CONFLICT` lookup-id retry and throttled last-used writes, including three concurrent verifies.

In the receiving app, add an authorization test for an ordinary member and a check that the pepper is loaded from the secret store.

## If something fails

- Every key fails with `invalid-key` after a deploy → the pepper changed. Restore it; changing it invalidates all keys.
- Every create fails with `exhausted` → `insert` returns `false` for errors other than a lookup-id conflict.
- Last-used is written on every request → your `touchLastUsed` ignores `notAfter`; use one conditional `UPDATE ... WHERE last_used_at IS NULL OR last_used_at <= $3`.

## Limits

This package does not rate-limit, rotate peppers, expose management HTTP routes or support wildcard scopes. Database lookup timing for known and unknown lookup ids is not equalized. The SQL tests run on PGlite, a single connection. Production secret custody, session security and consuming-application acceptance remain project responsibilities.
