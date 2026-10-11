# API contracts, generated clients and executable verification

This pack is original Apache-2.0 glue around external MIT/Apache tools. Generated application types come from the authored `schema/openapi.json`; no external SDK implementation is vendored. Keep external package notices.

## Supported default

Node >=22.18, TypeScript, OpenAPI 3.0.3. `openapi-typescript` + `openapi-fetch` is the default. `npm test` generates types, typechecks the adapter and exercises a real localhost fixture for authorization, pagination, ETag revalidation, chunked-upload state, input failure and generated-client behavior. The sample token belongs only to the local in-memory fixture. It is never a production credential.

`createInventoryClient` injects base URL, token callback, fetch and timeout. It exposes the typed raw client and a validated list operation with normalized HTTP, network, transport timeout/cancellation, authentication and malformed-response errors. Token failures are sanitized; token-acquisition deadlines and project permissions belong to the receiving app. The timeout begins after token acquisition. Response decoding failures are reported as invalid responses. Invalid response checking covers the inventory page contract, not arbitrary schemas. No automatic retries of mutation requests.

The in-memory fixture binds loopback only; it is not a production database/server. Responses and identifiers are reset on restart. Its purpose is repeatable contract tests without live external effects.

## HTTP behavior and Hurl chains

The authoritative OpenAPI fixture now describes these operations; the alternative generators consume that same JSON source:

| Route | Contract behavior |
|---|---|
| `GET /items?cursor=...` | Stable insertion order, bounded pages and a next cursor; the Hurl chain follows a successful second page and verifies termination |
| `GET /items` and `GET /items/{id}` | Strong SHA-256 ETags, private cache revalidation, `Vary: Authorization`, weak/list `If-None-Match` matching and bodyless 304; authentication always runs first |
| `POST /uploads` | Flat filename plus declared byte length, bounded to 1 MiB; returns stable upload ID, Location and offset zero |
| `GET` / `HEAD /uploads/{id}` | Inspect persisted-in-process metadata or byte offset to resume after a client interruption |
| `PATCH /uploads/{id}` | Nonempty `application/octet-stream` chunk of at most 64 KiB with expected `Upload-Offset`; stale/concurrent offsets and over-length chunks cannot mutate the record |
| `POST /uploads/{id}/complete` | Requires exactly the declared byte count; returns a SHA-256 completion record; repeated completion returns the same identity/digest |

The upload endpoint is an original **fixture protocol, not a tus implementation**. Production resumable upload adoption uses the separate `resumable-files` pack and an authenticated durable backend. This local fixture retains at most 128 upload records and discards chunk buffers after completion. It does not write files or accept a storage path. Restart clears its records.

`http/inventory.hurl` contains 22 chained requests: authorization denial, create/read, successful pagination, unchanged/changed cache validators, upload creation, denied premature completion, chunk append, offset recovery, stale-chunk rejection and idempotent completion with the expected digest. The Node tests exercise these same invariants, including competing chunks. Hurl's input syntax and assertions follow the [upstream request](https://hurl.dev/docs/request.html) and [response assertion](https://hurl.dev/docs/asserting-response.html) documentation.

## Optional profiles (select one generator)

- `npm run generate:orval`: single fetch-client variant, not installed into the target by default.
- `npm run generate:hey`: Hey API SDK/client variant.
- `npm run generate:typespec`: optional schema-authoring example. This deliberately small alternate definition demonstrates authoring; the JSON OpenAPI fixture remains authoritative for the tested default. Do not maintain two competing source contracts in an application.
- Provision **Hurl 8.0.1**, then run `npm run test:hurl`. The runner creates and shuts down its own fixture on an ephemeral loopback port. For manual use `npm run fixture` runs the fixture on port 4317; `http/inventory.hurl` accepts explicit `base_url` and `token` variables. `http/tool-versions.json` pins the upstream release and Linux x86_64 archive SHA-256. Verify the published checksum for a different platform. A source build uses `cargo install hurl --version 8.0.1 --locked`, Rust 1.95+ and the upstream curl/libxml/OpenSSL build prerequisites; no binary or toolchain is installed by Genlib.
- Install `http/requirements.lock.txt` in a Python virtual environment, put that environment on PATH, then run `npm run test:schemathesis`. The same disposable-fixture runner selects all checks, seed 42, coverage/fuzzing phases and bounded examples with an in-memory generation database. It creates local fixture records and does not use a remote service URL. Live API fuzzing requires a separate, explicit test scope.
- Provision **oasdiff v1.33.0** with `go install github.com/oasdiff/oasdiff@v1.33.0` (module requires Go 1.26 and declares toolchain go1.27.1), then run `npm run test:breaking`. The gate invokes the separate executable, fails if it is missing, passes an unchanged contract and requires a compact JSON failure for the otherwise-identical fixture with `GET /items` removed. The Go-installed binary may display `version main`; `go version -m` records the exact v1.33.0 module and checksum pinned in `http/tool-versions.json`. Do not turn a missing tool into a success gate.
- From `microcks/`, explicitly run `docker compose up -d`; from the pack root run `sh microcks/import-spec.sh`. The service is an opt-in local contract mock; it is not a dependency of the default client. The image/version and container runtime must be verified on the receiving environment.

## Adoption

Install dependencies explicitly with `npm ci --ignore-scripts`, commit locks, run the selected generator, and keep only one application's canonical contract. Capture generated diffs on updates. Read `verification.profiles` and `verification.notes` for exactly which checks were run. Seven Node tests and all three generator alternatives passed on Node 24.19.0. Real Hurl 8.0.1 passed all 22 requests, and oasdiff v1.33.0 (built with Go 1.27.2) passed both baseline assertions.

Schemathesis 4.30.1 exercised all eight current operations with seed 42: 284 generated cases passed and 14 were skipped. Examples are absent and stateful generation is disabled. It warned that generated PATCH/completion requests were mostly rejected; these operations require previously created upload state and a matching offset/length. Positive upload state transitions are separately exercised by the Node/Hurl chains. Containers/Microcks remain unexecuted.
