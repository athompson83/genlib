# Outgoing webhook delivery with retries and signatures · 0.1.0

## What installs

Seven original Apache-2.0 files under `webhook-delivery/`:

- `core.ts`: `createWebhookDelivery`, `WebhookDeliveryError`, `exponentialJitterBackoff`, and the `WebhookDeliveryStore`, `WebhookFetch` and `SecretBox` interfaces.
- `signing.ts`: `signWebhook`, `generateWebhookSecret` and `decodeWebhookSecret` (Standard Webhooks, Web Crypto).
- `ssrf.ts`: `checkWebhookUrl`, `guardWebhookUrl`, `isPublicIp` and `parseIp`.
- `memory-store.ts`: `MemoryWebhookStore`, for tests and prototypes.
- `sql-store.ts` and `schema.sql`: `createSqlWebhookStore(executor, {endpointsTable?, deliveriesTable?, attemptsTable?})` and the `webhook_endpoints`, `webhook_deliveries` and `webhook_attempts` tables.
- `http.ts`: `createWebhookEndpointsHandler`, a server-only Fetch adapter for endpoint management.

There is no hidden HTTP client, DNS resolver, scheduler or authorization system. The receiving application supplies them.

## When to use it

Use it when your server app notifies customer-registered URLs about events (`order.paid`, `invoice.created`) and a notification must survive crashes, slow receivers and retries. Each tenant manages their own endpoints. Receivers check the signature with any Standard Webhooks library, including Genlib's `webhook-verification` module. Do not use it to receive webhooks (see `webhook-verification`) or to send email (see `email-outbox`).

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlWebhookStore(db)`. Elsewhere, provide a unique `(endpoint_id, event_id)`, an atomic leased claim, and `renewLease`/`complete` that succeed only for the current lease owner. |
| `fetch(url, init, {addresses})` | `globalThis.fetch`, or a pinning fetch that connects only to `addresses`. The pinning version closes DNS rebinding (see Limits). |
| `resolveHost(hostname, {signal})` | All A/AAAA addresses, for example `(h) => lookup(h, {all: true}).then(r => r.map(a => a.address))` from `node:dns/promises`. |
| `authorize(actor, tenantId, action)` | Your membership and role check. It must return exactly `true`. Actions are `endpoint:create`, `endpoint:read`, `endpoint:update`, `endpoint:delete`, `endpoint:rotate-secret`, `delivery:read` and `delivery:replay`. |
| `secretBox` | Optional `{seal, open}` backed by your KMS, so stored secrets are encrypted. |
| `enqueue(..., {tx})` | An executor bound to the transaction that makes the business change. |
| HTTP `authenticate(request)`, `allowedOrigins` | The signed-in actor from your session layer, or null, and the exact origins allowed to mutate. |

```ts
import { lookup } from "node:dns/promises";
import { createWebhookDelivery } from "./genlib/webhook-delivery/core.js";
import { createSqlWebhookStore } from "./genlib/webhook-delivery/sql-store.js";
import { createWebhookEndpointsHandler } from "./genlib/webhook-delivery/http.js";

const webhooks = createWebhookDelivery({
  store: createSqlWebhookStore(pool),
  fetch: (url, init) => fetch(url, init),
  resolveHost: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
  authorize: (user, tenantId, action) => roles.can(user, tenantId, action),
});

// Inside the transaction that marks the order paid:
await db.transaction(async (tx) => {
  await tx.query("UPDATE orders SET status = 'paid' WHERE id = $1", [order.id]);
  await webhooks.enqueue({ tenantId: order.tenantId, eventId: `order.paid:${order.id}`, type: "order.paid", data: { id: order.id } }, { tx });
});

// Every few seconds from your scheduler:
await webhooks.runOnce({ workerId: `web-${process.pid}` });

export const handler = createWebhookEndpointsHandler({
  delivery: webhooks, prefix: "/api/webhooks", allowedOrigins: [APP_ORIGIN],
  authenticate: (request) => sessions.user(request),
});
```

## Behavior

- **Endpoints** are scoped to one tenant. Every store read and write includes `tenantId`, so another tenant's endpoint or delivery id returns `not-found`. Each operation calls `authorize` first and fails with `forbidden` unless it returns `true`.
- **Registration** (`createEndpoint`, or `updateEndpoint` with a new `url`) runs `guardWebhookUrl`. A refused URL fails with `invalid-url` and the reason in the message.
- **Secrets** are `whsec_` plus 32 random bytes in base64. `createEndpoint` and `rotateSecret` return the plaintext secret once. Endpoint views list only secret ids and lifetimes. `rotateSecret({graceMs})` adds a new secret and sets the current ones to expire after `graceMs` (default 24 hours). Until then, each request carries one `v1,` signature per active secret, at most 10. Updates use an optimistic `version`, so concurrent rotations fail with `conflict` instead of losing a secret.
- **Enqueue** builds the body once as `{"type", "timestamp", "data"}` (at most 256 KiB, `payload-too-large`). It writes one `pending` row per enabled endpoint of that tenant subscribed to the type, on your `tx`. It is idempotent on `(endpoint, eventId)`. The row id (`msg_…`) is the `webhook-id`, and it stays the same across retries and replay.
- **runOnce({workerId, limit = 10, concurrency = 5, leaseMs})** claims due rows: `pending` with `nextAttemptAt <= now`, or `delivering` with an expired lease. Each claim sets a lease and increments `attempts`. Each attempt:
  1. Renews the lease to `now + leaseMs`, but only if this worker still owns the row. If the claim lease lapsed and another worker reclaimed the row, the row is skipped (`lostLease`) and not sent twice.
  2. Creates its own `AbortSignal` (default `AbortSignal.timeout(timeoutMs)`, 10 s). The signal covers DNS, the request, the headers and the body read. The worker is released at the deadline even if fetch ignores the signal.
     The deadline also covers `secretBox.open` and signing.
  3. Re-runs the SSRF guard. A refused address is a `blocked` attempt and fetch is not called.
  4. Signs `${id}.${timestamp}.${body}`, then POSTs with `redirect: "manual"`.
  5. Classifies the result. 2xx is `succeeded`. 3xx (`redirect`), other statuses (`http-error`), network errors and timeouts are failures.
  6. Records the attempt: outcome, status, error, duration and the first 4 KiB of the response, after which the stream is cancelled.

  A failure reschedules the row after `min(maxMs, baseMs·2^(attempt-1)) × [0.5, 1)`, by default base 30 s and maximum 6 h, with an injectable `random`. A failure on attempt `maxAttempts` (default 10) makes the row `dead`. A reclaimed row whose attempts already exceed `maxAttempts` becomes `dead` without a send. Results are written only while the worker holds the lease (`lostLease` otherwise). `leaseMs` below `max(timeoutMs × ceil(limit / concurrency), timeoutMs + 1 s)` is a `RangeError`. The extra second covers the attempt-log and completion writes after an attempt. A disabled, deleted or other-tenant endpoint makes the row `dead`.
- **Replay** requeues a `dead` or `succeeded` delivery with `attempts = 0` and the same id. Other statuses fail with `not-replayable`.
- **SSRF guard** refuses:
  - schemes other than `https:` (`http:` only with `allowHttp`, for tests)
  - URL credentials
  - whitespace or control characters
  - `localhost`, `*.localhost`, `*.local`, `*.internal` and metadata names
  - hosts written as decimal, octal, hex, shortened or percent-encoded IPv4
  - any resolved or literal address outside public unicast: `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16` (cloud metadata), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.88.99/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4` and `240/4`, plus every IPv6 address outside `2000::/3`. That covers loopback, unspecified, IPv4-mapped and IPv4-compatible forms, NAT64, ULA `fc00::/7`, link-local, site-local and multicast. `2001::/23` (Teredo), `2001:db8::/32`, `3fff::/20` and `2002::/16` (6to4) are refused too.

  If any one resolved address is private, the whole URL is refused.

## HTTP routes

| Request | Result |
| --- | --- |
| `GET {prefix}/{tenant}/endpoints` | `200 {endpoints}` |
| `POST {prefix}/{tenant}/endpoints` `{url, description?, eventTypes?}` | `201 {endpoint, secret}` |
| `GET` / `PATCH` / `DELETE {prefix}/{tenant}/endpoints/{id}` | `200` endpoint, `200` endpoint, `204` |
| `POST {prefix}/{tenant}/endpoints/{id}/rotate-secret[?graceMs=]` | `200 {endpoint, secret}` |
| `GET {prefix}/{tenant}/deliveries[?status&endpointId&limit]` | `200 {deliveries}` (no bodies) |
| `GET {prefix}/{tenant}/deliveries/{id}[/attempts]` | `200` delivery or `{attempts}` |
| `POST {prefix}/{tenant}/deliveries/{id}/replay` | `200` delivery, or `409` |

Errors: `401` without a user, `403` for a refused `authorize` or a mutation without an allowed Origin, `404` for unknown or other-tenant ids, `400` for refused URLs and bad input, `409` for `conflict`, `not-replayable` or `limit-exceeded`, `413` for oversize bodies, and `405` for the wrong method. Every response carries `cache-control: no-store`.

## Verify

`npm run build && node --test tests/webhook-delivery.test.mjs tests/webhook-delivery-sql.test.mjs` covers these cases with a fake fetch, a fake resolver and a fake clock:

- signatures checked with `webhook-verification`'s `verifyStandardWebhook`
- rotation and the secret box
- backoff and dead after `maxAttempts`
- replay, the stable id and enqueue idempotency
- the attempt timeout and capped reads
- the SSRF ranges and URL forms, at registration and at send time
- manual redirects
- authorization and tenant isolation
- lease reclaim, crash loops, limit and concurrency
- the HTTP adapter

The SQL test runs on PGlite. It covers rollback and commit with the caller's transaction, restart durability, retries and replay, lease reclaim, four concurrent workers delivering 40 rows exactly once, and the rotation version check.

In the receiving app, run two workers against your real PostgreSQL, and send one delivery to a receiver you control.

## If something fails

- **Receivers reject signatures.** They must verify the exact raw body with the `whsec_` secret. During rotation they can accept either secret.
- **`invalid-url: private-address` for a public site.** One of its DNS answers is private (split-horizon DNS). Use a public hostname.
- **Rows stay `delivering`.** The worker crashed. The rows are reclaimed after `lease_expires_at`, so keep `runOnce` scheduled.
- **The same webhook arrives twice.** That is expected with at-least-once delivery. Receivers deduplicate on `webhook-id`.

## Limits

Delivery is at least once. With plain `fetch`, the hostname is resolved again after the guard's check, so a DNS-rebinding attacker could race it. Pass a fetch that connects only to `context.addresses` (for example an undici `Agent` whose `connect.lookup` returns those addresses) to close that gap. A runtime-wide HTTP proxy bypasses the address check.

Secrets are plaintext in the table without a `secretBox`. The per-tenant endpoint limit is not atomic. This module does not support wildcard event types, asymmetric `v1a` signatures, `Retry-After`, automatic disabling of failing endpoints, or pruning of old rows.

Production database correctness, secret custody and consuming-application acceptance remain project responsibilities.
