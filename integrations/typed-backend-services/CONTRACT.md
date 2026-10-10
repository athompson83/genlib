# Typed backend service profiles

Original schema, domain adapters, fixtures and tests are Apache-2.0. sqlc is MIT; Connect RPC and Protobuf-ES are Apache-2.0 (the protobuf package also carries BSD notices for covered components). modernc SQLite and its transitive packages retain their own licenses. No generator/plugin runtime implementation is vendored. Generated source is derived from the original schemas here, and generator notices must be retained.

## Connect RPC

The protobuf contract generates TypeScript message/service descriptors with a local pinned Buf/Protobuf-ES toolchain. The Node server accepts an injected repository and authorization callback, bounds request bodies, and maps validation/not-found/authentication failures to Connect status codes. Node and browser clients accept an explicit session-token callback. The fixture server binds loopback and uses a public test token with in-memory storage. It is a runnable protocol fixture, not production identity, authorization, durable persistence or CORS policy.

Run `npm ci --ignore-scripts`, `npm run lint:proto`, and `npm test` from this pack. Tests generate/type-check actual descriptors and exercise the service over local HTTP, including create/get/pagination and typed errors. Run `npm run serve` after the build for manual integration. `buf breaking --against <trusted-revision-or-image>` is an additional receiving-repository gate; choose the real baseline instead of a dummy passing revision. [Connect Node](https://connectrpc.com/docs/node/getting-started/).

## sqlc Go repository

The SQLite queries generate a typed `database/sql` API. The original repository wraps it with validated atomic batch insertion, completion updates, cancellation and missing-record errors. It deliberately owns its transaction, so do not call it from a transaction that the caller expects to control. The receiving app owns database creation/migrations, pool/connection settings, authorization, retry policy and persistence lifetime.

Install pinned generator `go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1`. In `go/`, run `sqlc generate`, `go mod tidy`, and `go test ./...`. Commit `go.sum` from verified dependency resolution. The tests use real SQLite and generated queries, and require Go 1.24+ (the selected dependency toolchain may require a newer patch). Code generation is explicit and never runs as an installer hook. [sqlc generation](https://docs.sqlc.dev/en/latest/howto/generate.html).

These are two opt-in backend profiles; the pack does not pretend that a Go repository and a Node service share process memory. Use the repository interface to adapt the chosen receiving service's persistence boundary. Verification notes distinguish Node protocol tests from Go generation/runtime tests and any remote production service checks.
