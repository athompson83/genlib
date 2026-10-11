# Distribution: install Genlib through tools agents already use

Genlib's own CLI and MCP server are the richest path: they check compatibility, select the language and return checkable steps. Agents and teams that already use another tool can reach the same code through it. Every command below was run against the versions shown on 2026-10-11 unless it says otherwise.

| Route | What arrives | Command | Checked |
| --- | --- | --- | --- |
| shadcn registry | One TypeScript recipe or module, copied to `genlib/` | `npx shadcn@4.21.4 add athompson83/genlib/<item>` | Item JSON validated against the shadcn schema; `shadcn add` installed byte-identical files into a bare project from an item URL |
| Skills CLI | The `genlib-use` skill, for the coding agents the Skills CLI supports | `npx skills@1.7.2 add athompson83/genlib --skill genlib-use` | `--list` finds the skill |
| Microsoft APM | The `genlib-use` skill, locked by commit and file hashes | `apm.yml` entry below, then `apm install` | Installed into `.claude/skills/` with `apm.lock.yaml` |
| Context7 | Version-specific docs for an external library Genlib selected | the two `ctx7` commands in a resource's `docsLookup` | `zod` resolved to `/colinhacks/zod` and returned docs |
| Genlib CLI or MCP | Everything: capabilities in 9 languages, modules, integration packs, resources | `genlib quick <task>`, MCP `genlib_quick` | The test suite |

## shadcn registry (`registry.json`)

`registry.json` at the repository root lists every TypeScript recipe and every module as a shadcn `registry:item`. Each file has an explicit `~/genlib/...` target, so the shadcn CLI installs it into any TypeScript project without `components.json` or framework detection (supported since shadcn 2.9). File contents are not inlined, as the shadcn directory requires; the CLI reads each file from the repository. `npm run shadcn:build` regenerates the file and `npm run check` fails when it is stale.

```bash
npx shadcn@4.21.4 add athompson83/genlib/punycode          # one recipe -> genlib/punycode.ts
npx shadcn@4.21.4 add athompson83/genlib/org-invitations   # a module's three files -> genlib/org-invitations/
```

The CLI prints each item's `docs`: the recipe's integration checks, or the module's configuration points and a link to its contract. The shadcn route copies files only. It does not check compatibility, pick another language or record integrity hashes. Use `genlib plan`/`add` when you want those, and `genlib inspect <id>` for the full contract.

The GitHub form (`athompson83/genlib/<item>`) reads the default branch. Pin a reviewed version by installing from the item's raw URL at a commit, or with the Genlib CLI from a checkout at that commit.

## Agent skill (Skills CLI and APM)

The `genlib-use` skill teaches an agent the cheapest path: `quick`, then `outline`, then the returned command. Install it with either tool:

```bash
npx skills@1.7.2 add athompson83/genlib --skill genlib-use
```

```yaml
# apm.yml (Microsoft APM 0.33.0). Pin the commit you reviewed; APM warns about unpinned refs.
name: my-app
version: 1.0.0
targets:
  - claude
dependencies:
  apm:
    - athompson83/genlib/skills/genlib-use#<commit>
```

`apm install` writes the skill into `.claude/skills/genlib-use/` and records the commit and per-file SHA-256 hashes in `apm.lock.yaml`; `apm audit` reports drift. The skill still needs a Genlib checkout at `$GENLIB_ROOT` (or the MCP server) to run commands; see `skills/genlib-use/references/bootstrap.md`.

## Library documentation after selection (Context7)

Genlib chooses the implementation; Context7 can then supply that library's current, version-specific documentation. `tools/resources.mjs inspect <id>` and MCP `genlib_inspect` return a `docsLookup` for records that name a package:

```json
{ "context7": [
  "npx -y ctx7@0.6.0 library zod \"<task>\"",
  "npx -y ctx7@0.6.0 docs <library id from step 1>[/<installed version>] \"<task>\""
] }
```

The first command resolves the library ID, which Genlib never guesses. Pass the version you installed so the docs match it. Context7 answers without an API key at low volume; set `CONTEXT7_API_KEY` for higher limits. It is an external service: send it only the task words, never private code.

## What is not claimed

- jsrepo 3.8 reads shadcn-format items in its distributed mode, but its GitHub route expects a jsrepo `registry.json` built by `jsrepo build`. Genlib does not publish one, so no jsrepo command is documented.
- No APM or MCP-registry package is published for Genlib's MCP server. Run it from a checkout, as [agent-access.md](agent-access.md) shows.
- A shadcn install is a file copy. Behavior is established by the receiving project's own tests; Genlib's evidence for each module is in `genlib inspect <id>` (`verification.behaviors`, `command`, `environment`).
