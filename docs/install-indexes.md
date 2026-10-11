# Install indexes: skills, MCP servers, CLIs, APIs, starters and task recipes

Six ranked indexes let an agent find a widely used tool and install it in one or two commands, instead of searching the web, reading install docs and guessing flags. Every entry carries its exact commands. Genlib never runs them.

| Index | File | Ranking signal | Find | Install shape |
| --- | --- | --- | --- | --- |
| Agent skills | `resources/skills.json` | skills.sh all-time installs (2026-10-10) | `genlib skill find <need>` | `npx skills@1.7.2 add <pinned url> -a claude-code -a codex -y` |
| MCP servers | `resources/mcp-servers.json` | Monthly npm/PyPI downloads, from the official MCP Registry | `genlib mcp find <need> --client claude\|codex\|both` | `claude mcp add <name> -e KEY=<KEY> -- npx -y <pkg>@<version>` and `codex mcp add … --env …` |
| CLIs | `resources/clis.json` | Homebrew install-on-request, last 365 days | `genlib cli find <need>` | `brew install <formula>` |
| Project starters | `resources/starters.json` | GitHub stars of the source repository, then registry downloads | `genlib starter find <need>` | `npx degit <owner>/<repo>#<sha> my-app`, `uvx cookiecutter … --checkout <sha>`, `npx create-…@<version>`, `dotnet new install <pack>::<version>` |
| Task recipes | `resources/task-recipes.json` | Per source: OpenRewrite recipe-graph importance, n8n template views | `genlib task find <need>` | `mvn … rewrite-maven-plugin:<version>:run -Drewrite.activeRecipes=<recipe>` (or a one-line Gradle init script), `curl` an n8n template to import |
| APIs | `resources/apis.json` | Tranco rank of the provider domain, from the APIs.guru OpenAPI Directory | `genlib api find <need>` | Official SDK `npm install`, or a typed client from the spec with `openapi-typescript` / `openapi-python-client` (Swagger 2.0 specs converted first); `--language` keeps the receiving language's steps |

`genlib find <task words>` searches all six alongside modules, recipes, templates and resources. Use `--type skill|mcp|cli|api|starter|task` to narrow it. Without `--json`, each `find` prints one line and the install steps per result. `genlib <index> inspect <id>` returns one full record.

## MCP servers

- **Ranked list (2,943):** packaged servers from the [official MCP Registry](https://registry.modelcontextprotocol.io), one per package: npm and PyPI servers with at least 1,000 downloads in the last month, by downloads, then container-only servers (no download signal) in registry order.
  - Commands pin the package version. The 15 records whose registry entry said `latest` were resolved on 2026-10-11 (`pinnedAt`). npm packages are pinned to the exact version. Container images are pinned to their declared version tag when the registry has it, plus the image digest (`image:1.0.0@sha256:…`), so the code that runs is the code that was reviewed.
  - Required environment variables and arguments appear as `<PLACEHOLDER>` values to fill.
  - `npx` runs npm packages, `uvx` runs PyPI packages, and `docker run -i --rm` runs container images.
- **Hosted servers (699, `rank: null`):** listed separately, one per domain, ordered by domain popularity.
  - Claude Code: `claude mcp add --transport http|sse <name> <url>`.
  - Codex: `codex mcp add <name> --url <url>`. Codex supports streamable HTTP only.
- **Local names are unique.** Installing two servers with the same local name would overwrite one in the client's config. When several records share a name (`gitlab`, `postgres`), the highest-ranked keeps it, and the others get `<name>-<owner>` from their registry namespace (`gitlab-vish288`, `postgres-pgedge`). `node scripts/mcp-index.mjs` maintains both rules: `--pin` resolves `latest` over the network, and `--check`, run by `npm run check`, fails on a `latest` tag or a shared name.
- Both clients write their own config: Claude Code uses `.mcp.json` / `~/.claude.json`; Codex uses `~/.codex/config.toml`. Add `--scope project` to Claude Code's command to share a server through `.mcp.json`.

## CLIs

The 1,500 Homebrew formulae users install most on purpose (dependencies don't count), with description, license and homepage. From rank 501, formulae without executables (libraries) and third-party taps are skipped. Homebrew covers macOS and Linux. On Windows use the tool's installer, winget or WSL. Keg-only formulae note the extra PATH step.

## APIs

- **Selection:** 2,526 APIs with machine-readable OpenAPI specs: every service in the APIs.guru OpenAPI Directory, one entry each, ranked by the provider's Tranco rank (unranked providers last). The first 500 keep the original cap of five services per provider; from rank 501 large providers contribute all their services (Azure 653, Google 282, AWS 271 in total).
- **Official SDKs:** listed first where one exists on npm; 1,115 entries have one (AWS SDK v3 clients, `@azure/arm-*`, `googleapis`, `twilio`, `@adyen/api-library`, `octokit` and others, each checked on npm) (for example `@aws-sdk/client-s3`, `googleapis`, `octokit`, `stripe`).
- **Without an SDK:** one command generates a typed client: `npm install openapi-fetch@0.17.0 && npx openapi-typescript@7.13.0 <spec> -o src/api/<id>.ts`. For Python: `uvx openapi-python-client@0.29.1 generate --url <spec>`.
- **Swagger 2.0 specs (1,008 records):** both generators read OpenAPI 3.x only and fail on a Swagger 2.0 URL, so these records convert the spec first: `mkdir -p openapi && npx swagger2openapi@7.0.8 <spec> -o openapi/<id>.json`, then generate from the local file (`--path` for Python). This was checked on `microsoft-com-cognitiveservices-websearch` and `instagram-com`: both generators failed on the raw URLs, and after conversion the TypeScript compiled under `--strict` and every generated Python module imported.
- **Derived steps:** `install` is derived from `spec`, `openapiVersion` and `sdk` by `lib/api-install.mjs`. Run `node scripts/api-install.mjs` after editing records; a test fails when stored steps drift. Spec URLs containing spaces or parentheses are percent-encoded so each command stays valid shell.
- **Retired services:** `resources/api-lifecycle.json` lists retired APIs, each with the provider's notice: all ten Bing Search clients (retired 2025-08-11), Firebase Dynamic Links (2025-08-25), Google+ (2019-03-07) and Cloud Debugger (2023-05-31). `node scripts/api-install.mjs` copies each entry into the record's `lifecycle` field. Such a record then gets one migration line instead of install steps, and search scores it ×0.3, so a live API comes first. `resourceIds` applies the same treatment to catalog packages that only wrap the retired service, such as the seven Firebase Dynamic Links packages. Add an entry only with a primary-source notice.
- **Receiving language:** `genlib api find|inspect --language <lang>`, `genlib find --language`/`--target`, and MCP `genlib_inspect` with `language` keep only the steps for that language: the npm SDK and TypeScript client for TypeScript or JavaScript, the Python client for Python. For any other language they return one line pointing at the provider docs and the spec instead of npm or pip commands. `genlib find` then also lists language-matched SDK resources such as `stripe-go-go`.
- **Credentials:** keep them in server-side configuration (Genlib `env-config`) and call APIs from trusted server code.

## Project starters

- **2,818 starters** in 28 languages: 2,326 repository starters copied with `degit` at a pinned commit (1,147 are GitHub template repositories and also get `gh repo create --template`), 241 `dotnet new` template packs, 100 cookiecutters, 89 `create-*` CLIs, 54 framework generators (Rails, Laravel, Phoenix, Django, Spring Initializr, very_good_cli, cargo-generate and others) and 3 curated directories.
- Ranked by the GitHub stars of the source repository (for CLIs and generators, the repository that publishes them); archived repositories, forks and repositories without a push since 2023-10-10 are skipped.
- 695 are marked `license-review` (no license, copyleft or non-OSI). A starter copies third-party code into your project: read its license and keep the pinned commit.

## Task recipes

- **OpenRewrite (2,584):** framework migrations (Spring Boot, Jakarta EE, JUnit, Java versions), static analysis, security, logging and build fixes. Each record names the recipe and pins the Maven plugin (6.46.1), the Gradle plugin (7.39.0) and the recipe module to the last versions published on Maven Central (OpenRewrite moved newer releases behind a login in August 2026; `latestVersion` names them). 1,708 are under the Moderne Source Available License and marked `license-review`. Run them on a clean branch and review the diff.
- **n8n (1,000)** most-viewed workflow templates and **Activepieces (420)** templates: download, then import into your instance. They are community content (`license-review`); read every node and credential before enabling one.
- **Also:** Salesforce `lwc-recipes` components (132), Claude cookbook notebooks (97) and the awesome-workflow-engines directory, each at a pinned commit.

## Safety and freshness

- Install counts and ranks are point-in-time snapshots from 2026-10-10. Packages and specs change, so regenerate the indexes rather than hand-editing ranks.
- Skills, MCP servers and CLIs run code with your permissions. Read the repository, required secrets and requested scopes before installing.
- Prefer servers and SDKs published by the vendor that owns the service.
