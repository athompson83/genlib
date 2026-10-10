# Resource catalog

The catalog points coding agents at maintained open-source projects, services and references, so they adopt proven code instead of writing it. Every command here is local and read-only: none installs packages or contacts providers. The only exception is the verifier, which reads public registries and repository metadata.

```sh
node tools/resources.mjs types --json                                   # project types with record counts
node tools/resources.mjs search queue --project api-backend --limit 5 --json
node tools/resources.mjs search icons --license MIT --limit 5 --json
node tools/resources.mjs inspect bullmq --json
node tools/resources.mjs validate --json                                # offline schema and binding check
node scripts/verify-resources.mjs --file resources/catalog/ai-agents.json  # network link/license check
```

`genlib find <task words>` also searches the catalog alongside modules, recipes, templates and tools. Use `--project <type>` there to narrow resources to one project type.

`search` supports `--platform`, `--category`, `--mode`, `--license`, `--project` and `--limit` (1–50, default 5). `pc` is an alias for `desktop`. License filtering matches the complete recorded identifier, so a mixed-license resource never silently becomes a single-license pick. `inspect` returns one record's links, license scope, cautions, install notes and any related Genlib module.

## Catalogs and guides

Each domain catalog has a guide with `Need | Pick | Why / when | License` tables. Read only the table you need.

<!-- genlib:catalog:start -->
| Catalog | Records | Guide | Main categories |
| --- | ---: | --- | --- |
| [`attachments.json`](../../resources/attachments.json) | 25 | [attachment-review.md](../../docs/resources/attachment-review.md) | animation, ui-components, design-inspiration, design-prompts, design-system-files |
| [`ui-foundations.json`](../../resources/ui-foundations.json) | 18 | [ui-libraries.md](../../docs/best-practices/ui-libraries.md) | ui-components, icons, data-ui |
| [`catalog/ai-agents.json`](../../resources/catalog/ai-agents.json) | 91 | [ai-agents.md](../../docs/resources/ai-agents.md) | model-sdk, agent-framework, local-inference, vector-database, llm-abstraction |
| [`catalog/backend-api.json`](../../resources/catalog/backend-api.json) | 95 | [backend-api.md](../../docs/resources/backend-api.md) | server-framework, orm, background-jobs, http-client, database |
| [`catalog/data-docs-office.json`](../../resources/catalog/data-docs-office.json) | 90 | [data-docs-office.md](../../docs/resources/data-docs-office.md) | charts, pdf, docs-sites, spreadsheets, diagrams |
| [`catalog/devops-testing-security.json`](../../resources/catalog/devops-testing-security.json) | 116 | [devops-testing-security.md](../../docs/resources/devops-testing-security.md) | testing, security, code-quality, observability, logging |
| [`catalog/frontend-web.json`](../../resources/catalog/frontend-web.json) | 89 | [frontend-web.md](../../docs/resources/frontend-web.md) | components, framework, styling, build-tool, state |
| [`catalog/media-automation.json`](../../resources/catalog/media-automation.json) | 89 | [media-automation.md](../../docs/resources/media-automation.md) | image-processing, workflow-automation, image-applications, video-processing, 3d-graphics |
| [`catalog/mobile-desktop-cli-game.json`](../../resources/catalog/mobile-desktop-cli-game.json) | 77 | [mobile-desktop-cli-game.md](../../docs/resources/mobile-desktop-cli-game.md) | desktop-framework, game-engine, cli-args, cli-output, mobile-framework |
| [`catalog/readme-tools.json`](../../resources/catalog/readme-tools.json) | 55 | [readme-tools.md](../../docs/resources/readme-tools.md) | readme-widget, readme-generator, readme-action, badge |
| [`catalog/saas-commerce-finance.json`](../../resources/catalog/saas-commerce-finance.json) | 102 | [saas-commerce-finance.md](../../docs/resources/saas-commerce-finance.md) | realtime, auth, payments, cms, commerce |
| [`catalog/ui-component-sources.json`](../../resources/catalog/ui-component-sources.json) | 3 | [ui-libraries.md](../../docs/best-practices/ui-libraries.md) | index, copy-paste-elements |
| **Total** | **850** | | |
<!-- genlib:catalog:end -->

Related guides: [UI libraries](../best-practices/ui-libraries.md) (copy-paste, animation, package and index tiers), [attachment review](attachment-review.md), [common APIs](../best-practices/common-apis.md), [commerce and browser](../best-practices/commerce-and-browser.md), [GitHub setup](../best-practices/github-setup.md) and [README/docs setup](../best-practices/readme-and-docs.md).

## Project types

Records list the Genisys project types they serve in `projectTypes`. The type list lives in [`resources/project-types.json`](../../resources/project-types.json).

<!-- genlib:types:start -->
| Project type | Records | Covers |
| --- | ---: | --- |
| `web-app` | 331 | Browser SPA or server-rendered app: routing, state, forms, data fetching, UI components. |
| `marketing-site` | 121 | Landing pages, blogs, static sites, SEO, analytics and CMS-backed content. |
| `mobile-app` | 50 | iOS/Android via native, React Native/Expo, Flutter or Capacitor. |
| `desktop-app` | 28 | Electron, Tauri or native desktop apps, packaging, auto-update and OS integration. |
| `api-backend` | 179 | HTTP/GraphQL/RPC services, validation, persistence, queues, caching and background jobs. |
| `cli-tool` | 38 | Argument parsing, prompts, output formatting, config files and distribution. |
| `ai-agent` | 106 | Model SDKs, tool calling, MCP servers, RAG, evaluation, prompt and token optimization. |
| `data-analytics` | 73 | Data loading, transformation, SQL engines, notebooks, charts and dashboards. |
| `ecommerce` | 23 | Catalog, cart, checkout, payments, tax, inventory and storefront platforms. |
| `saas` | 167 | Multi-tenant apps: auth, billing/subscriptions, email, feature flags, admin and audit. |
| `realtime-collab` | 19 | WebSockets, presence, CRDT/collaborative editing, chat and notifications. |
| `devops-infra` | 84 | CI/CD, containers, infrastructure as code, observability, secrets and deployment. |
| `testing-qa` | 49 | Unit, integration, end-to-end, visual, load and accessibility testing; mocking and fixtures. |
| `docs-knowledge` | 88 | Docs sites, API references, diagrams, search and markdown tooling. |
| `browser-automation` | 24 | Headless browsers, scraping within terms, workflow automation and RPA. |
| `office-documents` | 31 | PDF, Word, spreadsheet and presentation generation, parsing and conversion. |
| `media-creative` | 68 | Image processing, video editing/transcoding, audio, 3D and creative tooling. |
| `finance-accounting` | 42 | Money math, ledgers, invoicing, accounting APIs and financial data. |
| `legal-compliance` | 10 | Contracts, e-signature, privacy, consent, accessibility and policy tooling. |
| `game` | 25 | Game engines, 2D/3D rendering, physics, input and asset pipelines. |
| `security` | 45 | Crypto, secrets scanning, dependency auditing, auth hardening and threat checks. |
<!-- genlib:types:end -->

## Record fields and status

- `integrationMode`: `reference`, `selective-copy`, `package`, `service` or `license-review`. It records the adoption decision. It doesn't claim the source has been copied or installed.
- `verification`:
  - `verified`: the identity and source-level claims were reviewed by hand against primary material.
  - `partial`: either a specific scope, license or source question is still open (older records), or the record was checked automatically by `scripts/verify-resources.mjs` on its `reviewedAt` date. That check confirms the repository exists, the license npm, PyPI or crates.io reports matches the record, and the homepage and docs links resolve.
  - `unresolved`: not selectable as code.
  - None of these means the project passed an application build, security audit, device test or live provider test.
- `license-review`: copyleft, source-available, fair-code or custom terms (for example AGPL, SSPL, BUSL, Elastic, Sustainable Use, or a vendor license). Make a license decision before copying, embedding or offering the software as a service.
- `packages`: the primary installable package identities (`npm`, `pypi`, `crates`, `go`, `maven`, `nuget`, `gem`, `packagist`, `pub`, `swift`, `hex`, `github-action`, `docker`).
- `genlib.module`: set only when this checkout has callable original code for the resource.

Upstream code keeps its own license. Genlib's Apache-2.0 license covers only the original code in this repository. It doesn't relicense websites, screenshots, paid components, datasets, hosted services or another project's code. Before adopting a resource, pin the version, keep its notices, review dependency and service terms, and test the real integration.

## Maintaining the catalog

- Add records to the matching `resources/catalog/<domain>.json` file, or create a new domain file with its own guide under `docs/resources/`.
- Run `node tools/resources.mjs validate --json` and `node scripts/verify-resources.mjs --file <catalog>`. Fix or drop every failure, including deprecated or archived projects.
- Run `node scripts/sync-docs.mjs` so the count and catalog tables here and in the README stay current. `npm run check` fails when they drift.
- Validation rejects duplicate IDs, unknown project types, unsafe URLs, missing guides, fake module bindings and unresolved resources offered as packages.
- Keep all screenshot-derived records even when their right use is research or license review.
- Never add private customer code, private screenshots or credentials to this public catalog.
