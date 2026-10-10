# Structured logger · 0.1.0

## What installs

Original Apache-2.0 TypeScript source (`logger.ts`, `request.ts`) for a JSON-lines logger that runs anywhere with `console`, `TextEncoder`, and (for request correlation) Fetch `Request`/`Headers` plus `crypto.randomUUID`. No runtime dependencies, no environment reads, no file or network I/O. Import and installation have no side effects.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan structured-logger --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add structured-logger --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The default destination is `src/genlib/structured-logger/`.

```ts
import { createLogger } from "./genlib/structured-logger/logger.js";
import { withRequest } from "./genlib/structured-logger/request.js";

const log = createLogger({ level: "info", base: { service: "api" }, redact: ["ssn"] });

export async function handle(request: Request): Promise<Response> {
  const { logger, requestId } = withRequest(log, request);
  try {
    logger.info("request received", { method: request.method });
    return new Response("ok", { headers: { "x-request-id": requestId } });
  } catch (err) {
    logger.error("request failed", { err });
    return new Response("error", { status: 500, headers: { "x-request-id": requestId } });
  }
}
```

## API

| Export | Behavior |
| --- | --- |
| `createLogger(options?)` | `level` (`debug`/`info`/`warn`/`error`/`silent`, default `info`), `sink(line, level)`, `base` fields, extra `redact` keys, `includeStack` (default `false`), `clock` (`Date` or epoch ms), and limits `maxDepth` 8, `maxStringLength` 4096, `maxArrayLength` 100, `maxKeys` 100, `maxCauseDepth` 3, `maxLineBytes` 16384. |
| `logger.debug/info/warn/error(msg, fields?)` | Emits one line `{"time","level","msg",...bindings,...fields}`. Field keys `time`/`level`/`msg` are kept as `_time`/`_level`/`_msg`. Passing an `Error` as `fields` logs it under `err`. |
| `logger.child(bindings)` / `isLevelEnabled(level)` | Child bindings are snapshotted (and redacted) at creation; the parent is unchanged. |
| `withRequest(logger, request, { header?, trustIncoming?, generate? })` | Reuses an incoming `x-request-id` only if it matches `REQUEST_ID_PATTERN` (`[A-Za-z0-9._:-]{1,128}`), otherwise generates `crypto.randomUUID()`. Returns frozen `{ logger, requestId }` with `requestId` bound. Set the response header yourself. |
| `defaultSink` | `console.log` for debug/info, `console.error` for warn/error. |
| `DEFAULT_REDACT_KEYS`, `REDACTED` | Default keys: password, passwd, secret, token, access/refresh/id/session tokens, authorization, proxy-authorization, cookie, set-cookie, apiKey, api_key, x-api-key, client_secret, private_key. |

## Security and limits

- Redaction compares whole keys after lowercasing and removing `-`, `_`, `.`, and spaces, at every depth, including `Map` keys, `Headers` entries, and enumerable `Error` fields. It does not scan values or `msg`, and does not match substrings (`githubToken` is not redacted unless listed).
- Serialization never throws: cycles become `[Circular]` (shared non-cyclic references are kept), throwing getters become `[Unserializable]`, `bigint`/`NaN` become strings, typed arrays become a size label, and depth/key/array/string limits apply. Lines over `maxLineBytes` are replaced by `{ truncated: true, originalBytes }`.
- Errors serialize `name`, `message`, enumerable fields, and a bounded `cause` chain; stacks only with `includeStack: true`.
- Writes are synchronous with no buffering, sampling, or delivery guarantee; sink exceptions are swallowed so logging cannot break request handling. No OpenTelemetry or `traceparent` support.

## Verification

`tests/structured-logger.test.mjs` (10 tests, Node.js 22, injected sink and clock) covers line format and level filtering, reserved keys, child bindings, nested case-insensitive redaction, error cause bounds and cycles, depth/array/key/string/line limits, awkward values, sink failure, default console routing, and `withRequest` reuse/generation/rejection. Other runtimes were not executed. The receiving application must verify its log pipeline and redaction list.
