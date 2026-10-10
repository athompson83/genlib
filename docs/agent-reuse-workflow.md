# Agent-first reuse recipes

Genlib now provides a **task-to-code router** at `tools/agent-recipes.mjs`. This is a metadata-first discovery layer, not a new code generator.

```sh
node tools/agent-recipes.mjs find "shopping cart"
node tools/agent-recipes.mjs inspect storefront-cart
node tools/agent-recipes.mjs validate
```

## Minimal agent workflow

1. Search recipes using the task description (maximum five results).
2. Inspect the selected recipe and its implementation status. Existing registry modules use `bin/genlib.mjs plan/add/verify`; standalone examples require manual review and adaptation. Never claim all examples are installer-ready.
3. Read the selected source and only its necessary contracts. Use the repository map and AST dependency graph to inspect impacted code, verifying that artifact commit SHA matches HEAD.
4. Prefer data-driven props and configuration adapters; do not rewrite a reusable implementation from scratch merely to change colors, labels, fields or layouts.
5. For dynamic data, supply application-owned data providers and authorization checks. For UI, use the consuming project's design tokens and accessibility primitives.
6. Run application tests and record actual files changed, integration work, and total agent tokens. Compare with baseline implementation tasks before asserting savings.

## Graph and diagram freshness

The existing Repository map workflow runs on every push and pull request and publishes commit-specific repository map, dependency graph, AST graph and Mermaid diagram artifacts. The workflow does not commit generated diagrams back to main. This avoids self-invalidating artifacts. Agents must check freshness before using any downloaded artifact.

## Additional improvements

Next: package each source example with versioned contracts, tests, and deterministic installation; add structured interface schemas, example usage fixtures, variant screenshots, compatibility checks and automated dependency-impact tests. Add a manifest-driven documentation page and measurable retrieval benchmarks. Do not promote structural modal examples as production-accessible without focus management and keyboard tests.
