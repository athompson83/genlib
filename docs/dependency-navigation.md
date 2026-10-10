# Dependency-aware repository navigation

Run `node tools/repo-map.mjs build` before building the dependency graph. Then:

```sh
node tools/repo-deps.mjs build
node tools/repo-deps.mjs check
node tools/repo-deps.mjs impact modules/common-api-clients/files/http.ts
```

The tool resolves **relative static imports** to indexed files using a bounded list of common TypeScript/JavaScript extensions and index entry points. It stores source-to-target edges in `.genlib/dependencies.json`. The `impact` command traverses reverse edges to report transitive dependents. Every graph carries the exact commit SHA, and the workflow publishes it with the source map and Mermaid overview on each push and PR.

This is not yet an AST-based resolver. Package aliases, external packages, re-exports without explicit imports, dynamic imports, runtime reflection, and non-JS dependencies can be missed. Do not use impact output as permission to skip tests or deployment checks. It is a retrieval aid to prioritize reading and testing.

Next phases: language-aware parsers, import aliases, test-to-source edges, per-file incremental caching, and benchmark tasks comparing graph-guided and conventional repository navigation.
