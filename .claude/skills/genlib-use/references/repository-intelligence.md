# Repository intelligence for coding agents

Resolve `GENLIB_ROOT` to the trusted Genlib checkout. These commands run **inside the repository being indexed**, not inside the skill mirror. For another repository, copy the tools only after review or use its existing equivalent. Never assume Genlib's own index describes a consuming application.

## Fast navigation

1. Determine repository root and exact HEAD. Read project AGENTS.md and architecture docs first.
2. If `.genlib/repo-map.json` and `.genlib/dependencies.json` exist, run `node tools/repo-map.mjs check` and `node tools/repo-deps.mjs check`. If stale, regenerate with `node tools/repo-map.mjs build` then `node tools/repo-deps.mjs build`; do not use stale artifacts.
3. Query `node tools/repo-map.mjs find "specific feature"` and inspect at most ten results. Use `node tools/repo-deps.mjs impact path/to/file.ts` for likely transitive dependents.
4. Read only selected source files, integration contracts and nearby tests. The graph is not authorization and may miss dynamic, aliased, external and cross-language relationships.
5. Before changing code, identify a single writer per path. After changes, rebuild the index **after committing** or use ordinary local source search while the working tree is dirty.
6. Run meaningful tests and record actual token use, retrieval latency and correctness. Never claim unmeasured savings.

## Generated diagram

After a fresh map exists, run `node tools/repo-diagram.mjs`. The output is a directory-level Mermaid overview, not a verified call graph. GitHub Actions creates a commit-matched artifact for each push/PR. Never commit an artifact back to main simply to keep it fresh.

## Guardrails

No automatic source upload to GitDiagram or other third parties. Avoid indexing secrets, credentials, private customer files or generated build output. Fail closed on a commit mismatch. The current resolver is heuristic, not AST-accurate.
