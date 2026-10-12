# Agent access: CLI, MCP, Jev, search index, graph and Obsidian

Genlib offers six ways for an agent to reach the code, tool, skill or doc it needs without reading the repository. They derive discovery metadata from the same catalogs. Pick the one that fits the harness and its required access.

Use the app's existing components and installed maintained libraries first, or a known Genlib component whose API, behavior, stack and dependencies fit. If discovery would help, make one bounded `quick` lookup and use its API/install handoff; no catalog lookup is required for every task. Use `outline` for missing signatures and inspect targeted source when integration, edits or repair need it. Prefer maintained libraries for security protocols. A copied component, a helper covering part of a feature and an external reference are distinct outcomes. Savings remain unproven for each task, and skipping Genlib is not a reuse saving; see [benchmarks.md](benchmarks.md).

When an external project's source is needed, `source <id> [--path dir]` returns steps to fetch only that folder at a pinned commit (`git fetch --depth 1 --filter=blob:none` plus sparse checkout), and names related Genlib implementations (`resources/equivalents.json`, also shown in `find` and `quick` results). Run those steps only within the existing task authorization. [token-budget.md](token-budget.md) reports serialized sizes, not measured task savings.

| Way | Best for | Entry point |
| --- | --- | --- |
| MCP server | Claude Code, Codex and any MCP client: native tool calls, no shell parsing. The dependency-free server is read-only discovery; the optional [direct SDK server](mcp-server.md) adds scoped planning, verification and opt-in installation | `bin/genlib-mcp.mjs` or `packages/genlib-mcp` |
| CLI | Shell-capable agents and scripts | `node bin/genlib.mjs quick <task> --target "$APP_ROOT"`, `find` (compact text, `--json` for full records), `outline <id>` |
| Jev packet | Typed-decision models (Genisys Jev): bounded yes/no selection | `genlib jev <task> --json`, or MCP `genlib_jev` |
| Search index | Harnesses with their own retrieval (exact lookup, embeddings, rerankers) or plain `grep` | `registry/search-index.jsonl` |
| Navigation graph | Graph views and Graphify-style traversal: which catalogs, categories, languages, capabilities and modules connect, and which code fulfills which feature contract | `registry/graph.json` |
| Obsidian vault | People and agents browsing linked notes: maps of content per type, category and language | `node scripts/export-obsidian.mjs --out <vault>/genlib` |

## MCP server

For OpenClaw, Hermes, Antigravity, VS Code, Cursor, OpenCode and other clients, run `genlib harness config <host>` to generate the correct native settings fragment. `harness install <host> --target <app>` installs the portable skill, and `harness doctor` checks real local MCP calls. The Ollama profile uses OpenCode as the MCP host. See [harness setup](harnesses.md) for all profiles and the distinction between documented configuration, tested protocol behavior and acceptance in a particular application.

The existing `bin/genlib-mcp.mjs` entry point is dependency-free and speaks stdio JSON-RPC 2.0 (MCP protocol versions 2025-06-18, 2025-03-26 and 2024-11-05). It performs local read-only discovery and accepts local project paths for compatibility detection. Use it only with trusted local clients. The optional [direct SDK server](mcp-server.md) includes the same compact quick/find/outline workflow plus bounded schemas and file pages, a configured project root, installation planning and verification, explicit startup write opt-in, and stdio/Streamable HTTP. Its project argument is relative `project`, not absolute `target`; use the connected tool schema. Choose one entry point per client server name. The table below describes the dependency-free server.

```sh
claude mcp add genlib -- node "$GENLIB_ROOT/bin/genlib-mcp.mjs" --tools quick,outline   # lean: 2 tool schemas
codex mcp add genlib -- node "$GENLIB_ROOT/bin/genlib-mcp.mjs"                          # all discovery tools
```

Tool schemas contribute to the model context, so register only what the agent uses: `--tools quick,outline` lists 2 tools instead of the full 10, and calls to tools it does not list are refused. The current full-list size is recorded in [token-budget.md](token-budget.md); serialization size is not a measurement of billed tokens in a host. `genlib connect` writes the lean pair unless given `--all-tools`.

Text output from the CLI and the dependency-free MCP tools names this checkout's real path in place of `"$GENLIB_ROOT"`, so a printed command runs as is; set the `GENLIB_ROOT` environment variable to keep the placeholder (the token report and generated indexes do). SDK tools retain placeholders: a remote caller may not have that server filesystem. Use the scoped SDK installation tools or a separately reviewed local checkout.

| Tool | Returns |
| --- | --- |
| `genlib_quick` | One-call reuse decision (about 1 KB): the best match and its acting commands; `reuse` (direct or partial) with the feature contract's verified requirements and what the app must add; the module's fixed behavior (`decisions`: routes, status codes, storage) and its changeable defaults (`options`, printed as `# options:`); size, files and destination (for a module with install profiles, `profiles` and a suggested `profile` already applied to the add command, printed as `# profiles:`; `parts` for a profile usable without the rest of the module, with its size and signatures, printed as `# parts:`, with the module's `# fixed` line then marked `(not parts)`). When the best match covers only part of the asked feature and one of the next three matches covers all of it (same feature contract), `quick` picks the full one; the main API and import path; required hooks; the verify step; up to 3 alternative refs. A small edit to existing code gets `status: "small-edit"` and no pick (cheapest call) |
| `genlib_jev` `prompt` | `prompt: true` returns the decision as a compact direct-call prompt in `text` (the structured packet stays in `structuredContent`). |
| `genlib_find` | Ranked results across every source type, each with its acting commands (and a capability's `caveat`, its main known limit, when it has one). Pass `target` or `language` to prefer a language; `detail: "full"` adds summaries, licenses and links. |
| `genlib_source` | A source-fetch command plan for the requested external path (or a raw-file URL), license notes and related Genlib implementations; it does not execute the fetch |
| `genlib_outline` | Public signatures and one-line docs of a capability, module, recipe or language example, with measured source and outline bytes |
| `genlib_jev` | The bounded `genlib.jev/v1` decision packet (see [jev.md](jev.md)); `stdlibOnly: true` (or a task that forbids dependencies) keeps only candidates that need no install |
| `genlib_capability` | Capability list, or one capability's copy commands for a language; with `language`, ordered `steps`, the available verification step (`verify`) and `onFailure` guidance. A hash or typecheck result is not app acceptance |
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
- The guidance sits between `<!-- GENLIB_START -->` and `<!-- GENLIB_END -->`; text outside the markers is never changed. It shares an optional reuse policy with both MCP servers: prefer existing app code and installed maintained libraries, reuse a known fitting component, and make one bounded lookup only when useful. Select by API, behavior, stack and dependencies; use targeted source inspection for integration or repair. There is no blanket line-count cutoff or requirement to query every task. Rerunning `connect --write` refreshes the managed guidance while preserving project text and settings.
- Nothing is written without `--write`. An existing `genlib` entry that differs, a JSONC config, invalid JSON or unbalanced markers are reported as conflicts and stop the whole run.
- `.genlib/connections.json` records what was written. `--remove` deletes only entries that still match it and files Genlib created; an edited entry is a conflict.
- No tool approvals are added: allowing tools without prompts stays a decision for the app's owner.

## Navigation graph (Graphify-style)

`registry/graph.json` (`genlib.graph/v1`) has nodes for the root, source types, resource guides, categories, languages, capabilities, modules, integration packs, feature contracts and documentation files. Its counted links include `contains`, `serves`, `grouped-by`, `has-category`, `in-language`, `includes`, `implemented-in`, `documented-by` and `section-of`; `fulfills` links run from code to a feature contract, weighted by the number of requirements its tests verify (the same evidence `genlib coverage` and `quick`'s `# reuse` line use).

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
