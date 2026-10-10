# Rate limit · 0.1.0

## What installs

Original Apache-2.0 TypeScript source for token bucket, fixed window, and sliding window rate limiters behind one `createRateLimiter` factory. It includes a pluggable async `RateLimitStore`, a bounded in-memory LRU store, and Fetch-standard helpers that emit `429` and `RateLimit-*` headers. No runtime dependencies, and nothing runs at import time. The helpers use `Headers`/`Response`, which are available on Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers, and Hono.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan rate-limit --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add rate-limit --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

```ts
import { createRateLimiter } from "./genlib/rate-limit/limiter.js";
import { createMemoryStore } from "./genlib/rate-limit/store.js";
import { applyRateLimitHeaders, rateLimitResponse } from "./genlib/rate-limit/headers.js";

const limiter = createRateLimiter({ algorithm: "sliding-window", limit: 20, windowMs: 60_000, store: createMemoryStore() });

export async function POST(request: Request) {
  const session = await requireSession(request);          // the application's own authentication
  const result = await limiter.consume(`user:${session.userId}`);
  if (!result.allowed) return rateLimitResponse(result);
  const response = await handle(request);
  applyRateLimitHeaders(response.headers, result);        // only if response headers are mutable
  return response;
}
```

## API

| Export | Behavior |
| --- | --- |
| `createRateLimiter(options)` | `algorithm: "token-bucket"` takes `limit` (capacity) and `refillPerSecond`. `"fixed-window"` and `"sliding-window"` take `limit` and `windowMs`. All take `store`, plus optional `clock` and `prefix` (default `rl:<algorithm>:`). |
| `limiter.consume(key, cost = 1)` | Returns `{ allowed, limit, remaining, resetAt, resetAfterMs, retryAfterMs }`. `resetAt` (epoch ms) is when the quota is fully restored. `retryAfterMs` is 0 when allowed; otherwise it is the time until `cost` units could be allowed. A denied request consumes nothing. |
| `RateLimitStore` | `update(key, fn) => Promise<R>`. `fn(current)` returns `{ next, ttlMs, result }`, where `next: undefined` deletes the key. |
| `createMemoryStore({ maxKeys = 10000, clock? })` | Map-backed LRU with TTL expiry. `size()`, `delete(key)`, `clear()`. |
| `applyRateLimitHeaders(headers, result)` | Sets `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` (delta seconds, rounded up). Adds `Retry-After` (delta seconds, at least 1) when denied. |
| `rateLimitResponse(result, { body?, headers? })` | A `429` response with `Cache-Control: no-store`, the headers above, and a JSON body of `{"error":"rate_limited"}` by default. |

Algorithms: the **token bucket** refills continuously and allows bursts up to capacity. The **fixed window** counts per aligned `windowMs` bucket, so up to 2× `limit` can pass across a boundary. The **sliding window** is an exact log of timestamps over the trailing `windowMs`, with no boundary burst. Its state grows with `limit`, which is capped at 10000.

## Store atomicity contract

`update` must be one atomic read-modify-write per key. Two concurrent updates of the same key must never both see the same prior state and both commit. `fn` is synchronous and pure, so a shared store can use optimistic concurrency (Redis `WATCH`/`MULTI`, a compare-and-set loop, a Durable Object, or a database row lock) and may call `fn` more than once, as long as it commits exactly one result. Expired state must be passed to `fn` as `undefined`. State values are plain JSON. Honor `ttlMs` so idle keys expire.

`createMemoryStore` is atomic only because `fn` runs synchronously on one thread. It is **single-process**: the state is not shared across processes, cluster workers, isolates, serverless instances, or regions, and it resets on restart. Under a flood of distinct keys, LRU eviction resets the quotas of evicted keys. Size `maxKeys` accordingly, or use a shared store.

## Security and limits

- Key derivation belongs to the caller. Prefer an authenticated user, tenant, or API key ID. If you key by IP, read it from the platform's trusted source, for example the runtime's connection address or a header that only your own proxy sets. **Do not trust `X-Forwarded-For` blindly**: clients can set it to rotate keys or to exhaust another user's quota. Never put secrets in keys, because shared stores and logs may expose them.
- Store failures reject `consume`. Decide explicitly whether to fail open or fail closed for each route.
- Limits run on the server. Client-visible headers are informational. The module is not a DDoS, bot, or credential-stuffing defense on its own.
- Header fields follow the widely deployed `RateLimit-Limit/Remaining/Reset` convention, not the newer IETF draft structured `RateLimit`/`RateLimit-Policy` fields.

## Verification

`tests/rate-limit.test.mjs` (node:test, against the compiled output in `.build/`) covers allow/deny boundaries for each algorithm, refill and window reset under an injected clock, cost handling, key isolation, LRU bound and TTL expiry, header values and rounding, configuration validation, and concurrency: `Promise.all` of 50 requests against the memory store never exceeds `limit` for any algorithm. Only the memory store was tested. A shared store must be tested by the application that supplies it. `tested` records these repository checks only.
