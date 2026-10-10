# Webhook verification · 0.1.0

## What installs

Original Apache-2.0 TypeScript in `src/genlib/webhook-verification/`: Web Crypto HMAC-SHA256 primitives (`hmac.ts`), provider schemes (`providers.ts`), and a size-capped raw body reader (`raw-body.ts`). No runtime dependencies, environment reads, or network access. Uses only standard Web Crypto, Fetch `Request`/`Headers`, and streams, so it targets Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers, and Hono; repository tests ran on Node.js 22 only.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan webhook-verification --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add webhook-verification --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

```ts
import { readRawBody } from "./genlib/webhook-verification/raw-body.js";
import { verifyStripeWebhook } from "./genlib/webhook-verification/providers.js";

export async function POST(request: Request): Promise<Response> {
  const raw = await readRawBody(request, 1024 * 1024);
  if (!raw.ok) return new Response(null, { status: raw.reason === "too-large" ? 413 : 400 });
  const result = await verifyStripeWebhook({ secret: [currentSecret, previousSecret], payload: raw.body, headers: request.headers });
  if (!result.ok) return new Response(null, { status: 400 }); // log result.reason, never the secret or signature
  const event = JSON.parse(new TextDecoder().decode(raw.body)); // parse only after verification
  // dedupe on event.id, then process idempotently
  return new Response(null, { status: 204 });
}
```

## API

| Export | Header / input | Signed content | Notes |
| --- | --- | --- | --- |
| `verifyHmacSha256({ secret, payload, signatureHex })` | 64-char hex digest | raw body | Generic; upper or lower hex. |
| `verifyGitHubWebhook({ secret, payload, headers })` | `X-Hub-Signature-256: sha256=<hex>` | raw body | No timestamp: dedupe on `X-GitHub-Delivery`. |
| `verifyStripeWebhook({ secret, payload, headers, toleranceSeconds?, clock? })` | `Stripe-Signature: t=<unix>,v1=<hex>[,v1=...]` | `${t}.${body}` | Any matching `v1` passes; `v0` ignored; up to 20 signatures. |
| `verifyStandardWebhook({ secret, payload, headers, toleranceSeconds?, clock? })` | `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<b64> ...` (or `svix-*`) | `${id}.${timestamp}.${body}` | Secret `whsec_<base64>`; non-`v1` entries such as `v1a` are skipped. |
| `readRawBody(request, maxBytes)` | `Request` | — | `{ ok: true, body } \| { ok: false, reason: "too-large" \| "unreadable" }`; rejects declared oversize Content-Length unread and cancels the stream once the cap is exceeded. |
| `timingSafeEqual(a, b)` | bytes | — | Exposed for application use. |

Verifiers return `{ ok: true } | { ok: false, reason: "missing-header" | "malformed" | "expired" | "mismatch" }`. `secret` is one value or an array of 1–10 for rotation. `headers` is a Fetch `Headers` or a plain record (case-insensitive; Node `IncomingHttpHeaders` works). `payload` is `Uint8Array`, `ArrayBuffer`, or string (UTF-8 encoded). Timestamps are checked in both directions with a default 300 s tolerance; `expired` is returned only after the signature matches. `clock` returns epoch milliseconds.

## Security and limits

- Verify the exact raw bytes before parsing. Re-serialized JSON, decoded/normalized text, or framework-parsed bodies will not verify.
- Request input never throws and results never contain secrets or signatures. Invalid configuration (empty/oversized secrets, more than 10 secrets, bad tolerance or cap) throws a `TypeError` with a fixed message.
- Comparison is constant-time over equal-length digests; lengths are public. Header values over 4096 characters, duplicated values, or containing CR/LF/NUL are `malformed`.
- A valid signature is not replay protection beyond the timestamp window, not authorization of the event content, and not idempotency. Persist processed event/delivery IDs and process effects idempotently.
- Not implemented: asymmetric `v1a` signatures, GitHub SHA-1, Stripe `v0`, other providers' formats, or secret storage/rotation workflows.

## Verification

`tests/webhook-verification.test.mjs` computes every expected signature independently with `node:crypto` `createHmac` and covers valid raw bytes, tampered and re-serialized bodies, wrong secrets, rotated secrets, multiple signatures, expired and future timestamps, tolerance overrides, missing and malformed headers, Svix header fallback, invalid secret configuration without echo, oversized and already-consumed bodies, and an end-to-end read-then-verify. No live provider delivery was received; other runtimes were not exercised. Consumers must test their integrated route with their framework's raw body handling.
