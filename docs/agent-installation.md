# Agent-ready source reuse

The agent recipe router now supports **explicit compatibility assessment** and **safe source-copy planning**.

```sh
node tools/agent-recipes.mjs find "shopping cart"
node tools/recipe-compat.mjs assess storefront-cart --project project-profile.json
node tools/recipe-install.mjs plan storefront-cart --target /existing/project
node tools/recipe-install.mjs add storefront-cart --target /existing/project
```

Example project profile:

```json
{"language":"typescript","framework":"react","runtime":"node"}
```

The compatibility result is a **conservative candidate/review-required assessment**, not proof of build compatibility or an AI-generated confidence probability. The installer copies a single reviewed source example into `genlib/<original path>`, refuses existing files and symlinked paths, and prints the source SHA-256. It does not run hooks, install dependencies, change package manifests, deploy, or automatically resolve imports.

Versioned modules still use the original Genlib plan/add/verify workflow. Structural UI examples remain excluded from the source copier until accessible production implementations and tests exist.

The repository index, AST dependency graph, and Mermaid diagrams are regenerated for each commit by GitHub Actions. Consumers must match artifact SHA to their checkout before use.

**Measured success:** track time and tokens to accepted implementation, correct-file recall, integration failures, and subsequent regressions. Fewer lines generated is not by itself an improvement.
