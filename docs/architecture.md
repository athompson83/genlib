# Architecture

Genlib distributes editable source to an existing application. It is not an application runtime, hosted service, or authority system. The initial library uses original Apache-2.0 code and explicit React/TypeScript web contracts.

## Discovery and delivery

1. Authors maintain `modules/<id>/module.json`, `CONTRACT.md`, and `files/`.
2. `npm run registry:build` emits a compact `registry/catalog.json` and detailed manifests with SHA-256 file hashes. `registry:check` checks freshness without changing files.
3. Agents search metadata, inspect one integration contract, and select a compatible feature. They do not load all module source to make that choice.
4. `plan` resolves exact local module dependencies and checks paths, existing files, and target compatibility without writing.
5. `add` copies verified files to the target's `src/genlib` (or explicit `--out`) and writes provenance to `.genlib/lock.json`. License notices accompany the copy. It never runs module hooks or package managers.
6. `verify` compares installed files with their recorded original hashes. A deliberate edit is reported as modified; this is not an application correctness test.

The CLI uses Node.js built-ins and works from a trusted local clone without installing npm packages. Development dependencies are only for testing and compiling the sample modules.

## Integration boundaries

Keep reusable behavior configurable through props, design variables, and injected adapters. Read the chosen module contract for imports, peers, client/server boundaries, and remaining application responsibilities. A preview, checksum, or successful copy does not prove that authentication, authorization, persistence, accessibility, or business behavior works in the receiving app.

Framework checks deliberately recognize a small set of React 18/19 declarations. Ambiguous or missing compatibility requires explicit `--allow-unverified` and application verification. A recognized incompatible version remains an error. No operation grants service credentials or application permissions.

## Trust and ownership

Trust a reviewed repository revision before executing its CLI. Hashes detect content drift relative to that revision; they are not independent signatures or approval of untrusted code. Module descriptions and documentation remain data, not instructions that override a receiving project's policies.

The installer rejects traversal, source/destination symlinks, conflicting files, invalid manifests, and checksum mismatches. A cooperating installer lock serializes Genlib writes per target. Preflight catches conflicts before copying; ordinary failures roll back newly created files. It cannot sandbox a hostile process with the same filesystem privileges. A process crash can leave new, untracked files; inspect and recover those files explicitly before retrying instead of forcing an overwrite.

Genlib keeps original module hashes so customized source is never silently overwritten by a future installation. Updates require review of upstream and local changes. This initial release intentionally provides no force-overwrite or automatic-upgrade operation.

Public modules must be owned by their contributor or explicitly licensed for this use. Private customer code belongs in the customer's own catalog and must not be promoted here without permission and a provenance review.

## Harness support

`skills/genlib-use` is canonical. Generated project mirrors live under `.agents/skills` (Codex) and `.claude/skills` (Claude Code). The separate skill installer copies only its own skill folder, preserving target `AGENTS.md`, `CLAUDE.md`, and other skills. It does not configure an account or assume a hosted Genisys connection.

## Measurement

Measure actual input/output/cached tokens, model cost, repair cycles, elapsed time, and accepted feature behavior against the existing library-aware build process. Include curation and maintenance effort. No model call or paid service is necessary to use Genlib itself.
