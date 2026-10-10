# Environment configuration · 0.1.0

## What installs

Original Apache-2.0 TypeScript source (`fields.ts`, `config.ts`) for declaring environment variables as a typed schema and validating them once at startup. No runtime dependencies. The module never reads `process.env`, files, or globals: the caller passes a record, so the same schema works with Node, Bun, `Deno.env.toObject()`, a Cloudflare Workers `env`, or Vite `import.meta.env`. Import and installation have no side effects.

## Install and imports

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" plan env-config --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" add env-config --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The default destination is `src/genlib/env-config/`. `config.ts` re-exports every field helper.

```ts
import { defineConfig, str, num, bool, url, secret } from "./genlib/env-config/config.js";

export const env = defineConfig({
  NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
  PORT: num({ integer: true, min: 1, max: 65535, default: 3000 }),
  DEBUG: bool({ default: false }),
  PUBLIC_URL: url({ protocols: ["https"] }),
  STRIPE_KEY: secret({ minLength: 20 }).describe("Server-only Stripe key"),
}).parse(process.env); // throws ConfigError listing every problem
```

## API

| Export | Behavior |
| --- | --- |
| `str({ default?, minLength?, maxLength?, pattern?, choices? })` | String; `choices` narrows the type to a literal union. `g`/`y` regex flags are dropped for deterministic matching. |
| `num({ min?, max?, integer?, default? })` | Plain decimal notation only (`0x10`, `""`, `Infinity` rejected). |
| `bool({ default? })` | `true/false`, `1/0`, `yes/no`, `on/off`, case-insensitive. |
| `url({ protocols?, default? })` | Absolute URL, default schemes `https`/`http`; returns the trimmed input string. |
| `list({ separator?, minItems?, maxItems?, default? })` | Delimited list (default `,`), trimmed, empty items dropped, frozen array. |
| `json({ validate?, default? })` | `JSON.parse` plus optional `validate(value) => T` that returns or throws. |
| `secret(strOptions?)` | `str(...).secret()`. |
| Field methods | `.optional()` (missing → `undefined`), `.secret()`, `.describe(text)`, `.example(text)`. Fields are immutable; each call returns a new field. |
| `defineConfig(schema)` | Validates variable names (`[A-Za-z_][A-Za-z0-9_]*`). Returns `{ schema, parse, safeParse, redact, describe, toExample }`. |
| `parse(source)` | Reads only schema keys that are own properties of `source`; unknown keys are ignored. Empty strings count as missing; numbers/booleans (Vite) are stringified first; objects are rejected. Returns a frozen object typed by `InferConfig<S>`. |
| `ConfigError` | `issues: { key, message }[]` for every failing key; `message` lists them; `toJSON()` is safe to serialize. |
| `toExample()` | `.env.example` text: description comment, `hint; required/optional; secret; default` comment, then `KEY=value`. Secrets are always blank. |

## Security and limits

- Error messages are fixed text per rule and never contain the supplied value, secret or not. Parser messages from `URL`, `JSON.parse`, and `validate` callbacks are replaced because they can quote input.
- The parsed object carries non-enumerable `toJSON`, `toString`, and Node inspect hooks, so `JSON.stringify(config)`, template strings, and `console.log(config)` render secrets as `[REDACTED]`. Direct property access still returns the real value; do not log `config.SECRET_KEY` yourself. `secret()` is not encryption, and anything bundled into client code is public.
- Defaults are trusted schema values and are not re-validated. `json()` results are not deep-frozen.
- Out of scope: loading `.env` files, variable expansion, reload/watch, and secret-manager retrieval.

## Verification

`tests/env-config.test.mjs` (11 tests, Node.js 22, compiled with the repository's strict tsconfig) covers defaults, each field kind, boolean spellings, aggregation of all errors by key, empty/non-primitive input, ignored unknown and prototype keys, secret non-disclosure across error message/stack/JSON/inspect/toString/describe/example, frozen output, and exact `.env.example` rendering. Type inference was checked separately with a strict compile. The receiving application must still test its own schema and startup path.
