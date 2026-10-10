# TypeScript AST dependency index

`tools/repo-ast.mjs` uses the TypeScript compiler API already declared as a development dependency. Run `npm ci --ignore-scripts` first. It extracts imports, re-exports, require calls and string-literal dynamic imports from JS/TS source syntax, avoiding false positives in comments.

```sh
node tools/repo-map.mjs build
node tools/repo-ast.mjs build
node tools/repo-ast.mjs check
node tools/repo-context.mjs "checkout"
```

The AST graph is stored at `.genlib/ast-dependencies.json`. A local `.genlib/ast-cache.json` reuses parsed imports when SHA-256 content hashes are unchanged; changed and deleted files invalidate their cache entries. This is incremental **parsing**, not incremental graph recomputation, and the CI job currently performs a cold build on each run. The cache is deliberately not uploaded as a public artifact.

Task context prefers the AST graph when available, otherwise falls back to the previous heuristic graph. A stale AST graph fails closed rather than silently falling back.

The analyzer does not yet resolve TypeScript path aliases, package exports, type-only semantic dependencies, generated code, or all non-JS languages. Keep full relevant tests in place. Measure actual parse reuse and retrieval correctness before claiming performance or token savings.
