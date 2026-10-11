Add outgoing webhooks to this app (teamnotes, TypeScript on Node 22, see README.md).

First create `src/net.ts` exactly as follows; tests replace these two functions, so always call them through `net.`:

```ts
import { lookup } from 'node:dns/promises'
export const net = {
  resolveHost: async (hostname: string): Promise<string[]> => (await lookup(hostname, { all: true })).map(a => a.address),
  httpFetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
}
```

Endpoints:

- `POST /tenants/:tenantId/webhooks` with `{ "url": string, "events": ["note.created"] }` registers an endpoint. Only tenant admins manage webhooks (other members get 403). Respond `201 { id, url, events, secret }`; `secret` is `whsec_` followed by the base64 of 32 random bytes and is returned only here.
- `GET /tenants/:tenantId/webhooks` (admins) returns `200 [{ id, url, events }]` for that tenant, never secrets.
- Respond `400 { "error": "invalid_url" }` unless the URL uses https, has no username or password, and its host is not, and does not resolve (via `net.resolveHost`) to, a loopback, private, link-local, carrier-grade NAT, multicast, unspecified, broadcast or IPv6 unique-local address, in any notation.

Delivery:

- Creating a note queues one delivery to each of that tenant's endpoints subscribed to `note.created`.
- Export `deliverPending(): Promise<void>` from `src/webhooks.ts`. Each call attempts every queued delivery that is due (`clock.now()`); a new delivery is due at once.
- Send with `net.httpFetch(url, init)`: method POST, header `content-type: application/json`, body `{ "type": "note.created", "timestamp": <ISO 8601>, "data": <the note as returned by the API> }`, signed per Standard Webhooks: `webhook-id` (unique per delivery), `webhook-timestamp` (Unix seconds), `webhook-signature` = `v1,` + base64 HMAC-SHA256 of `${id}.${timestamp}.${body}` keyed with the base64-decoded part of the secret after `whsec_`.
- A 2xx response completes the delivery. A network error, a non-2xx response or a redirect (never follow redirects) is a failed attempt; retry 30 s, 60 s, 120 s and 240 s after each successive failure. After 5 failed attempts the delivery is dead and never attempted again. Every attempt of a delivery uses the same `webhook-id`.
- Check the endpoint's host again before every attempt; if it now resolves to a forbidden address, the attempt fails without sending.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it). Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
