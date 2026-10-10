# Genlib

**A versioned source registry for reusable application features, with a coding skill for Claude Code, Codex, and other harnesses.**

Genlib lets a coding agent search compact descriptions, inspect a feature's integration contract, and copy reviewed source into an application. The agent can then concentrate on the project's data, behavior, permissions, and appearance instead of generating the same implementation again. The installed source belongs in the receiving application's normal development workflow and remains editable.

The library contains thirteen original Apache-2.0 modules, task recipes, cross-language examples, project-to-release templates, a local CLI with one `find` command across all of them, integrity and provenance records, a portable `genlib-use` skill, and a reviewed external-resource catalog with project templates. Genlib itself is usable independently of Genisys and requires no hosted service, model API, paid account or MCP server. Calling an optional provider client requires that provider's authorized configuration. Token savings are a goal to measure against completed, accepted features; this release does not claim a savings percentage.

## Included modules

All modules are version `0.1.0`. Their `tested` status means the repository's relevant behavior checks pass; it does not certify a consuming application's integration or live provider connection.

| Module | Included behavior | Application responsibilities |
| --- | --- | --- |
| [`theme-tokens`](modules/theme-tokens/CONTRACT.md) | Framework-neutral light/dark CSS variables for colors, typography, spacing, and shape | Map variables to the Brand Kit or existing design system; import CSS explicitly |
| [`app-shell`](modules/app-shell/CONTRACT.md) | React header, navigation, responsive menu, skip link, and main-content layout | Supply routes, active state, content, and access rules; adapt routing if needed |
| [`data-table`](modules/data-table/CONTRACT.md) | Typed React table with client-side search, stable sorting, pagination, and empty states | Supply already-authorized rows, columns, stable IDs, and custom rendering; use a separate design for large server-queried datasets |
| [`validated-form`](modules/validated-form/CONTRACT.md) | React form state, injected validation/submission, error summary, busy state, and duplicate-submit protection | Render fields, provide validators and submission adapters, and enforce validation and authorization on the server |
| [`notification-preferences`](modules/notification-preferences/CONTRACT.md) | Preference form, strict TypeScript domain validation, Fetch client, and a Request/Response handler with revision conflicts | Configure types/channels, authenticated identity and tenant authorization, allowed origins, and durable atomic persistence; connect actual notification delivery separately |
| [`common-api-clients`](modules/common-api-clients/CONTRACT.md) | Server-side HTTP transport and clients for GitHub, Stripe, Resend, Supabase, Microsoft Graph, Google Calendar, OpenAI, Anthropic, Saleor and Steel | Configure trusted credentials, endpoint/API versions, authorization, scopes, spending and live acceptance; install only into a server package |

| [`env-config`](modules/env-config/CONTRACT.md) | Typed, fail-fast environment validation from any record (`process.env`, Workers `env`, `import.meta.env`), secret redaction and `.env.example` rendering | Declare every variable the app reads; load secrets from the platform's secret store |
| [`structured-logger`](modules/structured-logger/CONTRACT.md) | JSON-lines logger with levels, child bindings, key-based redaction, bounded error serialization and request IDs | Choose the sink and retention; review the redaction list for the app's data |
| [`http-resilience`](modules/http-resilience/CONTRACT.md) | Retry with exponential backoff and jitter for idempotent requests, `Retry-After`, timeouts and a circuit breaker | Decide which operations are idempotent and supply idempotency keys for writes |
| [`rate-limit`](modules/rate-limit/CONTRACT.md) | Token-bucket and window limiters with a pluggable atomic store and standard 429/`RateLimit-*` headers | Derive trustworthy client keys; use a shared store (for example Redis) across instances |
| [`webhook-verification`](modules/webhook-verification/CONTRACT.md) | Web Crypto signature checks for GitHub, Stripe and Standard Webhooks with timestamp tolerance, secret rotation and capped raw-body reads | Keep secrets server-side, verify before parsing, de-duplicate deliveries |
| [`health-checks`](modules/health-checks/CONTRACT.md) | Fetch-standard `/healthz` liveness and `/readyz` readiness handlers with concurrent, time-limited checks | Supply real dependency checks and route them; keep details off public networks |
| [`security-headers`](modules/security-headers/CONTRACT.md) | CSP builder with nonces, HSTS, framing, referrer and permissions policies applied to any `Response` | Tune the CSP to the app's actual script, style and connect sources |
The seven server utilities use only web-standard APIs (Fetch `Request`/`Response`, Web Crypto, `AbortSignal`), so the same source targets Node.js 22+, Bun, Deno, Cloudflare Workers, Next.js route handlers, Hono and similar runtimes; repository tests run on Node.js.

`app-shell`, `data-table`, and `validated-form` depend on `theme-tokens`; the installer resolves and copies that exact local dependency automatically. Import the CSS files described in each contract. Installing files does not edit the application's imports or connect its services.

## Resources and best practices

The [resource catalog](docs/resources/README.md) includes **25 resources from the ten uploaded images** and **18 additional UI foundations**. Each record carries primary-source links, license scope, platform fit, reuse guidance and review limits. The [attachment review](docs/resources/attachment-review.md) maps every image to the named resources. Source references are distinct from Genlib code and do not imply the external packages or services are installed.

```sh
node tools/resources.mjs search dropdown --platform web --mode package --limit 5 --json
node tools/resources.mjs search icons --license MIT --limit 5 --json
node tools/resources.mjs inspect mapcn --json
node tools/resources.mjs inspect steel-browser --json
node tools/resources.mjs validate --json
```

| Section | Reusable contents |
| --- | --- |
| [GitHub setup and filtering](docs/best-practices/github-setup.md) | Folder conventions, Git ignores/attributes, partial/sparse checkout, search filters, ownership, dependency updates and path-aware CI |
| [README and docs setup](docs/best-practices/readme-and-docs.md) | README, architecture, contributing/security, API reference, decision records, deployment/rollback and verification templates |
| [Common APIs with code](docs/best-practices/common-apis.md) | Installable provider clients, required configuration, authorization boundaries, idempotency and local usage examples |
| [Commerce and browser APIs](docs/best-practices/commerce-and-browser.md) | Saleor catalog queries and Steel session lifecycle with failure/recovery contracts |
| [UI libraries](docs/best-practices/ui-libraries.md) | Sources for icons, buttons, navigation, menus, dropdowns, dialogs, forms, tables, maps, motion and platform-specific controls |

| [Repository-to-release map](docs/lifecycle.md) | Which Genlib asset covers each stage from `git init` to a shipped release |

| Template set | Contents |
| --- | --- |
| [`templates/project`](templates/project/README.md) | Strict NodeNext `tsconfig`, runtime pin, reference `ci:verify` scripts, `.env.example` |
| [`templates/github`](templates/github/README.md) | Git ignores/attributes, editorconfig, CODEOWNERS, PR/issue forms, Dependabot, path-aware CI |
| [`templates/docs`](templates/docs/README.md) | README, architecture, contributing, security, API, decision record and runbooks |
| [`templates/ship`](templates/ship/README.md) | Non-root Dockerfile, tag-driven GitHub release, GHCR image with SBOM/provenance, CodeQL, changelog |

Templates live under [`templates/`](templates) and are inactive until deliberately adopted. They require project-specific values and actual verification commands; they do not modify repository settings or replace existing files. The Claude/Codex skill routes agents to these sources with small, filtered reads. See [the addition's verification record](docs/RESOURCE_UPDATE_VALIDATION.md).

## Requirements and scope

- **CLI:** Node.js **22 or later**, an existing local application directory, and a trusted Genlib checkout. The CLI uses Node built-ins and requires **no `npm install`**.
- **React modules:** The target's existing **React 18 or 19**, TypeScript/TSX tooling, and a browser application. They do not supply a React installation or native mobile components.
- **Theme tokens:** Framework-neutral CSS, usable without React.
- **Notification server adapter:** Standard Fetch `Request`/`Response` APIs, tested with Node 22+. The receiving framework owns route registration and its authorization and database adapters.
- **Common API clients:** TypeScript with Fetch, streams, AbortController and Web Crypto on a trusted Node 22+ server. No runtime packages or automatic credential discovery. These are explicit calls, not OAuth/SSO provisioning or native application adapters.

This repository is currently consumed from source, not as a published npm package. Each checkout exposes one selected version per module. Pin the reviewed Git commit to reproduce that catalog and its source.

## Quick start

The examples below use a POSIX shell. Replace the application path with an **existing application package directory outside the Genlib checkout**. In a monorepo, select the package that declares React, rather than automatically selecting the repository root. Use equivalent environment-variable syntax in PowerShell.

### 1. Obtain a reviewed checkout

```sh
git clone https://github.com/athompson83/genlib.git
cd genlib
export GENLIB_ROOT="$PWD"
export APP_ROOT="/absolute/path/to/existing-application"
git rev-parse HEAD
```

Review the checkout before executing its tools. For repeatable builds, check out the specific reviewed commit before continuing. A recorded hash identifies a baseline; it is not an independent signature or an approval of untrusted code.

### 2. Find candidates for the task, then inspect one contract

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find searchable table --target "$APP_ROOT" --limit 5 --json
node "$GENLIB_ROOT/bin/genlib.mjs" detect --target "$APP_ROOT" --json
```

`find` ranks modules, task recipes, language examples, templates, code-navigation tools (repository map, AST graph, diagram) and external resources together. Module results list their installed files and exports so an agent opens only the entry points it needs. With `--target` it detects the project's stack from its manifests, marks each result `compatible` or `review`, hides known mismatches, and fills the target into each result's `next` commands. Module-only search remains available:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" search table --framework react --limit 5 --json
node "$GENLIB_ROOT/bin/genlib.mjs" inspect data-table --json
```

`search` returns concise matches. `inspect` returns the selected module's compatibility, exports, dependencies, limitations, and full contract in its `contract` field. It does not dump all source. Use `list --json` when you need the small catalog overview, and read implementation files only when integration requires them.

### 3. Plan the exact file changes

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" plan data-table --target "$APP_ROOT" --json
```

Review the compatibility result, dependency modules, paths, and conflicts. `plan` writes nothing. The default source destination is `src/genlib`; use the same `--out relative/path` for `plan` and `add` if the project needs another supported source directory.

### 4. Install and verify the baseline

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" add data-table --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" verify --target "$APP_ROOT" --json
```

The installer copies source and license notices and writes `.genlib/lock.json` with module versions, manifest hashes, original file hashes, and the checkout's revision and modification status when Git metadata is available. It runs no package managers or module hooks and makes no network requests.

Import the component and its CSS using the [data-table contract](modules/data-table/CONTRACT.md), then connect the project's data and Brand Kit. Run the receiving application's build and relevant behavior tests. `verify` compares files with the recorded baseline; it does **not** test application correctness. After deliberate customization it reports `drift`, identifies changed files, and exits with status 1. Preserve that baseline and review the intended changes instead of replacing its hashes to conceal them.

Run `node "$GENLIB_ROOT/bin/genlib.mjs" help` for all commands. Output is JSON; `--json` selects compact output.

## Claude Code and Codex skill

Install the portable workflow into the application project:

```sh
node "$GENLIB_ROOT/scripts/install-skills.mjs" --target "$APP_ROOT" --harness both
```

| Harness | Installed project discovery path | Explicit invocation |
| --- | --- | --- |
| Codex | `.agents/skills/genlib-use/SKILL.md` | Mention `$genlib-use` in the task |
| Claude Code | `.claude/skills/genlib-use/SKILL.md` | Invoke `/genlib-use` |

Use `--harness codex` or `--harness claude` for a single harness. Complete supporting references travel with the skill. The installer preserves target `AGENTS.md`, `CLAUDE.md`, other skills, and harness settings; identical copies are idempotent, and conflicting copies are refused. It installs into the project only.

Provide `GENLIB_ROOT` to the harness's execution environment as the absolute path to the separate trusted checkout. The skill itself is small and does not contain the module library. A cloud environment needs its own accessible checkout and installed project skill. Other harnesses can use the same canonical workflow through their supported Agent Skills mechanism; installation and discovery remain harness-specific.

Example task for Codex:

```json
{
  "task": "Use $genlib-use to integrate a searchable records table into this application.",
  "genlib_root": "/absolute/path/to/genlib",
  "requirements": [
    "Follow this project's instructions and preserve existing work.",
    "Use its Brand Kit, existing React installation, and authorization rules.",
    "Plan the copy, adapt only the necessary integration, and verify the resulting behavior."
  ]
}
```

See [harness setup](docs/harnesses.md) for discovery details, personal versus project locations, and skill maintenance.

## Safe reuse and updates

Genlib rejects unsafe paths, symlinks, integrity failures, and conflicting files. For React modules, recognized incompatible React versions, React Native targets, and another declared UI framework without React are rejected. `--allow-unverified` is only for missing or unrecognized compatibility after an independent project check; it does not override a recognized mismatch or bypass integrity and overwrite protection.

Re-running `add` is idempotent for an unchanged, recorded installation. Existing untracked source, customized files, changed module manifests, and another recorded version or output location require explicit review. There is no force-overwrite or automatic-upgrade command. Retain `.genlib/lock.json` and the installed notices in version control, inspect upstream and local changes, and perform a deliberate migration when updating.

Reusable UI does not supply application permissions. In particular, `notification-preferences` requires a real authorization adapter and a durable store with atomic compare-and-set semantics scoped to both user and tenant. The test-only store is an example, not production persistence. Client filtering is not access control, and the preference feature does not send notifications.

The initial registry accepts original Apache-2.0 modules with accurate provenance. It does not import arbitrary GitHub repositories or automatically approve third-party licenses. Keep private customer implementations in their permitted scope.

## Develop and contribute

Development dependencies are for compiling and testing the modules. Maintainers can install them from the committed lockfile and run the complete checks:

```sh
cd "$GENLIB_ROOT"
npm ci --ignore-scripts
npm run check
```

`check` verifies generated registry freshness, skill mirrors and resource catalog bindings, compiles TypeScript, and runs the test suite. When modifying authored modules or the canonical skill, regenerate the relevant artifacts before checking:

```sh
npm run registry:build
npm run skills:sync
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [module format](docs/module-format.md), and [architecture](docs/architecture.md). Source is licensed under [Apache-2.0](LICENSE); retain [NOTICE](NOTICE) and applicable attribution when redistributing it.
