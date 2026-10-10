# Health checks · 0.1.0

## What installs

Original Apache-2.0 TypeScript in `src/genlib/health-checks/health.ts`: Fetch-standard liveness and readiness handlers. No runtime dependencies, environment reads, or network access of its own; the application supplies every check. Targets Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers, and Hono; repository tests ran on Node.js 22 only.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan health-checks --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add health-checks --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

```ts
import { createHealthHandler } from "./genlib/health-checks/health.js";

const health = createHealthHandler({
  version: process.env.APP_VERSION ?? "dev",
  timeoutMs: 2000,
  checks: {
    database: signal => db.ping({ signal }),               // critical by default
    search: { check: () => search.ping(), critical: false, timeoutMs: 500 },
  },
});

// Next.js app/readyz/route.ts: export const GET = health.readiness; export const HEAD = health.readiness;
// Generic fetch server / Hono middleware: const res = await health.handle(request); if (res) return res;
```

## API

| Member | Behavior |
| --- | --- |
| `createHealthHandler(options)` | Validates configuration (throws `TypeError`) and returns `{ liveness, readiness, handle }`. |
| `liveness(request)` | 200 `{ status: "ok", checkedAt, version? }` without running checks. |
| `readiness(request)` | Runs all checks concurrently, each with its own timeout and `AbortSignal`. Body `{ status: "ok" \| "degraded" \| "fail", checkedAt, durationMs, version?, checks: { [name]: { status: "pass" \| "fail" \| "timeout", critical, durationMs, detail?, error? } } }`. Any critical fail/timeout → 503 `fail`; only non-critical problems → 200 `degraded`. |
| `handle(request)` | Routes `livenessPath` (`/healthz`) and `readinessPath` (`/readyz`) by pathname; returns `null` for other paths. |

Options: `checks` (function or `{ check, critical?, timeoutMs? }`; names `[A-Za-z0-9_.:-]{1,64}`, ≤ 50), `timeoutMs` (default 2000, 1–60000), `clock` (epoch ms), `version`, `exposeErrors` (default false), `livenessPath`, `readinessPath`.

## Security and limits

- Responses are JSON with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Only GET and HEAD are accepted; others get 405 with `Allow: GET, HEAD`. HEAD returns status and headers with no body.
- Error messages are never included unless `exposeErrors: true` (truncated to 256 characters); use it only on trusted internal networks. `detail` strings returned by checks are included (control characters replaced, truncated) — keep secrets and internal topology out of them.
- Every readiness request runs every check: no caching, coalescing, rate limiting, or authentication. Limit exposure and probe frequency at the platform/proxy, and keep checks cheap.
- A check that ignores its `AbortSignal` keeps running after its timeout is reported.
- Liveness only proves the process can serve this handler; it is not a dependency check.

## Verification

`tests/health-checks.test.mjs` covers liveness, passing readiness with details, critical failure (503) without leaking the error text, non-critical failure and timeout degrading only, concurrent execution with per-check timeout and abort, opt-in truncated errors, HEAD without body, 405 with `Allow`, path routing/fall-through, configuration rejection, and `__proto__` as a plain check name. Tests use in-process fake checks on Node.js 22; no orchestrator or load balancer was exercised.
