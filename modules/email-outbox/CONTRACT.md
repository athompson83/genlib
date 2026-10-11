# email-outbox contract

## What installs

- `email-outbox/core.ts`: `createEmailOutbox`, `EmailOutboxError`, `fullJitterBackoff`, `isValidAddress`, `normalizeAddress` and the store and transport interfaces.
- `email-outbox/memory-store.ts`: `MemoryEmailOutboxStore` for tests and prototypes.
- `email-outbox/transports.ts`: `createResendTransport`, `createPostmarkTransport`, `createConsoleTransport` and `classifyStatus`.
- `email-outbox/http.ts`: `createEmailEventsHandler`, a Fetch webhook adapter for delivery events.
- `email-outbox/sql-store.ts` and `email-outbox/schema.sql`: the PostgreSQL store and its tables (`email_outbox`, `email_suppressions`).

## When to use it

Use it when a server app sends transactional email (receipts, sign-in links, password resets, notifications) and a message must not be lost or sent twice because of a crash, timeout or retry. It follows the repository's outbox recipe (`outbox-pattern-in-memory`, at-least-once relay with dead letters) and idempotency recipe (`idempotency-key-store`, one key per business effect). It is not for marketing campaigns or bulk lists.

## Integration points

| Hook | What you supply |
| --- | --- |
| `store` | `createSqlEmailOutboxStore(executor)` after applying `schema.sql`. Elsewhere: a unique `key`, an atomic claim (row locking or a conditional update), and conditional status updates. |
| `transport` | `createResendTransport({apiKey, fetch?})`, `createPostmarkTransport({apiKey, messageStream?})`, `createConsoleTransport()` in development, or your own `send(message, {idempotencyKey})`. |
| `templates` | `{ name: (data) => ({subject, text, html?}) }`. Rendering happens at enqueue, and the rendered message is stored. Escape user data you put into `html`. |
| `from` | The sender header, for example `Acme <no-reply@acme.example>`. |
| `suppress(address)` | Optional extra check, such as your own unsubscribe list. The store's suppression list is always checked. |
| `verify(request, rawBody)` | The provider signature check for the webhook. Use the `webhook-verification` module's `verifyStandardWebhook` for Resend (Svix headers) over the exact raw body. |

```ts
import { createEmailOutbox } from "./genlib/email-outbox/core.js";
import { createSqlEmailOutboxStore } from "./genlib/email-outbox/sql-store.js";
import { createResendTransport } from "./genlib/email-outbox/transports.js";
import { createEmailEventsHandler } from "./genlib/email-outbox/http.js";
import { verifyStandardWebhook } from "./genlib/webhook-verification/providers.js";

const outbox = createEmailOutbox({
  store: createSqlEmailOutboxStore(db),
  transport: createResendTransport({ apiKey: env.RESEND_API_KEY }),
  templates: { receipt: (d: any) => ({ subject: `Receipt ${d.number}`, text: `Total ${d.total}` }) },
  from: "Acme <billing@acme.example>",
});

await outbox.enqueue({ key: `receipt:${order.id}`, to: order.email, template: "receipt", data: order });
// Every 10 s from your scheduler:
await outbox.dispatch({ workerId: `web-${process.pid}`, batch: 20, leaseMs: 120_000 });

export const webhook = createEmailEventsHandler({
  outbox,
  verify: async (request, raw) => (await verifyStandardWebhook({ headers: request.headers, payload: raw, secret: env.RESEND_WEBHOOK_SECRET })).ok,
});
```

## Behavior

- **Enqueue** validates input, then is idempotent per `key`. The same key with the same payload (`to`, `template`, `data`, `tenantId`, `sendAt`, `tags`, compared by SHA-256 of canonical JSON) returns the original message. A different payload fails with `key-reused`.
- **Addresses** must have exactly one `@`, non-empty parts, no whitespace or control characters and at most 254 characters (`invalid-address`).
- **Header injection** is refused: CR or LF in the subject, a tag or `from` fails with `invalid-header`.
- **Suppression** is checked at enqueue (`suppressed`) and again at send. A message for an address suppressed after it was queued ends as `suppressed` and is not sent. Addresses are compared lower-cased.
- **Dispatch** claims due messages (queued with `nextAttemptAt <= now`, or sending with an expired lease). It sets a lease with an expiry and increments `attempts`, then calls `transport.send(message, {idempotencyKey: key})`:
  - `sent` records the provider id.
  - `retryable` (429, 408, 409, 5xx, network error, timeout, or a thrown error) is rescheduled after `max(fullJitter(attempt), Retry-After)`. Full jitter is a uniform delay in `[0, min(maxMs, baseMs * 2^(attempt-1)))`, by default base 30 s and maximum 1 h.
  - `permanent` (other 4xx) becomes `failed`.
  - A retryable result on attempt `maxAttempts` (default 6) becomes `dead`.
  - A reclaimed message whose attempts already exceed `maxAttempts` becomes `dead` without another send, so crash loops stop.
  - The result is written only if the worker still holds the lease. Otherwise it counts as `lostLease`.
  - It returns `{claimed, sent, retried, failed, dead, suppressed, lostLease}`.
- **Uncertain sends** (a network error or timeout after the request left) are retried with the same idempotency key. Resend returns the original result for a repeated `Idempotency-Key` within its retention window (24 hours at the time of writing), so the retry does not send twice. Postmark has no such header: the key travels as `Metadata.idempotency_key` for reconciliation, and a duplicate is possible.
- **Events**:
  - `delivered` moves `sent` to `delivered`.
  - A hard `bounced` moves `sent` or `delivered` to `bounced` and suppresses the address (`hard-bounce`).
  - `complained` moves `sent`, `delivered` or `bounced` to `complained` and suppresses the address (`complaint`).
  - A soft bounce changes nothing.
  - Replays and out-of-order late events are no-ops (`applied: false`). Unknown provider ids return `{applied: false, message: null}`.
- **Cancel** works only while the message is queued (`not-cancellable` otherwise, `not-found` for an unknown key). **get(key)** returns the message or null.
- Statuses: `queued`, `sending`, `sent`, `delivered`, `bounced`, `complained`, `failed`, `dead`, `cancelled` and `suppressed`.

## HTTP routes

`createEmailEventsHandler` is one webhook endpoint. It reads the raw body with a size limit (default 256 KiB) and calls `verify(request, rawBody)` before parsing. It has no Origin check or `authenticate`, because a webhook is server-to-server and the signature is the authentication.

| Request | Result |
| --- | --- |
| `POST` `{"type":"email.delivered","data":{"email_id","created_at"}}` | `200 {applied, known}` |
| `POST` `email.bounced` (hard unless `data.bounce.type` is transient/soft) | `200 {applied, known}` |
| `POST` `email.complained` | `200 {applied, known}` |
| `POST` any other `type` | `200 {ignored: true}` |
| Bad signature | `400 {error: "invalid-signature"}` |
| Malformed JSON | `400 {error: "invalid-json"}` |
| Missing `email_id` or time | `400 {error: "invalid-event"}` |
| Body over the limit | `413` |
| Not `POST` | `405` |

Responses carry `cache-control: no-store`. A 200 for an unknown message (`known: false`) stops the provider from retrying forever.

## Verify

`npm run build && node --test tests/email-outbox.test.mjs tests/email-outbox-sql.test.mjs` covers these cases:

- idempotent enqueue and key reuse
- address validation and header injection
- the suppression list at enqueue and at send
- retry classification, full-jitter backoff with an injected random, Retry-After and dead after maxAttempts
- lease reclaim after a crash, and the stale worker losing
- events and replay
- cancel
- the Resend and Postmark transports against a fake fetch (statuses, the `Idempotency-Key` header, an AbortSignal timeout), plus the console transport
- an outbox-plus-Resend retry that reuses the key
- the webhook adapter

The SQL test runs the store on PGlite. It covers the core behaviors, six concurrent dispatchers over 60 messages sending each exactly once, and five concurrent enqueues of one key inserting one row.

In the receiving app, run two dispatcher processes against your real PostgreSQL to exercise `SKIP LOCKED` across connections, and send one message through the provider's sandbox or test mode.

## If something fails

- **The same email arrives twice.** Check that keys are stable per business event (not random per request) and that `leaseMs` exceeds batch x transport timeout. On Postmark, uncertain sends can duplicate; lower `timeoutMs`.
- **Messages stay `sending`.** The worker crashed. They are reclaimed after `lease_expires_at`, so keep `dispatch` running.
- **Everything fails permanently with `http 401`.** The API key is wrong. Fix it, then re-queue the failed rows (`UPDATE email_outbox SET status='queued', attempts=0 WHERE status='failed' AND last_error LIKE 'http 401%'`).
- **`invalid-signature` on every webhook.** Pass the exact raw body and the provider's signing secret to `verify`. Do not re-serialize parsed JSON.
- **`key-reused`.** The same key was used for different content. Include the variable part (such as the order id) in the key.

## Limits

This module does not schedule itself, escape HTML, send attachments or multiple recipients, or manage unsubscribe links or marketing consent. It does not map Postmark webhooks; call `handleEvent` from your own route for those. Rows are never deleted, so prune old `sent`/`delivered` rows on a schedule. Provider deliverability (SPF, DKIM, DMARC), API key custody, production database correctness and consuming-application acceptance remain project responsibilities.
