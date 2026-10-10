# API contracts, generated clients and executable verification

This pack is original Apache-2.0 glue around external MIT/Apache tools. Generated application types come from the authored `schema/openapi.json`; no external SDK implementation is vendored. Keep external package notices.

## Supported default

Node >=22.18, TypeScript, OpenAPI 3.0.3. `openapi-typescript` + `openapi-fetch` is the default. `npm test` generates types, typechecks the adapter and exercises a real localhost fixture for authorization, pagination, input failure and generated-client behavior. The sample token belongs only to the local in-memory fixture. It is never a production credential.

`createInventoryClient` injects base URL, token callback, fetch and timeout. It exposes the typed raw client and a validated list operation with normalized HTTP, network, transport timeout/cancellation, authentication and malformed-response errors. Token failures are sanitized; token-acquisition deadlines and project permissions belong to the receiving app. The timeout begins after token acquisition. Response decoding failures are reported as invalid responses. Invalid response checking covers the inventory page contract, not arbitrary schemas. No automatic retries of mutation requests.

The in-memory fixture binds loopback only; it is not a production database/server. Responses and identifiers are reset on restart. Its purpose is repeatable contract tests without live external effects.

## Optional profiles (select one generator)

- `npm run generate:orval`: single fetch-client variant, not installed into the target by default.
- `npm run generate:hey`: Hey API SDK/client variant.
- `npm run generate:typespec`: optional schema-authoring example. This deliberately small alternate definition demonstrates authoring; the JSON OpenAPI fixture remains authoritative for the tested default. Do not maintain two competing source contracts in an application.
- Provision Hurl, then run `npm run test:hurl`. The runner creates and shuts down its own fixture on an ephemeral loopback port. For manual use `npm run fixture` runs the fixture on port 4317; `http/inventory.hurl` accepts explicit `base_url` and `token` variables.
- Install `http/requirements.lock.txt` in a Python virtual environment, put that environment on PATH, then run `npm run test:schemathesis`. The same disposable-fixture runner selects all checks, seed 42, coverage/fuzzing phases and bounded examples with an in-memory generation database. It creates local fixture records and does not use a remote service URL. Live API fuzzing requires a separate, explicit test scope.
- `node http/check-breaking.mjs` invokes a separately provisioned oasdiff executable; it fails when the executable is missing and asserts an intentionally broken fixture is rejected. Pin oasdiff in the receiving project's tool lock. Do not turn a missing tool into a success gate.
- From `microcks/`, explicitly run `docker compose up -d`; from the pack root run `sh microcks/import-spec.sh`. The service is an opt-in local contract mock; it is not a dependency of the default client. The image/version and container runtime must be verified on the receiving environment.

## Adoption

Install dependencies explicitly with `npm ci --ignore-scripts`, commit locks, run the selected generator, and keep only one application's canonical contract. Capture generated diffs on updates. Read `verification.notes` for exactly which checks were run in this environment. Hurl/oasdiff/containers are additional checks, never implied by a passing Node suite.
