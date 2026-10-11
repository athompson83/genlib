# Web Push notifications · 0.1.0

## What installs

Seven original Apache-2.0 files under `web-push/`. None of them depends on the `web-push` npm package or any other runtime package.

- `crypto.ts`: `encryptPushPayload`, which implements RFC 8291 message encryption over the RFC 8188 `aes128gcm` content coding. It also holds the VAPID (RFC 8292) functions `generateVapidKeys`, `importVapidSigningKey`, `createVapidJwt` and `vapidAuthorization`, plus `MAX_PAYLOAD_BYTES` (3,993) and the base64url helpers.
- `push.ts`: `createWebPush`, `WebPushError`, `DEFAULT_PUSH_SERVICE_HOSTS` and the `PushSubscriptionStore` interface.
- `memory-store.ts`: `MemoryPushSubscriptionStore`, a per-process store for tests and prototypes.
- `http.ts`: `createWebPushHandler`, a server-only Fetch `Request`/`Response` adapter for the browser's subscribe and unsubscribe calls.
- `sw-snippet.ts`: `serviceWorkerSnippet`, browser JavaScript as a string, for your service worker.
- `schema.sql` and `sql-store.ts`: the `push_subscriptions` table and `createSqlPushSubscriptionStore(executor, { table? })`. They work with any `query(text, params)` executor that uses `$1` placeholders.

## When to use it

Use it to send browser notifications from your server to signed-in users, for example "new reply", "build finished" or "your order shipped". It works on Chrome, Edge, Firefox and Safari 16.4+, and on iOS home-screen web apps. Do not use it for in-app notification lists (see `notification-inbox`), for email or SMS, or for native mobile push through APNs or FCM device tokens.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `vapid` | `{publicKey, privateKey, subject}`. Generate the keys once with `generateVapidKeys()` and keep the private key in your secret store. `subject` is `mailto:you@example.com` or an `https:` contact URL. Changing the keys invalidates every subscription. |
| `PushSubscriptionStore` | On PostgreSQL, apply `schema.sql` and call `createSqlPushSubscriptionStore(db)`. On other databases, use a table keyed by `endpoint` with an upsert, an owner-scoped delete that reports whether it removed a row, and an atomic `failure_count` increment. |
| `fetch` | The platform `fetch`, or a wrapper that adds a timeout or proxy. Tests pass a fake. |
| `authenticate(request)` | The signed-in user, from your session or verified token. Never from the request body. |
| Service worker | Put `serviceWorkerSnippet` in your `sw.js` (or write it to a static file at build time), then subscribe in the page. |

```ts
import { createWebPush } from "./genlib/web-push/push.js";
import { createWebPushHandler } from "./genlib/web-push/http.js";
import { createSqlPushSubscriptionStore } from "./genlib/web-push/sql-store.js";

const webPush = createWebPush({
  vapid: { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: "mailto:ops@example.com" },
  store: createSqlPushSubscriptionStore(db), fetch,
});
export const handler = createWebPushHandler({ webPush, prefix: "/api/push", allowedOrigins: [APP_ORIGIN], authenticate });

// In a server job:
const results = await webPush.send(userId, { title: "New reply", body: "Bob answered", url: "/threads/9" },
  { ttl: 3600, urgency: "normal", topic: "thread-9" });
```

```js
// In the page, after the user clicks "Turn on notifications":
const { publicKey } = await (await fetch("/api/push/vapid-public-key")).json();
const registration = await navigator.serviceWorker.register("/sw.js");
const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
await fetch("/api/push/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) });
```

## Behavior

- **Encryption** follows RFC 8291. Each message and subscription gets a fresh P-256 ECDH key pair and a random 16-byte salt. The library derives the key with HKDF-SHA-256 (`"WebPush: info" || 0x00 || ua_public || as_public`, salted with the auth secret), then the CEK (`"Content-Encoding: aes128gcm\0"`) and the nonce (`"Content-Encoding: nonce\0"`). It writes a single AES-128-GCM record with the `0x02` last-record delimiter. The body is `salt(16) || rs(4096) || idlen(65) || as_public || ciphertext`.
- **Payload limit:** 3,993 bytes of plaintext (UTF-8), so the body fits the 4,096 octets push services must accept. `send` refuses a larger payload before it makes any request. A string or bytes is sent as is; any other value is sent as JSON.
- **VAPID** uses an ES256 JWT with `aud` set to the endpoint's origin, `exp` set to now + 12 hours (60 seconds to 24 hours, configurable through `vapidTtlSeconds`) and `sub` set to the subject. The signature is in raw `r||s` form. It is sent as `Authorization: vapid t=<jwt>, k=<public key>`. Keys whose private scalar does not match the public key are refused.
- **Subscribe** accepts the browser's `PushSubscription` JSON. The endpoint must be `https`, must have no credentials or fragment, and must be on a known push service host: FCM, Mozilla autopush, `web.push.apple.com` / `*.push.apple.com` or `*.notify.windows.com`. Set `allowedHosts` or `allowAnyHttpsEndpoint` to change that. `p256dh` must be a valid P-256 point and `auth` 16 octets. Subscriptions are deduped on `endpoint`. Subscribing an existing endpoint moves it to the current user, keeps `createdAt`, replaces the keys and resets failures. Each user may hold 20 subscriptions by default.
- **Send** posts `TTL` (0 to 2,419,200 seconds), `Urgency` (`very-low`, `low`, `normal` or `high`; default `normal`), an optional `Topic` (1 to 32 base64url characters), `Content-Encoding: aes128gcm` and the VAPID authorization. Redirects are not followed. It returns one result per subscription: `{userId, endpoint, ok, outcome, status?, retryAfterSeconds?, removed}`.

| Push service answer | `outcome` | Store effect |
| --- | --- | --- |
| 201, 202 | `sent` | `last_success_at` = now, `failure_count` = 0 |
| 404, 410 | `gone` | subscription deleted (`removed: true` for the call that deleted it) |
| 413 | `too-large` | `failure_count` + 1 |
| 429 | `rate-limited`, with `retryAfterSeconds` from `Retry-After` (seconds or HTTP date) | `failure_count` + 1 |
| 400, 401, 403 | `vapid-error`: check the keys, subject and clock | `failure_count` + 1 |
| 5xx | `server-error` (with `retryAfterSeconds` when given) | `failure_count` + 1 |
| other status | `rejected` | `failure_count` + 1 |
| fetch threw | `network-error` | `failure_count` + 1 |

- `sendMany(userIds, payload, options)` dedupes user ids and delivers to every subscription with at most `concurrency` requests in flight (default 8).
- Invalid input throws `WebPushError` with one of these codes: `invalid-user`, `invalid-subscription`, `invalid-endpoint`, `endpoint-not-allowed`, `invalid-keys`, `invalid-ttl`, `invalid-urgency`, `invalid-topic`, `payload-too-large`, `invalid-vapid`, `invalid-concurrency` or `bad-request`.

### Service worker snippet

`serviceWorkerSnippet` is a self-contained IIFE. It reads `self`, `self.registration` and `self.clients`.

- **push:** it parses the payload as JSON `{title, body, url, tag, icon}` and falls back to treating the text as the body. Then it calls `showNotification`. The title is capped at 120 characters and the body at 500.
- **notificationclick:** it closes the notification. It then focuses an open window already at the target URL, or opens the target URL.
- **URLs:** `url` and `icon` resolve against the worker's origin and are kept only when they stay on that origin. Cross-origin, `javascript:`, `data:` and malformed URLs become `null`, so a click opens nothing. A missing `url` opens the site root.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}/vapid-public-key` | none | `200 {publicKey}`; no sign-in needed |
| `POST {prefix}/subscriptions` | `PushSubscription` JSON | `201 {subscription: {endpoint, createdAt}}` |
| `DELETE {prefix}/subscriptions` | `{endpoint}` | `200 {removed}`; removes only the caller's own subscription |

`POST` and `DELETE` need an allowed `Origin` (otherwise 403) and a signed-in user (otherwise 401). Bodies must be `application/json` and at most 8,192 characters. `endpoint-not-allowed` returns 422 and the other `WebPushError` codes return 400. Every response carries `cache-control: no-store`. Sending is not exposed over HTTP. Call `send` from server code.

## Verify

`npm run build && node --test tests/web-push.test.mjs tests/web-push-sql.test.mjs`

`tests/web-push.test.mjs` covers these cases:

- the RFC 8291 Section 5 / Appendix A example: exact header, ciphertext and body bytes, from the RFC's fixed salt and keys, with the private keys imported as JWK
- an encrypt-then-decrypt round trip through an independent test-side decryptor
- the 3,993-byte limit: the largest payload fills exactly 4,096 octets
- VAPID JWT structure, signature verification with Web Crypto (64-byte `r||s`) and the 24-hour cap
- topic, urgency and TTL validation
- every push service status above, with a fake fetch, including deletion on 404 and 410
- subscription validation, the host allow-list and dedupe
- `sendMany` concurrency
- the HTTP routes
- the service worker snippet, evaluated against a fake `self`: it opens same-origin URLs and refuses cross-origin ones

`tests/web-push-sql.test.mjs` runs the SQL store on PGlite. It covers upsert and dedupe (including concurrent subscribes of one endpoint), removal on a 410, an owner-scoped delete, one winner among concurrent removals and exact concurrent failure counts.

In the receiving app, subscribe from a real browser and send one message through each push service you support (Chrome/FCM, Firefox, Safari). Also check the permission prompt and the click target.

## If something fails

- Every send returns `vapid-error` (403). Check four things: the public key the page subscribed with is the same as `vapid.publicKey`, the subject is `mailto:` or `https:`, the server clock is right, and the keys were not rotated. Old subscriptions die when the keys change.
- The browser shows a generic notification, or none at all. Chrome shows a generic notification when the service worker's `push` handler does not call `showNotification`; make sure the snippet runs. Safari needs `userVisibleOnly: true`.
- `endpoint-not-allowed` for a real browser means its push service host is not in `DEFAULT_PUSH_SERVICE_HOSTS`. Add the host to `allowedHosts`.
- Subscriptions pile up. The service only removes them when a push service answers 404 or 410. Use `failure_count` and `last_success_at` to prune others on your own schedule.
- A decryption failure in the browser is invisible to the server. Check the test-side decryptor against your stored `p256dh` and `auth`. They must be the browser's base64url values, unchanged.

## Limits

This module writes the `aes128gcm` encoding only, not the legacy `aesgcm` one. It does not queue, retry, rate-limit, store notification preferences or track per-message delivery. Pair it with the `rate-limit`, `notification-preferences` and `notification-inbox` modules. It was not tested against live push services. Production key custody, database correctness, session security, browser permission UX and consuming-application acceptance remain project responsibilities.
