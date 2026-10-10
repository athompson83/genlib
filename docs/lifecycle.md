# From new repository to shipped application

This map tells a coding agent which Genlib asset covers each stage of building an application, so it copies reviewed material instead of regenerating it. Start any stage with:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find <task words> --target "$APP_ROOT" --limit 5 --json
```

Every result names its type, verification level and the exact next command. Modules install through `plan`/`add`/`verify`; templates are merged by hand after reading their guide.

| Stage | Genlib asset | Type | What it saves |
| --- | --- | --- | --- |
| 1. Create the repository | `project-starter` (`templates/project`) | template | Strict NodeNext `tsconfig`, runtime pin, `ci:verify` script layout, `.env.example` |
| | `github-starter` (`templates/github`) | template | `.gitignore`, `.gitattributes`, `.editorconfig`, CODEOWNERS, PR/issue forms, Dependabot |
| 2. Detect and plan | `genlib detect`, `genlib find` | CLI | Stack detection from manifests; one ranked search across all sources |
| 3. Configure | `env-config` | module | Typed, fail-fast environment validation with secret redaction and `.env.example` rendering |
| 4. Build the interface | `theme-tokens`, `app-shell`, `data-table`, `validated-form` | modules | Tokens, accessible layout, table, form state (React 18/19) |
| | `ui-primitives`, `theme-variants`, `formatting` | recipes | Structural UI, theme/density variants, locale formatting |
| | UI resources (`tools/resources.mjs`) | resources | Reviewed external libraries with license scope |
| 5. Build features | `notification-preferences` | module | Preference UI, domain validation and a revision-checked handler |
| | `storefront-cart`, `storefront-catalog`, `invoice-totals`, `csv-export`, `upload-preflight` | recipes | Commerce math, exports and upload checks |
| 6. Integrate services | `common-api-clients` | module | Bounded server clients for GitHub, Stripe, Resend, Supabase, Graph, Calendar, OpenAI, Anthropic, Saleor, Steel |
| | `http-resilience` | module | Retries with backoff and jitter limited to idempotent requests, `Retry-After`, timeouts, circuit breaker |
| | `webhook-verification` | module | GitHub, Stripe and Standard Webhooks signature checks with Web Crypto on the raw body |
| 7. Protect the service | `rate-limit` | module | Token-bucket and window limiters with a pluggable store and standard 429 headers |
| | `security-headers` | module | CSP builder with nonces, HSTS, framing, referrer and permissions policies |
| 8. Operate | `structured-logger` | module | JSON-lines logs with key redaction, child loggers and request IDs |
| | `health-checks` | module | `/healthz` liveness and `/readyz` readiness with per-check timeouts |
| 9. Other languages | `*-pagination`, `*-identifier-validation`, Python/Go HTTP, config and logging | language examples | Same patterns for Python, Go, Rust, Java, Kotlin, C#, Dart, Swift |
| 10. Document | `docs-starter` (`templates/docs`) | template | README, architecture, security, API, decision records, runbooks |
| 11. Verify in CI | `github-starter` workflow | template | Path-aware Node CI with a docs-only lane and a required `Verify` job |
| 12. Ship | `ship-starter` (`templates/ship`) | template | Non-root Dockerfile, tag-driven release, GHCR image with SBOM/provenance, CodeQL, changelog |
| | deployment runbook (`templates/docs/docs/runbooks/deployment.md`) | template | Release, acceptance and rollback procedure |

## Runtime reach of the server modules

The framework-neutral server modules (`env-config`, `structured-logger`, `http-resilience`, `rate-limit`, `webhook-verification`, `health-checks`, `security-headers`) depend only on web-standard APIs: Fetch `Request`/`Response`/`Headers`, `AbortSignal`, Web Crypto and streams. That makes the same source usable in Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers and middleware, Remix/React Router actions, Hono, and Express or Fastify through their Fetch adapters. Repository tests run on Node.js 22+; other runtimes are a design target that the receiving application must verify.

## What Genlib does not cover yet

- Authentication and session management. Use the framework's maintained auth library; do not hand-roll password or token storage.
- Database schema, migrations and background job queues.
- Native mobile or desktop UI. The React modules target the browser.
- Platform-specific deployment (Vercel, Fly.io, AWS, app stores). Use the provider's documentation and the deployment runbook template.

Record new needs as proposed modules with a contract, tests and honest compatibility, following [the module format](module-format.md).
