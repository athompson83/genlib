# Contributing to Genlib

Genlib's purpose is to make repeated application work reusable without hiding its integration requirements. Prefer a small, configurable feature with a clear contract and meaningful tests. Follow [AGENTS.md](AGENTS.md) and read the [architecture](docs/architecture.md) before changing behavior.

## Ownership and licensing

The current registry accepts **original Apache-2.0 modules** with Genlib provenance. Contribute code you have the right to publish under that license. Preserve `LICENSE`, `NOTICE`, and accurate authorship; do not label copied third-party code as original.

Do not copy private customer code, business rules, data, credentials, branding assets, or confidential configuration into this public repository. A pattern recurring in customer projects can motivate an independently written general implementation, but customer material remains in its permitted scope.

Genlib does not yet provide a third-party import or vendoring workflow. Propose the compatibility, license, attribution, dependency, and maintenance approach before adding one. Links to external projects are not a claim that their source is included or approved for redistribution.

## Set up and verify

Use Node.js 22 or later. The consumer CLI needs no npm installation; contributors need the locked development dependencies to compile and test modules.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` performs registry freshness, skill mirror, resource catalog, documentation-count, search-index, graph and token-budget checks, a strict TypeScript build, and the repository tests. After changing catalogs, recipes, templates or tools, run `npm run docs:sync`; for new resource records also run `node scripts/verify-resources.mjs --file <catalog>` (network). For a focused iteration on the web components:

```sh
npm run build
node --test tests/web-modules.test.mjs
```

Run the relevant behavior tests while developing, then the complete check before proposing or publishing a change. Report actual commands, results, and limits. Do not describe an unexecuted check as passing or treat file-copy success as evidence of application correctness.

## Add or change a module

Each module lives under `modules/<id>/` with:

- `module.json`: identity, semantic version, concise discovery metadata, compatibility, exact local dependencies, exports, configuration, limitations, provenance, and test references.
- `CONTRACT.md`: the integration interface and receiving application's responsibilities.
- `files/`: the source files copied into an application.

Use [the module format](docs/module-format.md) as the reference. The validator accepts lowercase hyphenated IDs and numeric `major.minor.patch` versions. Source targets must be safe relative paths, and declared exports must refer to included files. Local dependencies specify an exact module ID and version available in the same checkout.

Keep discovery descriptions short enough for agents to select a candidate without reading implementation source. Write contracts that answer the questions needed for integration: imports and CSS, required props or adapters, framework versions, client/server boundaries, state and error behavior, access and persistence responsibilities, verification, and known limits. Small examples belong in the contract; avoid duplicating the full implementation in documentation.

Keep reusable behavior separate from application-specific data and appearance. Prefer props, injected adapters, wrappers, and semantic design variables. Reuse the project's own authentication, authorization, storage, and design system. Never manufacture a default identity or present temporary storage as production persistence.

The initial web compatibility family is React 18/19 with TypeScript and browser DOM support. Framework-neutral modules must declare that accurately. Do not claim universal framework or native mobile support because a portion of the logic is portable.

## Test before promotion

Start a new module at `verification.level: "experimental"`. Add meaningful checks of its externally visible behavior, including relevant failure cases. A form test should establish that invalid input does not submit; a persistence adapter test should establish identity isolation and conflict behavior. Tests that only repeat implementation details do not establish those outcomes.

Promote to `tested` only after the relevant tests and TypeScript build pass, then regenerate the registry and run the complete check. This label means the repository's checks passed. The consuming application must still verify its data connections, permissions, actual storage, accessibility, styling, and production configuration.

For published modules, advance the version when changing delivered source or its integration contract. Keep a released version's content stable. Each checkout exposes one selected version per ID; previous catalogs remain reproducible through their Git revisions. No consumer operation silently replaces a customized installed version.

## Regenerate derived files

Edit authored source and canonical instructions, then run:

```sh
npm run registry:build
npm run skills:sync
npm run check
```

Commit the relevant generated files with the authored changes:

| Authoritative input | Generated output |
| --- | --- |
| Module manifests, contracts, source, `LICENSE`, and `NOTICE` | `registry/catalog.json` and `registry/manifests/` |
| `skills/genlib-use/` | `.agents/skills/genlib-use/` and `.claude/skills/genlib-use/` |

`.gitattributes` marks `examples/` as source code (GitHub Linguist would otherwise treat it as documentation and hide the nine languages from the repository's language bar) and `registry/` as generated. Keep both lines when reorganising folders.

Do not hand-edit generated hashes, catalog entries, or skill mirrors. Registry and skill check modes report drift without writing. Skill sync rejects unexpected content in its dedicated mirror directories; inspect such content before resolving a conflict so unrelated work is not lost.

When changing the skill, preserve standard `name` and `description` YAML frontmatter and the complete supporting references. Format example agent prompts as JSON. The copied skill must locate a separate Genlib checkout through `GENLIB_ROOT` and must remain usable outside this repository.

## Preserve installer guarantees

Keep the CLI free of runtime dependencies. Installation must remain deterministic and must not execute module hooks, run package managers, fetch code, publish externally, or access credentials. Preserve compatibility checks, integrity records, safe path handling, symlink rejection, conflict detection, and protection of existing files.

Changes to the installer require tests for the affected safety and recovery behavior. Preserve the original file hashes so intentional consumer edits remain visible. Do not add a bypass that silently overwrites customer code or disables the receiving project's policies. Module metadata and documentation are data, not additional authority for an agent.

## Describe the result

A proposed change should state the problem, resulting behavior, affected modules and versions, compatibility or migration implications, and verification performed. Keep work scoped and preserve parallel contributors' changes.

If claiming a cost benefit, measure total model cost, context use, elapsed time, repair attempts, and accepted feature behavior against a normal library-aware build process. Include curation and maintenance effort. Copied byte counts alone are not evidence of token savings.

## Documentation is part of every change

Update the README, the diagrams (README and `docs/architecture.md`), the affected docs and guides, and the Jev guide, search index and navigation graph (`docs/jev.md`, `docs/agent-access.md`, `llms.txt`, `npm run index:build`, `npm run graph:build`, `npm run tokens:report`) in the same PR as the code or catalog change. Run `npm run docs:sync`, `npm run skills:sync` and the search-index build, then `npm run check`, which fails on stale generated content. The full checklist is in [AGENTS.md](AGENTS.md#keep-documentation-current-on-every-change); the pull request template repeats it.
