# Repository intelligence

GitDiagram (https://gitdiagram.com/) is a useful visual reference, but this index is independent, local and deterministic. GitDiagram's upstream repository is https://github.com/ahmedkhaleel2004/gitdiagram (MIT license at review time). No code is sent to a third-party diagram service.

## Commands

- `node tools/repo-map.mjs build` — generate a commit-specific map for a clean tracked checkout.
- `node tools/repo-map.mjs check` — reject missing or stale maps.
- `node tools/repo-map.mjs find "notification"` — return up to ten likely files and symbols.
- `node tools/repo-map.mjs impact modules/common-api-clients/files/http.ts` — report possible direct importers.

## Every-change freshness

The GitHub workflow runs on every push and pull request, generating an artifact for the exact checked-out commit SHA. Agents must verify that the artifact's commit equals the current checkout HEAD before relying on it. If it differs, regenerate locally. Do not commit the generated index back to main: that creates a new SHA and invalidates the index again.

## Limitations and next phase

The first version regenerates the entire compact index; it does **not** yet provide incremental indexing, semantic embeddings, GraphRAG, AST-accurate cross-language edges, or Mermaid diagrams. Import matching is heuristic and may miss aliases, dynamic imports, or transitive dependencies. Query results are navigation hints, not authority. Agents must inspect selected source and contracts and run tests.

The index stores file paths, symbol names, import strings and content hashes, not full file contents. It should not index private customer projects into a public artifact. Measure retrieval correctness, task completion, latency and total tokens before claiming savings.
