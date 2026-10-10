# Task-scoped agent context

Use `node tools/repo-map.mjs build` and `node tools/repo-deps.mjs build` on a clean committed checkout, then:

```sh
node tools/repo-context.mjs "stripe checkout"
```

This emits at most five ranked files, 25 related import edges and eight possible test paths. It checks both index commit SHAs against the current HEAD and fails on stale artifacts. Agents should read only the selected files and contracts before editing, but must not assume the candidate list is exhaustive.

The result is deliberately metadata-only; it does not retrieve source bodies, send project code to a provider, or claim token savings. Test discovery is heuristic. Benchmark against a conventional workflow before deciding whether to add embeddings or GraphRAG.
