# Install indexes: skills, MCP servers, CLIs and APIs

Four ranked indexes let an agent find a widely used tool and install it in one or two commands, instead of searching the web, reading install docs and guessing flags. Every entry carries its exact commands. Genlib never runs them.

| Index | File | Ranking signal | Find | Install shape |
| --- | --- | --- | --- | --- |
| Agent skills | `resources/skills.json` | skills.sh all-time installs (2026-10-10) | `genlib skill find <need>` | `npx skills@1.7.2 add <pinned url> -a claude-code -a codex -y` |
| MCP servers | `resources/mcp-servers.json` | Monthly npm/PyPI downloads, from the official MCP Registry | `genlib mcp find <need> --client claude\|codex\|both` | `claude mcp add <name> -e KEY=<KEY> -- npx -y <pkg>@<version>` and `codex mcp add … --env …` |
| CLIs | `resources/clis.json` | Homebrew install-on-request, last 365 days | `genlib cli find <need>` | `brew install <formula>` |
| APIs | `resources/apis.json` | Tranco rank of the provider domain, from the APIs.guru OpenAPI Directory | `genlib api find <need>` | Official SDK `npm install`, or a typed client from the spec with `openapi-typescript` / `openapi-python-client` |

`genlib find <task words>` searches all four alongside modules, recipes, templates and resources. Use `--type skill|mcp|cli|api` to narrow it. `genlib <index> inspect <id>` returns one full record.

## MCP servers

- **Ranked list (500):** the most-downloaded packaged servers from the [official MCP Registry](https://registry.modelcontextprotocol.io), one per package.
  - Commands pin the package version.
  - Required environment variables and arguments appear as `<PLACEHOLDER>` values to fill.
  - `npx` runs npm packages, `uvx` runs PyPI packages, and `docker run -i --rm` runs container images.
- **Hosted servers (up to 100, `rank: null`):** listed separately, one per domain, ordered by domain popularity.
  - Claude Code: `claude mcp add --transport http|sse <name> <url>`.
  - Codex: `codex mcp add <name> --url <url>`. Codex supports streamable HTTP only.
- Both clients write their own config: Claude Code uses `.mcp.json` / `~/.claude.json`; Codex uses `~/.codex/config.toml`. Add `--scope project` to Claude Code's command to share a server through `.mcp.json`.

## CLIs

The 500 Homebrew formulae users install most on purpose (dependencies don't count), with description, license and homepage. Homebrew covers macOS and Linux. On Windows use the tool's installer, winget or WSL. Keg-only formulae note the extra PATH step.

## APIs

- **Selection:** 500 APIs with machine-readable OpenAPI specs. At most five services per provider, and flagship services only for AWS, Google and Azure, so one cloud can't fill the list.
- **Official SDKs:** listed first where one exists on npm; 109 entries have one (for example `@aws-sdk/client-s3`, `googleapis`, `octokit`, `stripe`).
- **Without an SDK:** one command generates a typed client: `npm install openapi-fetch@0.17.0 && npx openapi-typescript@7.13.0 <spec> -o src/api/<id>.ts`. For Python: `uvx openapi-python-client@0.29.1 generate --url <spec>`.
- **Credentials:** keep them in server-side configuration (Genlib `env-config`) and call APIs from trusted server code.

## Safety and freshness

- Install counts and ranks are point-in-time snapshots from 2026-10-10. Packages and specs change, so regenerate the indexes rather than hand-editing ranks.
- Skills, MCP servers and CLIs run code with your permissions. Read the repository, required secrets and requested scopes before installing.
- Prefer servers and SDKs published by the vendor that owns the service.
