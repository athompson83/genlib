# Retrieval and adoption evaluation

`tools/retrieval-eval.mjs` runs a fixed set of realistic tasks through the same deterministic discovery and Jev packet functions used by CLI and MCP clients. It checks that suitable reusable code is findable and that retired services, license filters and bounded decision packets behave as documented.

```sh
node tools/retrieval-eval.mjs --json
npm run retrieval:check
```

## What the fixtures cover

`tests/fixtures/retrieval-tasks.json` covers resumable uploads, conditional schema forms, Puck editing, branded invoices, editable grids, timezone calendars, durable webhook handling, storefront carts, typed clients, contract changes, codemods, mobile acceptance, Kotlin/Swift migrations, Rust bindings, desktop updates, policy/collaboration, typed services and observability. It also checks direct Genlib MCP discovery, retired-service migration lookup, a permissive grid search and existing webhook/passkey behavior.

Each task declares one or more acceptable `type:id` results and an explicit maximum rank. Optional project profiles and source-type filters model a caller that already knows its stack. Negative constraints reject retired results or non-permissive resources where requested. A passing task must also make the candidate available in the bounded Jev packet.

## Read the measurements

The report gives passed/failed tasks, acceptable-candidate rank, returned references, rule violations, serialized search/packet bytes, decision characters and local search elapsed time. Recall here is the fraction of these curated tasks meeting their declared rank and policy constraints. It is not general search quality or a statistical estimate across arbitrary user requests. Runtime timing depends on the machine and is reported without a brittle CI latency threshold.

Search and Jev output sizes measure the exact serialized payloads used by this evaluation. They do not represent model tokens, caching, paid inference costs or hours saved. A real savings experiment must hold the task and acceptance criteria constant, compare against an existing library-aware workflow, and capture model input/output/cached tokens, repair cycles, total elapsed time and maintenance effort.

## Adoption evidence is separate

Installer tests copy declared pack files into temporary receiving projects and verify hashes, idempotency, conflict handling and dependency-installation boundaries. Each pack's tests then exercise its actual adapters, serializers, generators, database fixtures or framework integrations. The MCP tests connect real SDK clients over stdio/HTTP and perform inspect/read/plan/install/verify against the same functions.

Those checks establish their stated boundaries. They do not prove a production service account, live checkout, signed desktop update or a particular mobile OS build works. Record those results in a consuming project's acceptance evidence before changing a resource to `integration-verified`.

## Change fixtures deliberately

Add tasks for a new user requirement before changing ranking. Prefer ordinary application wording and acceptable result sets over exact floating-point score assertions. Keep existing task families and negative cases. If an upstream compatibility change makes a previously accepted profile unsuitable, update its manifest/contract and the affected test with that evidence. Do not weaken a fixture merely to hide a retrieval regression.
