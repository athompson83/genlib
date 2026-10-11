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
| | `sse`, `text-chunking`, `vector-math`, `circuit-breaker`, `business-days`, `natural-sort`, `file-signature`, `color` | capabilities | Streaming responses, RAG chunking and embedding search, fail-fast calls, working-day dates, human sort order, upload type checks and color spaces in 9 languages |
| | `csv-safe`, `money`, `signed-cursors`, `ics-events` | capabilities | Injection-safe CSV import and export, money in minor units with exact rounding and allocation, tamper-proof pagination cursors, and calendar invites in 9 languages |
| | `ids`, `retry-backoff`, `token-bucket`, `semver`, `cron-next`, `wcag-contrast`, `geo`, `webhook-signature` | capabilities | Sortable IDs, retries and rate limits, version ranges, cron schedules, accessible colors, location search and signed webhooks in 9 languages |
| | `glob-match`, `dotenv`, `query-string`, `mime-types`, `data-uri`, `iso-week`, `topo-sort`, `link-header`, `content-disposition`, `cache-control` | capabilities | File globs, .env loading, query strings, MIME lookup, data URLs, ISO weeks, dependency order, pagination links, download filenames and HTTP caching in 9 languages |
| | `punycode`, `base58`, `roman-numerals`, `dotted-path`, `template-render`, `ini-parse`, `pii-mask`, `password-generate`, `html-escape` | capabilities | Internationalized domains, Base58Check, numerals, nested-data paths, logic-less templates, INI config, PII masking for logs, CSPRNG passwords and HTML entities in 9 languages |
| 7. Protect the service | `rate-limit` | module | Token-bucket and window limiters with a pluggable store and standard 429 headers |
| | `security-headers` | module | CSP builder with nonces, HSTS, framing, referrer and permissions policies |
| | `entitlements` | module | Plan features and limits with status fallback, and an idempotent, overdraw-proof usage-credit ledger |
| | `notification-inbox` | module | In-app inbox: idempotent publish, unread counts, mark read, archive, retention |
| | `csv-import` | module | CSV upload, column mapping, typed validation and idempotent commit with per-row errors |
| | `org-invitations` | module | Tenant invitations: hashed one-time tokens, single-use accept, revoke, expiry, Fetch adapter |
| | `comments` | module | Threaded comments with mentions, reactions, flags and moderation, plus a PostgreSQL schema and SQL store |
| | `site-search`, `email-outbox`, `web-push`, `bot-protection`, `chat`, `qr-code` | modules | Full-text search with facets, a transactional email outbox, Web Push, captcha and proof-of-work bot checks, chat conversations and QR codes |
| | `rbac`, `password-reset`, `short-links`, `presence` | modules | Role checks with anti-escalation, a forgot-password flow, a URL shortener and who-is-online presence, each with a store interface and tests |
| | `soft-delete`, `api-keys`, `account-deletion`, `tenant-isolation`, `audit-log` | modules | The four features no package covered plus an audit log, each with a PostgreSQL store tested under PGlite |
| | `email-signup`, `two-factor`, `file-uploads`, `webhook-delivery`, `scheduled-tasks` | modules | Five partial features completed (signup verification, TOTP 2FA, uploads, outgoing webhooks, cron), each with a PostgreSQL store and an independent review's findings fixed test-first |
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

## After installing: receipts, updates and rollback

`add` writes `.genlib/receipts/<id>.json` next to the lock. The receipt records four outcomes, so a report can say exactly how far an adoption got:

| Outcome | Set by | Meaning |
| --- | --- | --- |
| `found` | `add` | The module was selected and planned |
| `copied` | `add` | Files were copied and hashed |
| `used` | `adopted <id>` | Application code outside the installed folder imports the installed files, through a relative path or an alias such as `@/genlib/<id>/…` |
| `verified` | `adopted <id> --test "<cmd>"` | The app's own test command exited 0 (its exit code and output tail are kept) |

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" adopted org-invitations --target "$APP_ROOT" --test "npm test" --json
node "$GENLIB_ROOT/bin/genlib.mjs" update org-invitations --target "$APP_ROOT" --json            # dry run
node "$GENLIB_ROOT/bin/genlib.mjs" update org-invitations --target "$APP_ROOT" --write --conflict rej
node "$GENLIB_ROOT/bin/genlib.mjs" remove org-invitations --target "$APP_ROOT" --dry-run
```

- **update** works like Copier's update: the base is the file at the commit recorded in the lock (`git show`), the incoming file is this checkout's version, and local edits are merged with `git merge-file`. Unchanged files are replaced; edited files merge cleanly or are reported as conflicts, written to `<file>.genlib-conflict` (`--conflict rej`, the default) or as inline markers (`--conflict inline`). Nothing is written without `--write`. The base comes from the Genlib checkout's Git history; when the locked commit is not available there, an edited file is reported as a conflict (`installed original unavailable`) with the new version in its `.genlib-conflict` file, rather than merged against a guessed base. Package dependencies are not changed; `updateDependenciesFirst` names dependent modules whose versions moved.
- **Apps without a build.** `plan|add --ts-imports` rewrites relative `./x.js` imports in copied `.ts`/`.tsx` files to `./x.ts`, for apps that run TypeScript with Node's type stripping, Deno or Bun. The lock hashes the rewritten bytes and records `tsImports: true`; `update` applies the same rewrite before comparing and merging, and a reinstall must use the same setting. `plan` warns when the target has no `tsconfig.json`.
- **remove** deletes files whose hashes still match the lock, keeps edited files (and lists them), removes the lock and receipt entries, and refuses while another installed module depends on this one.
- **No match.** If the best result is an external record covering less than a third of the task's words, `quick` returns `noMatch` with `gh search repos`/`gh search code` commands instead of a weak pick. [gaps.md](gaps.md) lists the common tasks still covered only by external projects.

**Registry items and acceptance.** Items adopted from shadcn-format registries with `genlib registry add` get the same receipts (`shadcn--<name>`), so `adopted` works on them too ([distribution.md](distribution.md#adopting-shadcn-format-items-into-an-app-genlib-registry)). `adopted <id> --test "<cmd>" --accepts <contract>#<requirement>,...` records which feature requirements that command exercised; [coverage.md](coverage.md) explains how they count.

Schemas for receipts and update results are in `schemas/` (`genlib schema receipt`, `genlib schema update`).

## External resources at every stage

When no module, recipe or template covers a need, the resource catalog usually names a maintained project for it, tagged by Genisys project type. Run `node tools/resources.mjs search <need> --project <type> --limit 5 --json`, or read the matching domain guide listed in the [resource index](resources/README.md): frontend, backend/API, AI agents, mobile/desktop/CLI/games, data/docs/office, DevOps/testing/security, SaaS/commerce/finance, media/automation, README tools and UI sources. Each record's `useWhen` says which hand-written work it replaces. Check `license-review` records before copying or embedding them.

## Runtime reach of the server modules

The framework-neutral server modules (`env-config`, `structured-logger`, `http-resilience`, `rate-limit`, `webhook-verification`, `health-checks`, `security-headers`, `org-invitations`, `entitlements`, `notification-inbox`, `csv-import`, `comments`, `rbac`, `password-reset`, `short-links`, `presence`, `site-search`, `email-outbox`, `web-push`, `bot-protection`, `chat`, `soft-delete`, `api-keys`, `account-deletion`, `tenant-isolation`, `audit-log`, `two-factor`, `file-uploads`, `webhook-delivery`, `scheduled-tasks`) depend only on web-standard APIs: Fetch `Request`/`Response`/`Headers`, `AbortSignal`, Web Crypto and streams. That makes the same source usable in Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers and middleware, Remix/React Router actions, Hono, and Express or Fastify through their Fetch adapters. Repository tests run on Node.js 22+; other runtimes are a design target that the receiving application must verify. `email-signup` also needs `node:crypto` for its default scrypt hasher (inject another hasher elsewhere).

## What Genlib does not cover yet

- Session management and user stores. The capabilities cover the protocol pieces (SSO request and token verification, SAML, MFA, passkeys, password hashing); use the framework's maintained session library or an identity provider for the rest.
- Database migrations and background job queues. `org-invitations`, `comments`, `rbac`, `password-reset`, `short-links`, `site-search`, `email-outbox`, `web-push`, `chat`, `soft-delete`, `api-keys`, `account-deletion`, `tenant-isolation`, `audit-log`, `email-signup`, `two-factor`, `file-uploads`, `webhook-delivery` and `scheduled-tasks` ship a PostgreSQL schema and SQL store; other feature packages define store interfaces you implement.
- Native mobile or desktop UI. The React modules target the browser.
- Platform-specific deployment (Vercel, Fly.io, AWS, app stores). Use the provider's documentation and the deployment runbook template.

Record new needs as proposed modules with a contract, tests and honest compatibility, following [the module format](module-format.md).
