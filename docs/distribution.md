# Distribution: install Genlib through tools agents already use

Genlib's own CLI and MCP server are the richest path: they check compatibility, select the language and return checkable steps. Agents and teams that already use another tool can reach the same code through it. Every command below was run against the versions shown on 2026-10-11 unless it says otherwise.

| Route | What arrives | Command | Checked |
| --- | --- | --- | --- |
| shadcn registry | One TypeScript recipe or module, copied to `genlib/` | `npx shadcn@4.21.4 add athompson83/genlib/<item>` | Item JSON validated against the shadcn schema; `shadcn add` installed byte-identical files into a bare project from an item URL |
| Skills CLI | The `genlib-use` skill, for the coding agents the Skills CLI supports | `npx skills@1.7.2 add athompson83/genlib --skill genlib-use` | `--list` finds the skill |
| Microsoft APM | The `genlib-use` skill, locked by commit and file hashes | `apm.yml` entry below, then `apm install` | Installed into `.claude/skills/` with `apm.lock.yaml` |
| Context7 | Version-specific docs for an external library Genlib selected | the two `ctx7` commands in a resource's `docsLookup` | `zod` resolved to `/colinhacks/zod` and returned docs |
| Into Genlib from shadcn registries | Any shadcn-format item (ui.shadcn.com or another registry) and its registry dependencies, adopted with Genlib's plan, lock and receipt | `genlib registry plan\|add shadcn:<name> --target app` | Offline tests with fixture items; `shadcn:login-01` (7 items) planned, added, adopted, drift-checked and removed against ui.shadcn.com on 2026-10-11 |
| Genlib CLI or MCP | Everything: capabilities in 9 languages, modules, integration packs, resources | `genlib quick <task>`, MCP `genlib_quick` | The test suite |

## shadcn registry (`registry.json`)

`registry.json` at the repository root lists every TypeScript recipe and every module as a shadcn `registry:item`. Each file has an explicit `~/genlib/...` target, so the shadcn CLI installs it into any TypeScript project without `components.json` or framework detection (supported since shadcn 2.9). File contents are not inlined, as the shadcn directory requires; the CLI reads each file from the repository. `npm run shadcn:build` regenerates the file and `npm run check` fails when it is stale.

```bash
npx shadcn@4.21.4 add athompson83/genlib/punycode          # one recipe -> genlib/punycode.ts
npx shadcn@4.21.4 add athompson83/genlib/org-invitations   # a module's three files -> genlib/org-invitations/
```

The CLI prints each item's `docs`: the recipe's delivery caveat and integration checks, or the module's configuration points and a link to its contract. Authored recipe titles describe what the code supplies. The shadcn route copies files only. It does not check compatibility, pick another language or record integrity hashes. Use `genlib plan`/`add` when you want those, and `genlib inspect <id>` for the full contract.

The GitHub form (`athompson83/genlib/<item>`) reads the default branch. Pin a reviewed version by installing from the item's raw URL at a commit, or with the Genlib CLI from a checkout at that commit.

## Adopting shadcn-format items into an app (`genlib registry`)

The other direction: Genlib reads items from ui.shadcn.com or any registry that serves registry-item JSON, and adopts them with the same protections as its own modules.

```bash
node "$GENLIB_ROOT/bin/genlib.mjs" registry plan shadcn:login-01 --target "$APP_ROOT"          # no writes
node "$GENLIB_ROOT/bin/genlib.mjs" registry add shadcn:login-01 --target "$APP_ROOT" --sha256 <hex>
node "$GENLIB_ROOT/bin/genlib.mjs" adopted shadcn--login-01 --target "$APP_ROOT" --test "npm test"
node "$GENLIB_ROOT/bin/genlib.mjs" registry verify --target "$APP_ROOT"
node "$GENLIB_ROOT/bin/genlib.mjs" registry update shadcn--login-01 --target "$APP_ROOT"   # dry run; --write applies
node "$GENLIB_ROOT/bin/genlib.mjs" registry remove shadcn--login-01 --target "$APP_ROOT"
```

- **Resolve.** Items and their `registryDependencies` are fetched over https only, with a 1 MB cap per item, cycle and depth limits, and no redirect away from https. Each item's SHA-256 is recorded; `--sha256` pins the root item, because registry URLs are not versioned.
- **Plan.** Files map to the app's aliases from `components.json`, then `tsconfig` paths, then `src/` or the root. Imports of `@/registry/<style>/...` are rewritten to those aliases, as the shadcn CLI does. Each file is `create`, `identical` or `conflict`. The plan lists the packages to install as one command, including packages the files import without the item declaring them (for example `class-variance-authority` in `button`), plus CSS variables and environment variables to add by hand. Explicit `target` paths (pages) are written as given, relative to the project root.
- **Add.** Writes only a conflict-free plan (`--keep-existing` keeps your differing files and leaves them unowned). Files are created exclusively, never overwritten. Ownership is recorded in `.genlib/providers-lock.json`, each item's original JSON in `.genlib/providers/`, and a receipt per item in `.genlib/receipts/shadcn--<name>.json`.
- **Afterwards.** `adopted` counts application imports, not registry files importing each other. `registry verify` reports drift, and `registry remove` keeps edited files and refuses while another installed item depends on the one being removed.

`registry update shadcn--<name> --target app [--write] [--conflict rej|inline]` fetches the registry's current version. It replaces unedited files and three-way merges edited ones against the stored original. Conflicts are written to `<file>.genlib-conflict` (or inline markers). New registry dependencies are reported for `registry add` rather than added silently. It is a dry run unless `--write`.

Genlib never runs the package manager or the shadcn CLI, and it does not merge CSS.

## Agent skill (Skills CLI and APM)

The `genlib-use` skill makes reuse optional: check the app's existing code and libraries, use a known suitable item directly, or make a bounded `quick` lookup when helpful. Read the selected contract, handoff and any source needed to integrate, then run the app's checks. These steps are not a measured savings guarantee; see the [focused reuse plan](focused-reuse.md). Install the skill with either tool:

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
