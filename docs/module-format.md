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

## Database files

A feature package that needs storage may ship a `schema.sql` (PostgreSQL) and a SQL store next to its store interface, as `org-invitations`, `comments`, `rbac`, `password-reset`, `short-links`, `site-search`, `email-outbox`, `web-push`, `chat`, `soft-delete`, `api-keys`, `account-deletion`, `tenant-isolation` and `audit-log` do. Also credit the module in the matching feature contracts ([coverage.md](coverage.md)). List both in `files`; the installer copies them like any other file and never runs migrations. Test the SQL against a real engine (the repository uses PGlite, a WASM build of PostgreSQL, as a devDependency), record it in `verification.environment` (`{"postgres": "PGlite 0.5.8"}`), and include concurrency cases for every state change that must happen once. Keep the SQL store's executor shape (`query(text, params)` and an optional `transaction(fn)`) so apps can pass `pg`, `postgres.js`, Drizzle or Neon clients through a small adapter.

## After installation

`add` writes `.genlib/receipts/<id>.json`. Bumping a module's version is what `genlib update` merges into receiving apps, so keep file targets stable between versions where possible: a renamed target is delivered as a new file plus a deletion of the old one (or `keep-removed-upstream` when it was edited). Record the change in `changelog`.

## Erasable TypeScript

Module, recipe and integration-pack TypeScript must run after type erasure alone, because apps copy it into projects that run `.ts` with Node's type stripping, Deno or Bun: no constructor parameter properties, enums or namespaces. The repository build, the recipe compile in `tests/recipes.test.mjs` and every pack's tsconfig set `erasableSyntaxOnly`, so `npm run check` fails on them. Relative imports keep the `.js` extension a NodeNext build expects; `genlib add --ts-imports` rewrites them to `.ts` in the copy for apps without a build ([lifecycle.md](lifecycle.md)).
