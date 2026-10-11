# Short links · 0.1.0

## What installs

Five original Apache-2.0 files under `short-links/`:

- `core.ts`: `createShortLinks` (create, resolve, get, list, update, remove, stats), `ShortLinkError`, `randomCode`, `ALPHABET`, `RESERVED_SLUGS` and the `ShortLinkStore` interface.
- `memory-store.ts`: `MemoryShortLinkStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createRedirectHandler` (the public redirect route) and `createManagementHandler` (the signed-in API), both server-only Fetch `Request`/`Response` adapters.
- `schema.sql` and `sql-store.ts`: the PostgreSQL `short_links` table and `createSqlShortLinkStore(executor, { table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database, analytics service or user system. The receiving application supplies those through the integration points below.

## When to use it

Use it when users of a multi-tenant app create short or vanity links (`sho.rt/launch`) that redirect to an external page, with optional expiry, a click limit and click counts. Do not use it for invitation links, password resets or magic-link login: those carry secrets and need one-time hashed tokens (see `org-invitations`). Short codes are guessable by design.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `ShortLinkStore` | On PostgreSQL: apply `schema.sql` and call `createSqlShortLinkStore(db)`. Elsewhere: a table with a unique `code` and a `recordClick` that checks and increments in one conditional statement. |
| `authorize(actor, action, {tenantId})` | Your membership check for `create`, `manage` (update, remove) and `read` (get, list, stats). Return `false` to deny. |
| `blockHosts` | Hostnames destinations may not use, with their subdomains. Always include your short domain to prevent redirect loops. |
| `isSafeDestination(url)` | Optional async safe-browsing check from the trusted server. Return `false` to refuse. |
| `onClick(event)` | Optional. Receives `{linkId, at, referrerHost?, country?}` after each counted click. Store it in your analytics table. |
| `authenticate(request)` | The signed-in user from your session or verified token, for the management API. |
| `country(request)` | Optional, on the redirect handler: a two-letter country from trusted edge metadata (such as a CDN geolocation header you control). |

```ts
import { createShortLinks } from "./genlib/short-links/core.js";
import { createSqlShortLinkStore } from "./genlib/short-links/sql-store.js";
import { createManagementHandler, createRedirectHandler } from "./genlib/short-links/http.js";

const links = createShortLinks({
  store: createSqlShortLinkStore(db), authorize, blockHosts: ["sho.rt", "app.example.com"],
  onClick: (event) => analytics.insert(event),
});
export const redirect = createRedirectHandler(links);            // on https://sho.rt/{code}
export const api = createManagementHandler({
  links, prefix: "/api/links", allowedOrigins: [APP_ORIGIN], authenticate,
});
```

## Behavior

- **Destinations** go through the WHATWG URL parser and are stored as `URL.href`. Only `allowedSchemes` pass (default `https:` and `http:`). `javascript:`, `data:`, `file:`, `vbscript:` and `blob:` can never be configured. URLs with a username or password are refused, as are hosts in `blockHosts` and their subdomains, compared without case or a trailing dot. URLs longer than 2,048 characters are refused.
- **Random codes** are 7 characters by default (4 to 32) from a 57-character alphabet: base62 without `0 O l 1 I`. Each character comes from one random byte. Bytes at or above 228 (the largest multiple of 57 below 256) are discarded, so every character is equally likely. A collision on insert retries with a new code up to `maxAttempts` (default 5), then fails with `exhausted`. A generated code that matches a reserved word is skipped.
- **Custom slugs** are 3 to 64 characters of `[A-Za-z0-9_-]`. They may not be reserved words (`RESERVED_SLUGS`, such as `api`, `admin` and `login`, compared without case; configure `reservedSlugs`). They fail with `slug-taken` when the code exists. Codes are unique across all tenants, because the redirect route resolves a code without knowing the tenant.
- **Resolve** runs one store step, `recordClick`. It increments the counter only when the link is enabled, unexpired and below `maxClicks`, so concurrent resolves never exceed `maxClicks`. A miss is classified afterwards: unknown codes return 404, and disabled, expired or used-up links return 410. With `reportGone: false`, all misses return 404.
- **Click events** keep only the link id, the time, the referrer's host (never its path or query) and a two-letter country. The client IP is never read. `onClick` runs after the increment, and its errors are swallowed so a broken analytics sink cannot break redirects.
- **Update** changes `url`, `expiresAt` (a future time, or `null` to clear) and `disabled`. Any other key fails with `invalid-patch`. A new URL goes through the same checks as on create.
- **Authorization** for `get`, `update`, `remove` and `stats` is checked against the link's own tenant, so ids from another tenant are refused with `forbidden`.
- **List** returns links newest first, keyset-paginated with an opaque cursor. `limit` is 1 to 100 (default 20).

## HTTP routes

Redirect handler (`createRedirectHandler(links, { prefix?, country? })`):

| Route | Result |
| --- | --- |
| `GET {prefix}/{code}` | `302` with `location`, `cache-control: private, max-age=0` and `referrer-policy: no-referrer-when-downgrade` |
| unknown code | `404` |
| disabled, expired or used-up link | `410` (or `404` with `reportGone: false`) |
| other methods | `405` with `allow: GET`, not counted |

`private, max-age=0` keeps CDNs and shared caches from serving a redirect without counting it, and makes a disabled or edited link take effect at once. `no-referrer-when-downgrade` lets the destination see the short URL as the referrer, except on an https-to-http hop.

Management handler (`createManagementHandler({ links, prefix, authenticate, allowedOrigins, maxRequestBytes? })`):

| Route | Body | Result |
| --- | --- | --- |
| `POST {prefix}` | `{tenantId, url, slug?, expiresAt?, maxClicks?}` | `201 {link}` |
| `GET {prefix}?tenantId=&cursor=&limit=` | none | `200 {links, nextCursor}` |
| `GET {prefix}/{id}` | none | `200 {link}` |
| `GET {prefix}/{id}/stats` | none | `200 {stats: {clicks, lastClickAt}}` |
| `PATCH {prefix}/{id}` | `{url?, expiresAt?, disabled?}` | `200 {link}` |
| `DELETE {prefix}/{id}` | none | `200 {deleted: true}` |

Error codes map to HTTP statuses:

| Code | Status |
| --- | --- |
| `forbidden` | 403 |
| `not-found` | 404 |
| `slug-taken`, `reserved-slug` | 409 |
| `too-large` | 413 |
| `exhausted` | 503 |
| `invalid-*`, `scheme-not-allowed`, `credentials-not-allowed`, `blocked-host`, `unsafe-destination`, `bad-request` | 400 |

Signed-out callers get 401. State-changing requests without an allowed `Origin` get 403. Bodies must be `application/json` and at most 8,192 bytes by default. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/short-links.test.mjs tests/short-links-sql.test.mjs` covers these cases:

- URL validation: bad schemes, credentials, blocked hosts, the own-domain loop and the safe-destination hook
- the alphabet and code length, and rejection sampling checked deterministically with injected bytes
- collision retry and exhaustion
- slug rules and reserved words
- expiry, disable and max clicks, including 20 concurrent resolves with `maxClicks: 5` on the memory store
- tenant isolation and authorization
- redirect headers and the management routes

`tests/short-links-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite. It covers the schema, the core behaviors, `ON CONFLICT` collision retry and 20 concurrent resolves with `maxClicks: 5` giving exactly 5 redirects.

In the receiving app, add the same concurrency case against your real database and an authorization test for an ordinary member.

## If something fails

- Clicks exceed `maxClicks` under load → your `recordClick` reads and then writes. Use one conditional `UPDATE ... SET clicks = clicks + 1 WHERE ... AND (max_clicks IS NULL OR clicks < max_clicks) RETURNING url`.
- Every create fails with `exhausted` → `insert` returns `false` for errors other than a code conflict, or the code space is too small; check the store and raise `codeLength`.
- A link redirects to itself → add the short domain (and any alias) to `blockHosts`.
- Redirects are served without being counted → a proxy is caching the 302; keep `cache-control: private, max-age=0` and do not override it at the CDN.

## Limits

This package does not rate-limit, detect phishing on its own, resolve DNS, follow the destination's redirects, filter bots or store click events. Add rate limits to the create and redirect routes (see the `rate-limit` module). The SQL concurrency test runs on PGlite, a single connection. Production database correctness, session security, abuse handling and consuming-application acceptance remain project responsibilities.
