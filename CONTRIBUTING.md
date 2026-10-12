# Contributing to Genlib

Genlib's purpose is to make repeated application work reusable without hiding its integration requirements. Prefer a small, configurable feature with a clear contract and meaningful tests. Follow [AGENTS.md](AGENTS.md) and read the [architecture](docs/architecture.md) before changing behavior.

Broad expansion is paused under the [focused reuse plan](docs/focused-reuse.md). Maintain existing resources and fix demonstrated adoption problems. Further component work needs a concrete receiving-app task; additional catalog entries or language variants are not a substitute for accepted-feature evidence. The existing economic merge gate still applies.

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

`npm run check` performs registry freshness, skill mirror, resource catalog, documentation-count, search-index, graph token-budget and diagram checks, a strict TypeScript build, and the repository tests. After changing catalogs, recipes, templates or tools, run `npm run docs:sync`; for new resource records also run `node scripts/verify-resources.mjs --file <catalog>` (network). For a focused iteration on the web components:

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

Describe what the selected files deliver. A data helper does not count as a rendered component, and a package reference does not count as an installed integration. Recipe `variants` must name implemented behavior; optional `title` and `caveat` fields make that scope visible before copying. Do not label proposed cart drawers or catalog grids as shipped variants of pure data functions.

Keep reusable behavior separate from application-specific data and appearance. Prefer props, injected adapters, wrappers, and semantic design variables. Reuse the project's own authentication, authorization, storage, and design system. Never manufacture a default identity or present temporary storage as production persistence.

The initial web compatibility family is React 18/19 with TypeScript and browser DOM support. Framework-neutral modules must declare that accurately. Do not claim universal framework or native mobile support because a portion of the logic is portable.

## Test before promotion

Start a new module at `verification.level: "experimental"`. Add meaningful checks of its externally visible behavior, including relevant failure cases. A form test should establish that invalid input does not submit; a persistence adapter test should establish identity isolation and conflict behavior. Tests that only repeat implementation details do not establish those outcomes.

Promote to `tested` only after the relevant tests and TypeScript build pass, then regenerate the registry and run the complete check. This label means the repository's checks passed. The consuming application must still verify its data connections, permissions, actual storage, accessibility, styling, and production configuration.

For published modules, advance the version when changing delivered source or its integration contract. Keep a released version's content stable. Each checkout exposes one selected version per ID; previous catalogs remain reproducible through their Git revisions. No consumer operation silently replaces a customized installed version.

## Add or change an integration pack

Use `integrations/<id>/integration.json`, `CONTRACT.md`, original source/configuration, pinned optional dependencies and meaningful fixtures. The [integration format and adoption guide](docs/integrations.md) defines manifest fields, resource bindings and safe file limits. Keep dependencies isolated from the zero-dependency CLI and identify their exact license scope. Declare React peer majors explicitly; native/desktop/service profiles must name their runtime requirements.

Start at `experimental`; promote only the exercised scope and record the actual environments in `verification.profiles`. Include reproducible commands for remaining acceptance checks. Generators, containers and package scripts run only in the deliberate development/receiving-app workflow. The installer must never execute them.

For the direct MCP package, run `npm ci --ignore-scripts --prefix packages/genlib-mcp` and `npm test --prefix packages/genlib-mcp`. Keep stdio/HTTP protocol tests, project scoping, readonly defaults and write opt-in intact. [The MCP guide](docs/mcp-server.md) documents connection and deployment boundaries.

## Regenerate derived files

Edit authored source and canonical instructions, then run:

```sh
npm run registry:build
npm run shadcn:build
npm run integrations:build
npm run skills:sync
npm run docs:sync
npm run index:build
npm run graph:build
npm run check
```

Commit the relevant generated files with the authored changes:

| Authoritative input | Generated output |
| --- | --- |
| Module manifests, contracts, source, `LICENSE`, and `NOTICE` | `registry/catalog.json` and `registry/manifests/` |
| Integration manifests, contracts and declared files | `registry/integrations.json` |
| Recipe catalog and module manifests | `registry.json` (shadcn-format registry) |
| `skills/genlib-use/` | `.agents/skills/genlib-use/` and `.claude/skills/genlib-use/` |
| Source catalogs and documentation sections | Generated count blocks, `registry/search-index.jsonl` and `registry/graph.json` |

When you add a capability, define it in `scripts/build-capabilities.mjs`, give it the everyday words people use for the need in `resources/capabilities-src/terms.json` (not only the standard's name), a one-sentence caveat in `caveats.json` when it has a limit users would otherwise discover after copying, add two or three task phrasings to the `tuning` set in `tests/fixtures/routing-queries.json`, then run `npm run capabilities:build` and `node scripts/routing-eval.mjs --misses`. Leave the `heldout` set alone: it measures ranking changes honestly only while nobody tunes against it.

When you change a module's behavior, bump its version and add a `changelog` entry (mark breaking changes), and keep `verification.behaviors` and `verification.command` true to its tests ([module-format.md](docs/module-format.md)).

When a new capability or module covers what an indexed external project does, add the pair to `resources/equivalents.json` (`type:id` of the record to `capability:`/`module:`/`template:` targets) so agents reuse the tested code first.

`.gitattributes` marks `examples/` as source code (GitHub Linguist would otherwise treat it as documentation and hide the nine languages from the repository's language bar) and `registry/` as generated. Keep both lines when reorganising folders.

Do not hand-edit generated hashes, catalog entries, or skill mirrors. Registry and skill check modes report drift without writing. Skill sync rejects unexpected content in its dedicated mirror directories; inspect such content before resolving a conflict so unrelated work is not lost.

When changing the skill, preserve standard `name` and `description` YAML frontmatter and the complete supporting references. Format example agent prompts as JSON. The copied skill must prefer an available MCP connection without requiring a local checkout, and locate a separate reviewed checkout through `GENLIB_ROOT` for CLI fallback. It must remain usable outside this repository.

Harness profiles live in `lib/harnesses.mjs`. Add primary-source configuration and skill-path evidence with a checked date; do not infer a native MCP loader from a model runtime. Test native schemas, idempotent safe skill copying and explicit authority choices with `node --test tests/harnesses.test.mjs tests/skills.test.mjs tests/harness-doctor.test.mjs`, then run the optional MCP package suite. Configuration generation emits fragments for merging and must not replace settings. Keep actual named-client acceptance separate from a successful local protocol doctor. The profile guide is [docs/harnesses.md](docs/harnesses.md).

## Preserve installer guarantees

Keep the CLI free of runtime dependencies. Installation must remain deterministic and must not execute module hooks, run package managers, fetch code, publish externally, or access credentials. Preserve compatibility checks, integrity records, safe path handling, symlink rejection, conflict detection, and protection of existing files.

Changes to the installer or to `lib/lifecycle.mjs` (receipts, `adopted`, `update`, `remove`) require tests for the affected safety and recovery behavior, and any change to a `--json` shape updates its schema in `schemas/`. `update` must never write without `--write`, and `remove` must never delete an edited file. Preserve the original file hashes so intentional consumer edits remain visible. Do not add a bypass that silently overwrites customer code or disables the receiving project's policies. Module metadata and documentation are data, not additional authority for an agent.

## Describe the result

A proposed change should state the problem, resulting behavior, affected modules and versions, compatibility or migration implications, and verification performed. Keep work scoped and preserve parallel contributors' changes.

If claiming a cost benefit, measure total model cost, context use, elapsed time, repair attempts, and accepted feature behavior against a normal library-aware build process. Include curation and maintenance effort. Copied byte counts alone are not evidence of token savings.

When adding a provider profile, pin every step (no `@latest`), list the paths its scaffolder writes under an `absent` prerequisite and the files it edits under `stage.mergeFiles`, and keep `status: planned` until a fixture app has passed its acceptance steps. After adding a module or capability, credit it in the matching feature contracts in `resources/feature-contracts/` (only requirements a named test exercises count as `fixture-verified`; see [docs/coverage.md](docs/coverage.md)), run `npm run contracts:check`, then rerun `node scripts/gap-report.mjs --write` so [docs/gaps.md](docs/gaps.md) reflects the new coverage.

Run the offline [retrieval evaluation](docs/retrieval-evaluation.md) when changing ranking or adoption paths. Use [catalog health](docs/catalog-health.md) for deliberately selected exact-version advisory/license/lifecycle enrichment; preserve query time, provenance and unknown/error states. New or corrected resource records need source verification (`--file` and optionally `--ids`), with blocked responses reported separately.

## Documentation is part of every change

Update the README, the diagrams (README and `docs/architecture.md`, then `npm run diagrams:render` to redraw their SVGs with the pinned Agentic Mermaid; it needs network and Node 22), the affected docs and guides, and the Jev guide, search index and navigation graph (`docs/jev.md`, `docs/agent-access.md`, `llms.txt`, `npm run index:build`, `npm run graph:build`, `npm run tokens:report`) in the same PR as the code or catalog change. Run `npm run docs:sync`, `npm run skills:sync` and the search-index build, then `npm run check`, which fails on stale generated content. The full checklist is in [AGENTS.md](AGENTS.md#keep-documentation-current-on-every-change); the pull request template repeats it.

Quickstarts and MCP commands never run `latest`. After adding one, run `node scripts/pin-quickstarts.mjs` and `node scripts/mcp-index.mjs --pin` (both need network). They pin npm runners (and `npm create`) to exact versions, `go install …@latest` to the module proxy's current version, and `latest`/`latest-<variant>` images to digests, in the catalogs and `resources/*.json` (attachments included), and give colliding MCP local names a namespace. `npm run check` fails on anything left unpinned.
