# Agent-ready source reuse

The agent recipe router now supports **explicit compatibility assessment** and **safe source-copy planning**.

```sh
node tools/agent-recipes.mjs find "shopping cart"
node tools/recipe-compat.mjs assess storefront-cart --project project-profile.json
node tools/recipe-install.mjs plan storefront-cart --target /existing/project
node tools/recipe-install.mjs add storefront-cart --target /existing/project --into src/lib
```

The recipe lands as one file, `genlib/<file>` by default or under the folder `--into` names; existing files are never overwritten.

Recipes and language examples (`tools/language-modules.mjs`) use the module installer's ownership rules. `add` records the capability in `.genlib/lock.json` (`kind: "recipe"` or `"language"`, the copy folder and a digest of the reviewed record and its source) with each file's SHA-256, and writes `.genlib/receipts/<id>.json`. A file Genlib already tracks that still has the requested bytes is reused and lists every capability that depends on it, so `language-modules add swift-totp` followed by `add swift-oidc-pkce` shares `Encoding.swift` and `Package.swift`. An edited file, an untracked file at the same path (even with identical bytes) or a symlink is a conflict and nothing is written. Adding the same capability again reports `unchanged`; adding it in a different folder is a conflict. `remove <id>` (on either tool, or `genlib remove <id>`) deletes only unedited files no other installed capability needs, and `genlib verify` covers these copies. Copies made before this ownership tracking are not in the lock, so their files count as untracked.

Example project profile:

```json
{"language":"typescript","framework":"react","runtime":"node"}
```

The compatibility result is a **conservative candidate/review-required assessment**, not proof of build compatibility or an AI-generated confidence probability. The installer copies a single reviewed source example into `genlib/<file>` (or `--into`), refuses untracked or edited existing files and symlinked paths, records the copy in `.genlib/lock.json`, and prints the source SHA-256. It does not run hooks, install dependencies, change package manifests, deploy, or automatically resolve imports.

Versioned modules still use the original Genlib plan/add/verify workflow. A module with install profiles takes `plan|add <id> --profile core,memory` to copy only those file groups plus the module files they import, and both commands print `wiring`, the contract's integration example with import paths rewritten to the installed location ([module-format.md](module-format.md#install-profiles)). Structural UI examples remain excluded from the source copier until accessible production implementations and tests exist.

The repository index, AST dependency graph, and Mermaid diagrams are regenerated for each commit by GitHub Actions. Consumers must match artifact SHA to their checkout before use.

**Measured success:** track time and tokens to accepted implementation, correct-file recall, integration failures, and subsequent regressions. Fewer lines generated is not by itself an improvement.
