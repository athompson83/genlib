# From new repository to shipped application

This map tells a coding agent which Genlib asset covers each stage of building an application, so it copies reviewed material instead of regenerating it. Start any stage with:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find <task words> --target "$APP_ROOT" --limit 5 --json
```

`find` also returns Genlib's code-navigation tools for "where is the code for X" tasks. They index the repository they run in, fail closed on a stale commit, and point to a few candidate files, import edges and tests. Graphify-style semantic graphs remain an optional Genisys adapter rather than a bundled dependency.

Every result names its type, verification level and the exact next command. Modules install through `plan`/`add`/`verify`; templates are merged by hand after reading their guide.

| Stage | Genlib asset | Type | What it saves |
| --- | --- | --- | --- |
| 1. Create the repository | `project-starter` (`templates/project`) | template | Strict NodeNext `tsconfig`, runtime pin, `ci:verify` script layout, `.env.example` |
| | `github-starter` (`templates/github`) | template | `.gitignore`, `.gitattributes`, `.editorconfig`, CODEOWNERS, PR/issue forms, Dependabot |
| 2. Detect and plan | `genlib detect`, `genlib find` | CLI | Stack detection from manifests; one ranked search across all sources. Module results list their installed files and exports |
| | `repo-context`, `repo-map`, `repo-ast-graph`, `repo-diagram` | tools | Commit-bound map, AST import graph and Mermaid diagram so an agent opens only the files a task touches instead of reading the repository |
| 3. Configure | `env-config` | module | Typed, fail-fast environment validation with secret redaction and `.env.example` rendering |
| 4. Build the interface | `theme-tokens`, `app-shell`, `data-table`, `validated-form` | modules | Tokens, accessible layout, table, form state (React 18/19) |
| | `ui-primitives`, `theme-variants`, `formatting` | recipes | Structural UI, theme/density variants, locale formatting |
| | UI resources (`tools/resources.mjs`) | resources | Reviewed external libraries with license scope |
| 5. Build features | `notification-preferences` | module | Preference UI, domain validation and a revision-checked handler |
| | `storefront-cart`, `storefront-catalog`, `invoice-totals`, `csv-export`, `upload-preflight` | recipes | Commerce math, exports and upload checks |
| | `money-minor-units`, `slugify-and-unique-slug`, `cursor-pagination`, `date-ranges-and-business-days`, `csv-parse`, `async-pool`, `lru-cache-with-ttl`, `semver-compare-and-range`, `state-machine-typed`, `idempotency-key-store`, `outbox-pattern-in-memory`, `token-budget-truncation` and more | recipes | Tested single-file utilities that agents otherwise regenerate in every project (see `resources/agent-recipes.json`) |
| 6. Integrate services | `common-api-clients` | module | Bounded server clients for GitHub, Stripe, Resend, Supabase, Graph, Calendar, OpenAI, Anthropic, Saleor, Steel |
| | `http-resilience` | module | Retries with backoff and jitter limited to idempotent requests, `Retry-After`, timeouts, circuit breaker |
| | `webhook-verification` | module | GitHub, Stripe and Standard Webhooks signature checks with Web Crypto on the raw body |
| | `oidc-pkce`, `oidc-token-verification`, `saml-sso`, `totp`, `recovery-codes`, `webauthn-passkeys`, `password-hashing` | capabilities | SSO login, token and SAML verification, MFA, passkeys and password storage in 9 languages ([capabilities](capabilities.md)) |
| | `form-schema`, `calculator`, `pdf-form-filling`, `pdf-text-extraction`, `docx-documents`, `rich-text-sanitization` | capabilities | Server-side forms, safe math, PDF filling and parsing, Word documents and HTML sanitizing in each language |
| | `slugify`, `json-patch`, `line-diff`, `rrule` | capabilities | URL slugs, JSON Patch/Pointer/merge patch and JSON diff, minimal text diffs and dateutil-compatible recurrence in 9 languages |
| | `csv-safe`, `money`, `signed-cursors`, `ics-events` | capabilities | Injection-safe CSV import and export, money in minor units with exact rounding and allocation, tamper-proof pagination cursors, and calendar invites in 9 languages |
| | `ids`, `retry-backoff`, `token-bucket`, `semver`, `cron-next`, `wcag-contrast`, `geo`, `webhook-signature` | capabilities | Sortable IDs, retries and rate limits, version ranges, cron schedules, accessible colors, location search and signed webhooks in 9 languages |
| 7. Protect the service | `rate-limit` | module | Token-bucket and window limiters with a pluggable store and standard 429 headers |
| | `security-headers` | module | CSP builder with nonces, HSTS, framing, referrer and permissions policies |
| | `dashboards` catalog (Grafana, Superset, Metabase, Tabler, AdminLTE, chart libraries per language) | resources | Admin panels, charts, BI and operations dashboards without building them from scratch |
| | `scheduling-calendar` catalog (Cal.diy, Easy!Appointments, Radicale, FullCalendar, rrule, ICS, calendar SDKs) | resources | Booking, calendars, recurrence and calendar sync in each language |
| | `chat-messaging` catalog (Mattermost, Rocket.Chat, Zulip, Chatwoot, Matrix, SimpleX, Socket.IO, bot SDKs) | resources | Team chat, live support, real-time messaging and bots in each language |
| | `open-source-tools` catalog (Ollama, Open WebUI, Stirling-PDF, AppFlowy, Penpot, n8n, Coolify, Uptime Kuma and 1,200+ more) | resources | Self-hostable alternatives to proprietary products; search `<product> alternative` |
| | `finance-accounting` catalog (Firefly III, Actual Budget, GnuCash, Ghostfolio, OpenBB, Stripe/QuickBooks/Xero SDKs, money types) | resources | Budgeting, accounting, ledgers, payments and market data in each language |
| | `business-tools` catalog (Superset, Metabase, Supabase, Coolify, NocoDB, Dub, Ghost, CRM/ERP/helpdesk, business-service SDKs) | resources | Run the business without building internal tools; search `<product> alternative` |
| | `education` catalog (Moodle, Canvas LMS, Open edX, Frappe LMS, ClassroomIO, Chamilo, Excalidraw, reveal.js, LanguageTool, H5P) | resources | LMS, whiteboards, slides, writing, assessment and LTI 1.3 integration in each language |
| | `ai-learning` catalog (browser-use, OpenViking, Flowise, Fabric, Firecrawl MCP, TheAlgorithms, System Design Primer, developer-roadmap, public-apis, build-your-own-x) | resources | Agent tooling and learning references; LangChain, Transformers, Whisper and Kubernetes live in the AI and DevOps catalogs |
| | `ai-learning` additions: engineering guides (Google eng-practices, Uber Go guide, Microsoft REST API Guidelines), Backstage, Thoughtworks radar, Netflix OSS, Compositor, Snapzy, Capd, OpenChatCut, Locally Uncensored, OpenDroid, ChatbotX | resources | Guides to read before designing APIs or reviewing code; apps to use or study; `genlib source <id>` fetches their code at a pinned commit |
| | `ai-learning` diagram tools: Agentic Mermaid (Genlib renders its own diagrams with it), DeepDiagram, Agentic AI Architecture Visualisation, drawio-skill, architecture-diagram skill, Azure Agent Architecture Review, Agentic-AI-Systems | resources | Generate, verify and render architecture diagrams instead of hand-drawing them |
| | `mapping-navigation` catalog (MapLibre GL JS/Native, Leaflet, OpenLayers, CesiumJS, Organic Maps, OsmAnd, CoMaps, OpenFreeMap, Martin, OpenTripPlanner, GeoServer, PostGIS and 800 more; God's Eye View's tools and live data feeds) | resources | Maps, routing, tiles, geocoding and GIS in each language; pair with the geo, tile-math, polyline and geometry capabilities |
| | `starter` index (2,818 project templates and boilerplates: Open SaaS, Next.js SaaS Starter, create-t3-app, cookiecutter-django, Ignite, dotnet new packs) | starters | Start a new project from a pinned, popular template in its language |
| | `task` index (OpenRewrite migrations and fixes, n8n and Activepieces workflows) | task recipes | Upgrade frameworks, fix code at scale and automate workflows with one pinned command |
| 8. Operate | `structured-logger` | module | JSON-lines logs with key redaction, child loggers and request IDs |
| | `health-checks` | module | `/healthz` liveness and `/readyz` readiness with per-check timeouts |
| 9. Other languages | Every capability, plus `*-pagination`, `*-identifier-validation`, Python/Go HTTP, config and logging | capabilities, language examples | Same patterns for Python, Go, Rust, Java, Kotlin, C#, Dart, Swift |
| 10. Document | `docs-starter` (`templates/docs`) | template | README, architecture, security, API, decision records, runbooks |
| 11. Verify in CI | `github-starter` workflow | template | Path-aware Node CI with a docs-only lane and a required `Verify` job |
| 12. Ship | `ship-starter` (`templates/ship`) | template | Non-root Dockerfile, tag-driven release, GHCR image with SBOM/provenance, CodeQL, changelog |
| | deployment runbook (`templates/docs/docs/runbooks/deployment.md`) | template | Release, acceptance and rollback procedure |
| 13. Market and grow | `marketing-seo`, `marketing-analytics`, `marketing-engagement`, `social-media` catalogs | resources | SEO and AI-optimization tooling, analytics, attribution, experiments, email, CRM, ads, push, consent and social media in each language, with exact install commands |

## External resources at every stage

When no module, recipe or template covers a need, the resource catalog usually names a maintained project for it, tagged by Genisys project type. Run `node tools/resources.mjs search <need> --project <type> --limit 5 --json`, or read the matching domain guide listed in the [resource index](resources/README.md): frontend, backend/API, AI agents, mobile/desktop/CLI/games, data/docs/office, DevOps/testing/security, SaaS/commerce/finance, media/automation, README tools and UI sources. Each record's `useWhen` says which hand-written work it replaces. Check `license-review` records before copying or embedding them.

## Runtime reach of the server modules

The framework-neutral server modules (`env-config`, `structured-logger`, `http-resilience`, `rate-limit`, `webhook-verification`, `health-checks`, `security-headers`) depend only on web-standard APIs: Fetch `Request`/`Response`/`Headers`, `AbortSignal`, Web Crypto and streams. That makes the same source usable in Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers and middleware, Remix/React Router actions, Hono, and Express or Fastify through their Fetch adapters. Repository tests run on Node.js 22+; other runtimes are a design target that the receiving application must verify.

## What Genlib does not cover yet

- Session management and user stores. The capabilities cover the protocol pieces (SSO request and token verification, SAML, MFA, passkeys, password hashing); use the framework's maintained session library or an identity provider for the rest.
- Database schema, migrations and background job queues.
- Native mobile or desktop UI. The React modules target the browser.
- Platform-specific deployment (Vercel, Fly.io, AWS, app stores). Use the provider's documentation and the deployment runbook template.

Record new needs as proposed modules with a contract, tests and honest compatibility, following [the module format](module-format.md).
