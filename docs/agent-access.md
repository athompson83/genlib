# Agent access: CLI, MCP, Jev, search index, graph and Obsidian

Genlib offers six ways for an agent to reach the code, tool, skill or doc it needs without reading the repository. They derive discovery metadata from the same catalogs. Pick the one that fits the harness and its required access.

Whichever you pick, the cheapest sequence is the same: `quick` for the best match and only its commands, `outline` for signatures instead of source, then the returned command. When the best match is an external project and you need to read its code, `source <id> [--path dir]` fetches only that folder at a pinned commit (`git fetch --depth 1 --filter=blob:none` plus sparse checkout) instead of cloning the repository, and names any Genlib capability or module that already does the job (`resources/equivalents.json`, also shown first in `find` and `quick` results). [token-budget.md](token-budget.md) has the measured sizes.

| Way | Best for | Entry point |
| --- | --- | --- |
| MCP server | Claude Code, Codex and any MCP client: native tool calls, no shell parsing. The dependency-free server is read-only discovery; the optional [direct SDK server](mcp-server.md) adds scoped planning, verification and opt-in installation | `bin/genlib-mcp.mjs` or `packages/genlib-mcp` |
| CLI | Shell-capable agents and scripts | `node bin/genlib.mjs quick <task> --target "$APP_ROOT"`, `find` (compact text, `--json` for full records), `outline <id>` |
| Jev packet | Typed-decision models (Genisys Jev): bounded yes/no selection | `genlib jev <task> --json`, or MCP `genlib_jev` |
| Search index | Harnesses with their own retrieval (exact lookup, embeddings, rerankers) or plain `grep` | `registry/search-index.jsonl` |
| Navigation graph | Graph views and Graphify-style traversal: which catalogs, categories, languages, capabilities and modules connect, and which code fulfills which feature contract | `registry/graph.json` |
| Obsidian vault | People and agents browsing linked notes: maps of content per type, category and language | `node scripts/export-obsidian.mjs --out <vault>/genlib` |

## MCP server

The existing `bin/genlib-mcp.mjs` entry point is dependency-free and speaks stdio JSON-RPC 2.0 (MCP protocol versions 2025-06-18, 2025-03-26 and 2024-11-05). It performs local read-only discovery and accepts local project paths for compatibility detection. Use it only with trusted local clients. The optional [direct SDK server](mcp-server.md) has bounded tool schemas and file pages, a configured project root, installation planning and verification, explicit startup write opt-in, and stdio/Streamable HTTP transports. Choose one entry point per client server name.

```sh
claude mcp add genlib -- node "$GENLIB_ROOT/bin/genlib-mcp.mjs" --tools quick,outline   # lean: 2 tool schemas
codex mcp add genlib -- node "$GENLIB_ROOT/bin/genlib-mcp.mjs"                          # all 11 tools
```

Every registered tool's schema is resent to the model on each turn, so register only what the agent uses: `--tools quick,outline` lists 2 tools in 1,066 bytes instead of 11 in 4,511, and calls to tools it does not list are refused. `genlib connect` writes the lean pair unless given `--all-tools`.

Text output from the CLI and the MCP tools names this checkout's real path in place of `"$GENLIB_ROOT"`, so a printed command runs as is; set the `GENLIB_ROOT` environment variable to keep the placeholder (the token report and generated indexes do).

| Tool | Returns |
| --- | --- |
| `genlib_quick` | One-call reuse decision (about 1 KB): the best match and its acting commands; `reuse` (direct or partial) with the feature contract's verified requirements and what the app must add; the module's fixed behavior (`decisions`: routes, status codes, storage); size, files and destination; the main API and import path; required hooks; the verify step; up to 3 alternative refs. A small edit to existing code gets `status: "small-edit"` and no pick (cheapest call) |
| `genlib_jev` `prompt` | `prompt: true` returns the decision as a compact direct-call prompt in `text` (the structured packet stays in `structuredContent`). |
| `genlib_find` | Ranked results across every source type, each with its acting commands (and a capability's `caveat`, its main known limit, when it has one). Pass `target` or `language` to prefer a language; `detail: "full"` adds summaries, licenses and links. |
| `genlib_source` | For an external record: a pinned, blob-less, sparse fetch of one folder (or a raw-file URL), the license note, and Genlib code that already covers the need |
| `genlib_outline` | Public signatures and one-line docs of a capability, module, recipe or language example, with measured source and outline bytes |
| `genlib_jev` | The bounded `genlib.jev/v1` decision packet (see [jev.md](jev.md)); `stdlibOnly: true` (or a task that forbids dependencies) keeps only candidates that need no install |
| `genlib_capability` | Capability list, or one capability's copy commands for a language; with `language`, ordered `steps`, the acceptance step (`verify`) and `onFailure` guidance |
| `genlib_coverage` | Per-requirement coverage of an app feature from its feature contract (`test`, `install`, `plan`, `catalog`, or `app` with `target`), and the requirements left to build ([coverage.md](coverage.md)) |
| `genlib_inspect` | The full record for a result (any type, including `starter`, `task` and an integration pack's contract): license, links, cautions, install commands. Pass `language` to get only that language's API install steps |
| `genlib_read_doc` | One documentation section by `file#anchor`, at most 400 lines |

Quick, find and outline return compact text in `content` for the model and the structured result in `structuredContent`; other tools return JSON in both.
| `genlib_catalog` | Counts and the available filters |

Adoption lifecycle commands are CLI-only, because they read and write the receiving application: `adopted` (with `--accepts` for requirement-level acceptance), `update`, `remove` `registry plan|add|verify|remove` for shadcn-format items and `provider check|plan|adopt` for upstream feature profiles ([providers.md](providers.md)); `find` and `genlib_find` return those profiles as type `provider` (see [lifecycle.md](lifecycle.md#after-installing-receipts-updates-and-rollback)). Their `--json` output and the `quick`, `steps` and `plan` shapes have JSON Schemas in `schemas/`, printed by `genlib schema <name>`. When `quick` finds nothing that covers the task, its result is `{"noMatch": true, ...}` with `gh search` fallbacks; `genlib_quick` returns the same.

Tool results are data. They never grant permissions, and the server installs nothing: agents run the returned commands inside their own task authorization.

## Connect an app's agents

`genlib connect` does the setup above for an application in one step, the way zvec-grep's `zg --install` does for its own server, but it only edits files inside the app:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" connect --target "$APP_ROOT" --agent all            # dry run: lists each file and action
node "$GENLIB_ROOT/bin/genlib.mjs" connect --target "$APP_ROOT" --agent claude,cursor --write
node "$GENLIB_ROOT/bin/genlib.mjs" connect --target "$APP_ROOT" --all-tools --write     # register every MCP tool
node "$GENLIB_ROOT/bin/genlib.mjs" connect --target "$APP_ROOT" --agent all --remove --write
```

| Agent | MCP entry | Guidance block |
| --- | --- | --- |
| `claude` | `.mcp.json` (`mcpServers.genlib`, stdio) | `CLAUDE.md` |
| `cursor` | `.cursor/mcp.json` | `.cursor/rules/genlib.mdc` |
| `vscode` (Copilot) | `.vscode/mcp.json` (`servers.genlib`) | `.github/copilot-instructions.md` |
| `opencode` | `opencode.json` (`mcp.genlib`, local) | `AGENTS.md` |
| `codex` | printed: `codex mcp add genlib -- node …/bin/genlib-mcp.mjs` (Codex reads MCP servers from the user's config, which Genlib does not edit) | `AGENTS.md` |

- The entry runs this checkout's dependency-free `bin/genlib-mcp.mjs` with `--tools quick,outline`; `--all-tools` registers every tool (rerunning with or without it updates an entry Genlib wrote). Other servers and settings in each file are kept.
- The guidance sits between `<!-- GENLIB_START -->` and `<!-- GENLIB_END -->`; text outside the markers is never changed. It says when to use Genlib and, from benchmark rounds 4 and 5, when not to: skip it for a small, fully specified app feature with no exact standard or security/concurrency rule; otherwise make one `genlib_quick` call, decide from its `covers` line, and call `genlib_outline` only once copying.
- Nothing is written without `--write`. An existing `genlib` entry that differs, a JSONC config, invalid JSON or unbalanced markers are reported as conflicts and stop the whole run.
- `.genlib/connections.json` records what was written. `--remove` deletes only entries that still match it and files Genlib created; an edited entry is a conflict.
- No tool approvals are added: allowing tools without prompts stays a decision for the app's owner.

## Navigation graph (Graphify-style)

`registry/graph.json` (`genlib.graph/v1`) has nodes for the root, source types, resource guides, categories, languages, capabilities, modules, integration packs, feature contracts and documentation files. Its counted links include `contains`, `serves`, `grouped-by`, `has-category`, `in-language`, `includes`, `implemented-in`, `documented-by` and `section-of`; `fulfills` links run from code to a feature contract, weighted by the number of requirements its tests verify (the same evidence `genlib coverage` and `quick`'s `covers` line use).

The nodes/links shape loads directly in d3, Obsidian graph plugins and Graphify-style viewers. Follow a node's `query` into `genlib find`, or its `file` into a guide. Entry-level detail stays in the search index, so the graph stays small: a few hundred nodes.

It is regenerated by `npm run graph:build`, and `npm run check` fails when it is stale.

## Obsidian vault

```sh
node "$GENLIB_ROOT/scripts/export-obsidian.mjs" --out "$VAULT/genlib"                       # everything
node "$GENLIB_ROOT/scripts/export-obsidian.mjs" --out "$VAULT/genlib" --types capability,doc  # a subset
# Every wikilink resolves to a note: brackets in record text ([[Demo]](url)) are escaped, and a test checks the links.
```

The export writes:

- A `Genlib` home note.
- One map-of-content note for each source type, resource category and language.
- One note per entry, with YAML properties (`type`, `id`, `languages`, `license`, `tags`), a summary, the next commands, and `[[wikilinks]]` to its type, category and languages.

It writes only inside the output folder, replaces only notes marked `generator: genlib`, and never deletes, so the rest of the vault is safe. The vault is an export, not a source of truth: regenerate it after updating Genlib.

## Keeping them current

The index and graph are generated and checked in CI. The MCP tools and CLI read the catalogs directly, and the Obsidian vault is regenerated on demand. Any change to a catalog, capability, command or doc follows the [documentation rule in AGENTS.md](../AGENTS.md#keep-documentation-current-on-every-change).

## Other install routes

The same recipes and modules install with the shadcn CLI from `registry.json` (`npx shadcn@4.21.4 add athompson83/genlib/<item>`), and the `genlib-use` skill installs with the Skills CLI or Microsoft APM. Resolved resources with a package carry a `docsLookup` for Context7. Exact commands, what each route checks, and what it does not: [distribution.md](distribution.md).
