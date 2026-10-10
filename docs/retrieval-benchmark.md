# Repository navigation benchmark

Run `node tools/repo-map.mjs build` on a clean committed checkout, then `node tools/repo-benchmark.mjs`. The benchmark uses five known file-retrieval tasks and reports top-five recall and the actual ranked positions. It does **not** estimate token savings or coding-task correctness.

Use it as a smoke baseline before changing the indexing/ranking algorithm. Do not convert it to a required perfect-score gate without first reviewing its expected paths and current scores. For a meaningful optimization study, collect task-level input/output tokens, tool overhead, latency, retrieval accuracy, accepted feature completion and regressions across multiple repositories, comparing the same tasks with and without graph guidance.

The current index is lexical and the dependency resolver is heuristic. Improve those before introducing embeddings, vector storage or remote graph infrastructure.
