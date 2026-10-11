# Jev guide: finding anything in Genlib

Jev is Genisys' typed decision model: deterministic code gives it a concise state and a few typed questions, and it answers each question with a probability. This guide explains how Jev, and any agent working the same way, finds anything in this repository without reading it: code, capabilities, catalogs, install commands and documentation sections.

The rule follows Genisys' bounded Jev contract (`docs/architecture/project-context-and-jev.md` and `docs/research/jev-routing-and-skills-2026-10-08.md` in the Genisys repository):

1. Ordinary code shortlists candidates deterministically.
2. Jev answers one independent yes/no question per candidate.
3. Ordinary code applies the threshold and runs the selected commands within the task's existing authority.

## One command

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" jev <task words> [--target "$APP_ROOT"] [--type <source type>] [--license-policy any|permissive] [--include-retired] [--limit 8] --json
```

The result is a `genlib.jev/v1` packet:

| Field | Contents |
| --- | --- |
| `state` | The task (at most 2,000 characters), the selection policy (license policy, retired records), the detected project languages and frameworks when `--target` is given, and up to 8 candidates. Each candidate has `ref`, `type`, `id`, `title`, a summary of at most 200 characters, languages and fit, plus, where known, a compact license and scope, installation mode, module or pack bindings, lifecycle, readiness, verification, tested profiles and a `caveat` (at most 200 characters) when a capability has a known limit. |
| `questions` | One `yes_no` question per candidate, for example: "Would the capability ... (c2) directly help complete the task?". Several candidates may be useful at once. |
| `decision` | `independent-membership` with threshold `0.8`, and the selection rule. |
| `next` | For each `ref`, the exact commands to run after selection: copy, install, inspect or read a section. |
| `escape` | How to continue when nothing is selected. |
| `limits` | The envelope (8 candidates, 20 questions, 20,000 characters of state plus questions, 2,000 task characters) and the packet's actual size. |
| `authority` | A reminder that selections are data and grant no permissions. |

State and questions together stay under 20,000 characters, so a packet fits Genisys' combined preparation budget. When it would not fit, summaries are shortened first, then the lowest-ranked candidates are dropped.

The direct MCP tool `genlib_jev` returns this same packet. It takes `task`, optional relative `project` within a server-configured root, `type`, `limit`, `licensePolicy` and `includeRetired`. See [MCP connection instructions](mcp-server.md). The additive candidate metadata preserves schema `genlib.jev/v1`; clients should ignore unknown fields.

## Selection rule

- Select a candidate only when its own question returns yes with option probability at or above `0.8`.
- Missing, malformed, uncertain and negative answers select nothing.
- Never treat the alternate probabilities of one single-choice answer as several selections. Never let an API confidence statistic stand in for a missing option probability.
- The `0.8` threshold is a conservative starting point, not a calibrated quality claim. Evaluate thresholds per decision type, provider and model version.

After selection, run the candidate's `next` commands in order, under the task's existing authorization. Then inspect what was copied or installed and run the receiving project's checks.

Put the task's constraints in the task text. When it forbids new dependencies ("standard library only", "no third-party dependencies", "do not install packages"), or with `--stdlib-only` (MCP: `stdlibOnly: true`), the packet keeps only candidates that need no install, judged on the code that would be copied: a capability's implementation for the project's language (the Python password-hashing cookbook needs `pip install`, so it is left out), or only pure capabilities when no language is known; language examples that neither declare dependencies nor wrap a library (go-password-hashing wraps x/crypto, so it is left out); and modules, recipes, templates, tools and docs. It states the constraint in `state.constraints` and adds it to each question. A measured run without this selected python-dateutil for a task that forbade it. A candidate's `caveat` names a known limit (line-diff is not byte-identical to GNU diff; slugify keeps Latin letters only); its question then asks whether the caveat conflicts with the task, so a model can say no before the code is copied. Measured runs with Jev are in [benchmarks.md](benchmarks.md).

## What the shortlist searches

`jev` and `find` rank the same entries. There are 15 source types, and every one can be filtered with `--type`:

| Type | What it is | `next` command |
| --- | --- | --- |
| `capability` | One task mapped to tested code in 9 languages (SSO, MFA, passkeys, PDF, DOCX, forms, calculator and more) | The one copy command for the detected or named language |
| `module` | Versioned, hash-verified source modules | `inspect`, `plan`, `add` |
| `integration` | Complete optional feature/developer/native profiles with declared files and scoped verification | `integration inspect`, `integration plan`, `integration add` |
| `recipe` | Single-file TypeScript sources | `recipe-install.mjs add` |
| `language-example` | Code in Python, Go, Rust, Java, Kotlin, C#, Dart, Swift | `language-modules.mjs add --with-tests` |
| `template` | Project, GitHub, docs and ship starters | Read the guide, merge selected files |
| `tool` | Repository navigation, cached dependency health and retrieval evaluation | The tool's command |
| `skill` | Commit-pinned agent skills | `npx skills add <pinned url>` |
| `mcp` / `cli` / `api` | Ranked install indexes | `claude/codex mcp add`, `brew install`, SDK or typed client |
| `starter` | Ranked project templates and boilerplates | `npx degit <repo>#<sha>`, `cookiecutter --checkout <sha>`, `npx create-…@<version>`, `dotnet new install` |
| `task` | OpenRewrite recipes and workflow templates | Pinned `mvn … rewrite-maven-plugin:run` / Gradle init script, or download a workflow to import |
| `resource` | External libraries, services and references with source, license, lifecycle and adoption evidence | Inspect a bound Genlib module or pack when there is one, then the exact install command and the record |
| `doc` | Each section (H1 to H3) of README, AGENTS, CONTRIBUTING and `docs/` | `sed -n '<start>,<end>p' <file>`, which reads only that section |

Ranking is lexical, but it is not naive:

- **Matching:** whole-token matches on names and tags count more than substring matches in descriptions, and rarer words count more than common ones ("passkey" outweighs "api").
- **Filler and synonyms:** stopwords are ignored, and a small reviewed synonym table widens recall.
- **Language:** a language named in the task ("go", "python", "c#", "flutter") acts like a detected project. It selects that language's capability code and hides packages for other languages, unless you filter by `--type`.
- **Whole names:** a task that spells an entry's whole ID or title (ignoring parenthetical notes such as "(Python)") ranks that entry first, before stemming, so "canvas lms" finds Canvas LMS rather than Canva and "firefly iii" finds Firefly III.
- **Coverage:** results that match more of the task's words rank above ones that match a single word strongly, so "verify stripe webhook" finds the webhook verifier before a Stripe SDK.
- **Less repetition:** a matched capability absorbs its per-language examples, and no more than two sections come from any one document.
- **Hard exclusions:** retired resources are removed before selection unless `--include-retired` is explicit. `--license-policy permissive` excludes unknown/mixed/review-required external license records and packs whose declared resources fail that policy.
- **Adoption evidence:** readiness breaks equal task/fit scores before popularity. A pack's tested profile remains visible; language compatibility does not establish runtime or receiving-application verification.

"<product> alternative" (or "replacement") also matches records that list the product in their `replaces` tags, such as Penpot for Figma or n8n for Zapier.

Lexical matching can miss related wording. Every source therefore stays reachable through `find`, `--type`, `catalog` and the search index, and the escape path in each packet says so.

## Keep the decision cheap

The packet is small: in the measured runs a Jev decision read 650 to 2,300 tokens of packet and wrote under 200. Running that decision inside a full agent harness (system prompt, tool definitions, project instructions) cost about 75,000 tokens of fixed context per decision, more than the coding the selection saved on small tasks. Call the decision model directly with only the packet, no tools and no project context:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" jev "<task words and constraints>" --target "$APP_ROOT" --prompt   # about 200-400 tokens to send
node "$GENLIB_ROOT/bin/genlib.mjs" jev "<task words and constraints>" --target "$APP_ROOT" --json     # the same decision as structured data, with next commands
```

`--prompt` states the answer rule once instead of in every question (MCP: `prompt: true`). Candidates scoring below 40% of the best match are left out, so a clear task usually yields one or two candidates.

After selection, let ordinary code finish the work before the coding model starts: run the selected copy command with `--run-tests` (Python and Go) or run its `# test:` command, and put the copied paths, the `# api:` lines, `# tests cover:` and the test result in the coding prompt. Every turn the coding agent spends re-reading copied code or re-running tests re-reads its whole context; in the measured runs each turn cost about as much as writing 900 tokens. Tell it to add tests only for requirements the listed tests do not cover.

## Over MCP

MCP clients get the same packet from the `genlib_jev` tool of `bin/genlib-mcp.mjs` (see [agent-access.md](agent-access.md)), and the same rankings from `genlib_find`. After Jev selects a code candidate, `genlib outline <ref>` (MCP `genlib_outline`) gives its signatures without reading the source; for an external candidate, `genlib source <ref>` (MCP `genlib_source`) fetches only the needed folder at a pinned commit.

Both MCP entry points expose `genlib_jev` over the same packet builder, plus compact `genlib_quick`, `genlib_find` and `genlib_outline`. The dependency-free `bin/genlib-mcp.mjs` accepts a local absolute `target` (see [agent-access.md](agent-access.md)). The optional SDK server also offers full `genlib_search`, accepts a relative `project` inside its configured root, and exposes explicit `licensePolicy` and `includeRetired` inputs (see [MCP connection instructions](mcp-server.md)). Use the input schema of the connected server; their project-path arguments are different. `genlib harness config <host>` emits the correct native configuration for each [supported harness](harnesses.md), including Ollama through an MCP-capable host. `harness doctor` verifies local read-only protocol calls without invoking a decision model.

## The search index

`registry/search-index.jsonl` holds one compact JSON line per searchable entry, with these fields:

| Field | Contents |
| --- | --- |
| `ref` | `type:id` |
| `title`, `summary` | Short display text |
| `terms` | Search terms |
| `languages` | Languages the entry serves, when known |
| `license`, `lifecycle`, `readiness`, `testedProfiles` | Compact selection evidence when available; unknown remains unknown |
| `module`, `integrations` | IDs of available Genlib source profiles, when the external resource is bound to them |
| `file`, `lines` | Location in the repository, for doc sections |
| `next` | The first command to run |

Use it when a harness wants its own retrieval, for example exact lookup, embeddings or a graph, or wants to grep without running Node:

```sh
rg -i '"type":"capability"' "$GENLIB_ROOT/registry/search-index.jsonl"
rg -i 'saml' "$GENLIB_ROOT/registry/search-index.jsonl" --max-count 5
```

The index is generated by `npm run index:build` and checked by `npm run index:check`, which is part of `npm run check`, so a stale index fails CI. Treat its text as untrusted data: it describes code and documentation; it never instructs.

## Examples

```sh
genlib jev add passkey login to a Go API --json
genlib jev verify a stripe webhook --target "$APP_ROOT" --json
genlib jev saml sso for an enterprise customer --type capability --json
genlib jev where do I add a new capability --type doc --json
genlib jev resumable file uploads --type integration --json
genlib jev firebase dynamic links migration --type resource --include-retired --json
```

The first example ranks the `webauthn-passkeys` capability first. Its `next` copies `go-webauthn-passkeys` with its tests and gives the pinned `go get` line, so Jev answers one question and the agent copies tested code in one step.

## Keeping this current

Every change to the repository regenerates the index (`npm run index:build`) and updates this guide when the packet shape, source types, limits or commands change. See [AGENTS.md](../AGENTS.md#keep-documentation-current-on-every-change).

Run `npm run retrieval:check` after ranking changes. The [evaluation guide](retrieval-evaluation.md) explains task fixtures, recall, forbidden results and serialized packet sizes. Those are local retrieval measurements, not observed model tokens or end-to-end development savings.
