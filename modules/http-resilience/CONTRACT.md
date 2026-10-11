# HTTP resilience · 0.1.0

## What installs

Original Apache-2.0 TypeScript source for retry with exponential backoff and full jitter, AbortSignal-aware timeouts, a Fetch retry wrapper that only repeats safe requests, and an in-process circuit breaker. No runtime dependencies. It uses Web Platform APIs only (Fetch `Request`/`Response`/`Headers`, `ReadableStream`, `AbortController`, `DOMException`, `setTimeout`), so it runs on Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers, and Hono. Importing or installing it starts no timers and makes no network calls.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan http-resilience --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add http-resilience --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The default destination is `src/genlib/http-resilience/`. Adjust the relative path for the importing file.

```ts
import { retry, withTimeout } from "./genlib/http-resilience/retry.js";
import { fetchWithRetry } from "./genlib/http-resilience/fetch-retry.js";
import { createCircuitBreaker, CircuitOpenError } from "./genlib/http-resilience/circuit-breaker.js";

const res = await fetchWithRetry(fetch, "https://api.example.com/items", { signal: request.signal },
  { attempts: 3, baseDelayMs: 200, maxDelayMs: 5000, attemptTimeoutMs: 10_000 });
```

## API

| Export | Behavior |
| --- | --- |
| `retry(fn, options)` | Calls `fn(attempt, signal)` up to `attempts` (1–20) times. The wait before retry *n* is `min(maxDelayMs, baseDelayMs * 2^(n-1))`; `jitter: "full"` (default) waits a uniform random time in `[0, cap)`, `"none"` waits exactly `cap`. `shouldRetry(error, attempt)` returns `false` to stop, `true`, or `{ delayMs }` to override the delay (capped by `maxDelayMs`). The final error is rethrown unchanged. |
| `withTimeout(fn, ms, signal?)` | Gives `fn` a signal that aborts after `ms` with a `TimeoutError` DOMException, or when `signal` aborts (its reason is kept). Settles promptly even if `fn` ignores the signal. |
| `fetchWithRetry(fetch, input, init, options)` | Retries network errors (`TypeError`, per-attempt `TimeoutError`) and statuses 408, 425, 429, 500, 502, 503, 504, but only for GET/HEAD/OPTIONS/PUT/DELETE or when the request has an `Idempotency-Key` header. Everything else is sent once. `Retry-After` (delta-seconds or HTTP date) replaces the backoff delay, capped at `maxDelayMs`. Unused response bodies are cancelled before each retry. Once attempts run out, the last response is returned, even if its status is retryable. A `Request` input with a body is sent once unless `replayRequestBody: true` declares the body buffered (each attempt then sends a clone); bodiless `Request` inputs are retried normally. `ReadableStream` init bodies are never replayed. Cancellation combines `options.signal`, `init.signal` and the `Request`'s own signal: any of them stops the call. |
| `parseRetryAfter(value, now?)` | Returns milliseconds, or `undefined` if the value is missing or malformed. A past date returns 0. |
| `isRetryableRequest(input, init?)` | The method/Idempotency-Key check used above. |
| `backoffDelay(retry, options)` | The delay formula on its own. |
| `createCircuitBreaker({ failureThreshold, resetAfterMs, clock?, isFailure? })` | `execute(fn)`, `state()`, `reset()`. Closed: consecutive counted failures reaching the threshold open the circuit. Open: calls are rejected with `CircuitOpenError` (`retryAfterMs`) without running `fn`. After `resetAfterMs` the circuit is half-open and allows one trial: success closes it, a failure reopens it, and concurrent calls during the trial are rejected. |

All delays, clocks, and randomness can be injected (`sleep`, `now`/`clock`, `random`) for deterministic tests. An abort on the caller signal is never retried. A wait is interrupted as soon as the signal aborts, even if an injected `sleep` ignores it, and no further attempt starts.

## Security and limits

- An `Idempotency-Key` header asserts that the server deduplicates. Persist one key per business operation and reuse it after ambiguous failures. Never generate a fresh key per attempt.
- PUT/DELETE are idempotent by HTTP semantics, but a server may not implement them that way. Pass `attempts: 1` for endpoints you do not trust.
- A `Retry-After` longer than `maxDelayMs` is cut short. Choose `maxDelayMs` according to the provider's documented limits.
- Retries multiply load and paid usage. Keep `attempts` small, respect caller deadlines with `signal`, and use the breaker to shed load on a dependency that is down. Breaker state is per process.
- A timeout does not prove that the server failed to apply a write.

## Verification

`tests/http-resilience.test.mjs` (node:test, against the compiled output in `.build/`) covers the backoff schedule and cap, the jitter bounds, `shouldRetry` stop and override, abort while waiting (no further attempts), timeout and parent abort, both `Retry-After` forms plus the cap, a non-idempotent POST/PATCH sent once, a POST with `Idempotency-Key` retried, Request body replay only when declared, the Request's own signal stopping retries, non-replay of stream bodies, body cancellation, per-attempt timeout, and breaker transitions including the single half-open trial. Tests use a fake Fetch boundary and make no live network calls. `tested` records these repository checks only. The receiving application must still test its integrated behavior.
