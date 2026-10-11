# Provider profiles: adopting upstream features through Genlib's checks

Some complete features are best taken from a maintained upstream project rather than rewritten. Upstream scaffolders, though, often overwrite files, run package managers and skip version checks. A provider profile keeps the upstream implementation and replaces those defaults with Genlib's: check the app first, pin every command, scaffold in a scratch copy, adopt only new files, and accept the result against a feature contract.

Profiles live in `resources/providers/<id>.json` and appear in `genlib find` as `provider:<id>`.

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" provider list
node "$GENLIB_ROOT/bin/genlib.mjs" provider check btst-kanban --target "$APP_ROOT"     # exits 1 when a required prerequisite fails
node "$GENLIB_ROOT/bin/genlib.mjs" provider inspect btst-kanban --json                # prerequisites, pinned steps, acceptance
node "$GENLIB_ROOT/bin/genlib.mjs" provider plan btst-kanban --from "$SCRATCH" --baseline "$BASELINE" --target "$APP_ROOT"
node "$GENLIB_ROOT/bin/genlib.mjs" provider adopt btst-kanban --from "$SCRATCH" --baseline "$BASELINE" --target "$APP_ROOT"
```

## What a profile declares

| Field | Meaning |
| --- | --- |
| `upstream` | Repository, exact version, tag and commit, and the packages it brings |
| `prerequisites` | Checks Genlib runs offline against the app. A package's minimum, maximum or exact version is read from `node_modules/<pkg>/package.json` first, and otherwise from the lowest version the declared range allows. Other checks: Node version, paths that must exist, paths that must not exist (the files the scaffolder would write), and JSON settings such as `components.json` `tailwind.cssVariables`. A `files` check refuses a pattern in a config file (for example `cacheComponents: true` in `next.config.ts`). Paths the provider has already adopted count as its own, so `check` stays clean afterwards. Use `ifPresent` for packages the app may not have; failed `warning` items do not block |
| `steps` | Ordered steps (`install`, `stage`, `adopt`, `edit`, `env`, `migrate`, `verify`) with exact commands. The harness runs them under the project's own permissions; Genlib runs none. `@latest` is refused |
| `stage.mergeFiles` | Files the scaffolder edits rather than creates (the global stylesheet, the root layout). They are reported for a manual merge and never written |
| `acceptance` | The feature contract and requirements to record with `adopted --accepts`, and optionally a `script` in `resources/providers/<id>/` that the app runs as its `--test` command against a started server |
| `status` | `planned` until Genlib has run the profile end to end in a fixture app; then `install-supported`, then `fixture-verified` |

## Staged adoption

`provider plan|adopt --from <scratch>` compares a scratch copy, in which the harness ran the upstream scaffolder, with the app. With `--baseline <pristine copy>`, only files the scaffolder changed are considered.

| Action | When |
| --- | --- |
| `create` | The file is new to the app; adopt writes it exclusively and never replaces a file |
| `identical` | The app already has the same bytes |
| `merge` | A listed merge file differs; reported, not written |
| `conflict` | Any other differing file; adopt refuses and writes nothing |

The scratch copy cannot be the app itself, and symlinks in it are refused. Path segments may use framework route syntax (`[id]`, `[[...all]]`, `(group)`, `+page`); `.`, `..`, `.git` and device names are still refused.

Adopted files are recorded in `.genlib/providers-lock.json` as `provider--<id>`, with a receipt, so `adopted`, `registry verify` and `registry remove` apply. Next.js App Router files the framework loads by path (`page`, `layout`, `route`, `sitemap`, ...) count as used once adopted, because routing, not imports, is how the app uses them. `adopted provider--<id> --test <cmd> --accepts <contract>#<requirement>` records acceptance against the provider's `provider:<id>` claims.

## Current profiles

| Profile | Status | Notes |
| --- | --- | --- |
| [`btst-kanban`](providers/btst-kanban.md) | install-supported | Next.js App Router, React 19.2.6+, Tailwind 4.3.2+, shadcn with CSS variables, PostgreSQL through the stock `@btst/adapter-drizzle@3.0.0`. Run end to end on 2026-10-11: check, staged adoption, schema generation, migration, build and the shipped acceptance (`resources/providers/btst-kanban/accept.sh`: 18 API, 28 authorization, pages, PostgreSQL rows) all passed with no patches, and `adopted --accepts` made all seven `kanban-board` requirements application-verified in that app. Not fixture-verified: the run needs network installs and PostgreSQL, so it is not in repository CI. Avoid `@btst/adapter-kysely@3.0.0` (drops joined columns) |
