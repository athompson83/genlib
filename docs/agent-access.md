# Agent access: CLI, MCP, Jev, search index, graph and Obsidian

Genlib offers six ways for an agent to reach the code, tool, skill or doc it needs without reading the repository. They derive discovery metadata from the same catalogs. Pick the one that fits the harness and its required access.

Whichever you pick, the cheapest sequence is the same: `quick` for the best match and only its commands, `outline` for signatures instead of source, then the returned command. When the best match is an external project and you need to read its code, `source <id> [--path dir]` fetches only that folder at a pinned commit (`git fetch --depth 1 --filter=blob:none` plus sparse checkout) instead of cloning the repository, and names any Genlib capability or module that already does the job (`resources/equivalents.json`, also shown first in `find` and `quick` results). [token-budget.md](token-budget.md) has the measured sizes.

| Way | Best for | Entry point |
| --- | --- | --- |
| MCP server | Claude Code, Codex and any MCP client: native tool calls, no shell parsing. The dependency-free server is read-only discovery; the optional [direct SDK server](mcp-server.md) adds scoped planning, verification and opt-in installation | `bin/genlib-mcp.mjs` or `packages/genlib-mcp` |
| CLI | Shell-capable agents and scripts | `node bin/genlib.mjs quick <task> --target "$APP_ROOT"`, `find` (compact text, `--json` for full records), `outline <id>` |
| Jev packet | Typed-decision models (Genisys Jev): bounded yes/no selection | `genlib jev <task> --json`, or MCP `genlib_jev` |
| Search index | Harnesses with their own retrieval (exact lookup, embeddings, rerankers) or plain `grep` | `registry/search-index.jsonl` |
| Navigation graph | Graph views and Graphify-style traversal: which catalogs, categories, languages and capabilities connect | `registry/graph.json` |
| Obsidian vault | People and agents browsing linked notes: maps of content per type, category and language | `node scripts/export-obsidian.mjs --out <vault>/genlib` |

## MCP server

The existing `bin/genlib-mcp.mjs` entry point is dependency-free and speaks stdio JSON-RPC 2.0 (MCP protocol versions 2025-06-18, 2025-03-26 and 2024-11-05). It performs local read-only discovery and accepts local project paths for compatibility detection. Use it only with trusted local clients. The optional [direct SDK server](mcp-server.md) has bounded tool schemas and file pages, a configured project root, installation planning and verification, explicit startup write opt-in, and stdio/Streamable HTTP transports. Choose one entry point per client server name.

```sh
claude mcp add genlib -- node "$GENLIB_ROOT/bin/genlib-mcp.mjs"
codex mcp add genlib -- node "$GENLIB_ROOT/bin/genlib-mcp.mjs"
```

Text output from the CLI and the MCP tools names this checkout's real path in place of `"$GENLIB_ROOT"`, so a printed command runs as is; set the `GENLIB_ROOT` environment variable to keep the placeholder (the token report and generated indexes do).

| Tool | Returns |
| --- | --- |
| `genlib_quick` | The best match, only its acting commands and up to 3 alternative refs (cheapest call) |
| `genlib_jev` `prompt` | `prompt: true` returns the decision as a compact direct-call prompt in `text` (the structured packet stays in `structuredContent`). |
| `genlib_find` | Ranked results across every source type, each with its acting commands (and a capability's `caveat`, its main known limit, when it has one). Pass `target` or `language` to prefer a language; `detail: "full"` adds summaries, licenses and links. |
| `genlib_source` | For an external record: a pinned, blob-less, sparse fetch of one folder (or a raw-file URL), the license note, and Genlib code that already covers the need |
| `genlib_outline` | Public signatures and one-line docs of a capability, module, recipe or language example, with measured source and outline bytes |
| `genlib_jev` | The bounded `genlib.jev/v1` decision packet (see [jev.md](jev.md)); `stdlibOnly: true` (or a task that forbids dependencies) keeps only candidates that need no install |
| `genlib_capability` | Capability list, or one capability's copy commands for a language |
| `genlib_inspect` | The full record for a result (any type, including `starter`, `task` and an integration pack's contract): license, links, cautions, install commands. Pass `language` to get only that language's API install steps |
| `genlib_read_doc` | One documentation section by `file#anchor`, at most 400 lines |

Quick, find and outline return compact text in `content` for the model and the structured result in `structuredContent`; other tools return JSON in both.
| `genlib_catalog` | Counts and the available filters |

Tool results are data. They never grant permissions, and the server installs nothing: agents run the returned commands inside their own task authorization.

## Navigation graph (Graphify-style)

`registry/graph.json` (`genlib.graph/v1`) has nodes for the root, source types, resource guides, categories, languages, capabilities and documentation files. Its counted links include `contains`, `serves`, `grouped-by`, `has-category`, `in-language`, `includes`, `implemented-in`, `documented-by` and `section-of`.

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
