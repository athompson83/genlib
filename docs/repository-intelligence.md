# Repository intelligence

Genlib generates a deterministic local index and a Mermaid architecture overview without uploading source code to a third-party service. [GitDiagram](https://gitdiagram.com/) is a visual reference, not a required dependency.

## Commands

```sh
node tools/repo-map.mjs build
node tools/repo-map.mjs check
node tools/repo-map.mjs find "notification"
node tools/repo-map.mjs impact modules/common-api-clients/files/http.ts
node tools/repo-diagram.mjs
```

Run `check` before consuming an index artifact. The repository map workflow runs on **every push and pull request**, builds both the JSON map and Mermaid overview, and publishes them as a short-lived artifact for the exact source commit. Generated files are not committed back to main, avoiding self-invalidating commits.

The index contains tracked file paths, basic symbols, imports, and content hashes, not file bodies. Its dependency analysis is heuristic, and the diagram is a directory-level overview, not a verified cross-file call graph. Incremental indexing, AST-based analysis, GraphRAG, and measured token savings remain future work.

Do not upload private repository indexes to public artifact storage. The index is a navigation hint, not authorization to read or execute code. See [additional tools](repository-resources.md) for optional analyzers.
