# Module authoring format

Each module lives in `modules/<id>/`. It contains `module.json`, `CONTRACT.md`, and source under `files/`. The registry build adds file hashes; never enter placeholder hashes in authored manifests.

The [authoring JSON Schema](../schemas/module.schema.json) supports editor validation. The registry builder also checks relationships and filesystem properties that a schema cannot establish, including exact dependency versions, export targets, safe files, and content integrity.

```json
{
  "schemaVersion": 1,
  "id": "example-module",
  "version": "0.1.0",
  "title": "Example module",
  "description": "A concise capability description, not implementation source.",
  "kind": "component",
  "tags": ["example"],
  "license": "Apache-2.0",
  "source": {
    "type": "original",
    "repository": "https://github.com/athompson83/genlib",
    "path": "modules/example-module"
  },
  "compatibility": {
    "frameworks": ["react"],
    "languages": ["typescript"],
    "platform": "web",
    "reactMajors": [18, 19],
    "notes": ["Requires React and a TypeScript/TSX build pipeline."]
  },
  "dependencies": [],
  "files": [
    { "source": "files/Example.tsx", "target": "example-module/Example.tsx" }
  ],
  "exports": [{ "name": "Example", "from": "example-module/Example.tsx" }],
  "configuration": ["Describe supported props or adapter interfaces."],
  "capabilities": ["example"],
  "limitations": ["Describe what this module does not provide."],
  "verification": {
    "level": "experimental",
    "testFiles": ["tests/example-module.test.mjs"]
  },
  "contract": "CONTRACT.md"
}
```

Dependencies refer only to other local registry modules, using objects such as `{"id":"theme-tokens","version":"0.1.0"}`. Framework-neutral modules use `frameworks: ["any"]` and omit `reactMajors`.

The default installation root is `src/genlib` inside an existing target directory. File targets are relative to that root. Cross-module imports must use paths relative to their final installed location. The installer does not rewrite source, run hooks, install packages, or configure external services.

`verification.level` is `experimental` until meaningful behavior tests pass, then `tested`. `tested` describes this repository's checks, not production certification of every consuming application. The consumer must test the integrated feature.

Optional maintenance evidence travels with the module, and `genlib inspect <id>` returns it:

| Field | Meaning |
| --- | --- |
| `verification.behaviors` | The behaviors the tests verify, one line each (for example "exactly one of several concurrent accepts wins") |
| `verification.command` | The exact command that runs those tests |
| `verification.environment` | Tool names mapped to the versions the tests ran on (`{"node": "22", "typescript": "7.0.2"}`) |
| `changelog` | `[{version, changes[]}]`, newest first; the first entry must be the current `version`. Mark breaking changes in the text |
| `deprecated` | `{reason, replacement?}` with a replacement module id when one exists |

The registry build rejects malformed evidence, a changelog that does not start at the current version, and a non-id replacement. Evidence describes this repository's tests, not the consuming application.

## Install profiles

`profiles` (optional) names groups of the module's own `files` sources, so an app copies only what it wires:

```json
"profiles": { "core": ["files/core.ts"], "memory": ["files/memory-store.ts"], "sql": ["files/sql-store.ts", "files/schema.sql"], "http": ["files/http.ts"] }
```

Names match `[a-z][a-z0-9-]*`, a module has at most 8 profiles, every listed source must be in `files`, and together the profiles must cover every file; the registry build rejects anything else. Feature modules with a core/store/HTTP split use `core` (the core file plus what it imports), `memory`, `sql` (store and `schema.sql`) and `http`, plus one profile per remaining file (`transports`, `client`).

`genlib plan|add <id> --profile core,memory` installs the union of the named profiles plus every module file those files import (relative imports are followed, so a profile cannot miss a dependency), and refuses with `UNRESOLVED_IMPORT` if an import resolves to neither a module file nor a dependency module's file. Without `--profile` every file installs, as before. Module `dependencies` always install fully. The chosen profiles are recorded in the lock; adding, updating, verifying and removing follow it ([lifecycle.md](lifecycle.md#after-installing-receipts-updates-and-rollback)). `genlib quick` prints `# profiles:` and suggests `--profile core,memory,http` (those present) on its add command.

`plan` and `add` print `wiring`: the first ```` ```ts ```` block under `## Integration points` in `CONTRACT.md`, with import specifiers of module files rewritten to the installed path relative to the app root (`./src/genlib/<id>/core.js`, or `.ts` with `--ts-imports`). Imports of files the selection did not install are omitted with the statements built on them, and a `// not installed: <names> (add --profile <name>)` line names what to add; installed files the example does not import get an `// also: import { ... }` line from `exports`. The snippet is cut at 40 lines. Keep that block a complete, minimal wiring example with imports written as `./genlib/<id>/<file>.js`.

## Database files

`decisions` (optional, 1 to 4 strings of at most 120 characters) lists the behavior the module fixes that a task may contradict: routes and prefixes, status codes, storage and token handling, default limits. `genlib quick` prints them on its `# fixed:` line so an agent can decide to reuse, wire only the core, or write the feature in one call. State facts from the module's own code; never describe intent.

A feature package that needs storage may ship a `schema.sql` (PostgreSQL) and a SQL store next to its store interface, as `org-invitations`, `comments`, `rbac`, `password-reset`, `short-links`, `site-search`, `email-outbox`, `web-push`, `chat`, `soft-delete`, `api-keys`, `account-deletion`, `tenant-isolation`, `audit-log`, `email-signup`, `two-factor`, `file-uploads`, `webhook-delivery`, `scheduled-tasks`, `csv-download`, `url-slugs`, `keyset-pagination`, `nearby-search`, `feature-rollout` and `recurring-events` do. Also credit the module in the matching feature contracts ([coverage.md](coverage.md)). List both in `files`; the installer copies them like any other file and never runs migrations. Test the SQL against a real engine (the repository uses PGlite, a WASM build of PostgreSQL, as a devDependency), record it in `verification.environment` (`{"postgres": "PGlite 0.5.8"}`), and include concurrency cases for every state change that must happen once. Keep the SQL store's executor shape (`query(text, params)` and an optional `transaction(fn)`) so apps can pass `pg`, `postgres.js`, Drizzle or Neon clients through a small adapter.

## After installation

`add` writes `.genlib/receipts/<id>.json`. Bumping a module's version is what `genlib update` merges into receiving apps, so keep file targets stable between versions where possible: a renamed target is delivered as a new file plus a deletion of the old one (or `keep-removed-upstream` when it was edited). Record the change in `changelog`.

## Erasable TypeScript

Module, recipe and integration-pack TypeScript must run after type erasure alone, because apps copy it into projects that run `.ts` with Node's type stripping, Deno or Bun: no constructor parameter properties, enums or namespaces. The repository build, the recipe compile in `tests/recipes.test.mjs` and every pack's tsconfig set `erasableSyntaxOnly`, so `npm run check` fails on them. Relative imports keep the `.js` extension a NodeNext build expects; `genlib add --ts-imports` rewrites them to `.ts` in the copy for apps without a build ([lifecycle.md](lifecycle.md)).
