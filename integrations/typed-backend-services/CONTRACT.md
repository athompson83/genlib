# Typed backend service profiles

Original schema, domain adapters, fixtures and tests are Apache-2.0. sqlc is MIT; Connect RPC and Protobuf-ES are Apache-2.0 (the npm protobuf package also carries BSD notices for covered components). The Go `google.golang.org/protobuf` generator and runtime are BSD-3-Clause. modernc SQLite and its transitive packages retain their own licenses. No generator/plugin runtime implementation is vendored. Generated source is derived from the original schemas here; retain generator notices and the licenses of linked runtimes in downstream distributions.

## Connect RPC

One `proto/genlib/inventory/v1/inventory.proto` contract generates TypeScript descriptors and Go message, server and client bindings. The local Node toolchain pins Buf 1.73.0, Protobuf-ES 2.16.0 and Connect 2.2.0 in `package-lock.json`. The separate `connect-go/go.mod` pins Connect Go and `protoc-gen-connect-go` 1.21.0 plus Protobuf and `protoc-gen-go` 1.36.12; its `tool` directives and `go.sum` keep the generators and runtimes on the same versions. These Go pins resolved and the generator version commands ran on 2026-10-10. This profile needs Go 1.25+ and was exercised with Go 1.27.2 on Linux x86_64. [Connect Go release](https://github.com/connectrpc/connect-go/releases/tag/v1.21.0), [Protobuf Go release](https://github.com/protocolbuffers/protobuf-go/releases/tag/v1.36.12), [Go generator/runtime license](https://github.com/protocolbuffers/protobuf-go/blob/v1.36.12/LICENSE).

The Node server accepts an injected repository and authorization callback, bounds request bodies, and maps validation/not-found/authentication failures to Connect status codes. Node and browser clients accept an explicit session-token callback. The original Go `NewHandler` adapter accepts a context-aware repository and mandatory authorization callback, with a pre-decode authorization gate, 64 KiB request limit and 128 KiB response limit. Its `NewClient` wraps the generated client, adds a per-call session callback and five-second default deadline, and rejects redirects by default. Session callbacks and injected transports must honor the supplied context; callers that inject their own HTTP client also own its redirect policy. The receiving service configures its trusted base URL, TLS, identity, per-user authorization, HTTP timeouts and persistence. Return typed Connect errors for expected authorization denials; unexpected callback/repository errors become a generic internal error.

Both bounded in-memory repositories preserve insertion order, cap storage at 1,000 items, trim titles with ECMAScript whitespace semantics, and count the 200-character title limit in Unicode code points. A page size of zero defaults to 20; valid explicit page sizes are 1–100, cursors are nonnegative offsets, and `nextCursor: 0` marks the end. IDs are opaque and stable within their own repository instance. `connect-go` remains a separate module from the `go/` sqlc repository. Adopt its local module path through the receiving repository's workspace/module policy; synchronize the protobuf `go_package` and Go imports if you rename the module.

Run from this pack with Node and Go on `PATH`:

```sh
npm ci --ignore-scripts
npm run lint:proto
npm test
go -C connect-go mod download
npm run test:go
npm run test:cross-language
```

Generation is explicit: `npm run generate` creates TypeScript descriptors, and `npm run generate:go` invokes the pinned Go tools through Buf. Neither an installer hook nor a global generator install is required. Generated source, build output, downloaded runtime implementation and the fixture executable are excluded from delivered files. The commands regenerate the bindings from the delivered original schema; keep `go.sum` and the npm lockfile with the source.

`tests/conformance.json` supplies the same expected results to both language runners: three create/get round trips (including Unicode and whitespace), five pagination cases, and ten typed validation/authentication/not-found failures. The runners check that rejected requests leave storage unchanged. The tests exercise all four combinations:

| Client | Service | Check |
| --- | --- | --- |
| TypeScript Node | TypeScript Node | `npm test` |
| Generated Go | Generated Go handler with original adapter | `npm run test:go` |
| Generated Go | TypeScript Node | `npm run test:cross-language` |
| TypeScript Node | Generated Go handler with original adapter | `npm run test:cross-language` |

The cross-language command builds `connect-go/cmd/fixture`, launches ephemeral loopback services and tears them down after each test. Its `serve` mode binds `127.0.0.1:0`; `check` accepts only an explicit loopback URL and uses the public fixture token. Go tests also cover pre-decode authentication, oversized requests, masked repository errors, token failure, cancellation/deadline handling, redirect refusal and concurrent repository access. No remote service is involved. The measured interoperability profile is unary Connect over local HTTP/1.1 with generated protobuf codecs; browser CORS, gRPC, HTTP/2, streaming and production deployment need receiving-application acceptance.

Run `npm run serve` after the Node build for manual integration. `buf breaking --against <trusted-revision-or-image>` is an additional receiving-repository gate; choose the real baseline. [Connect Node](https://connectrpc.com/docs/node/getting-started/) and [Connect Go generation](https://connectrpc.com/docs/go/getting-started/).

## sqlc Go repository

The SQLite queries generate a typed `database/sql` API. The original repository wraps it with validated atomic batch insertion, completion updates, cancellation and missing-record errors. It deliberately owns its transaction, so do not call it from a transaction that the caller expects to control. The receiving app owns database creation/migrations, pool/connection settings, authorization, retry policy and persistence lifetime.

Install pinned generator `go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1`. In `go/`, run `sqlc generate`, `go mod tidy`, and `go test ./...`. Commit `go.sum` from verified dependency resolution. The tests use real SQLite and generated queries, and require Go 1.24+ (the selected dependency toolchain may require a newer patch). Code generation is explicit and never runs as an installer hook. [sqlc generation](https://docs.sqlc.dev/en/latest/howto/generate.html).

The interoperable Connect profile and sqlc repository are independently opt-in. Each service owns its repository instance; use the repository interface to adapt the chosen receiving service's persistence boundary. Verification notes separate the local Go/TypeScript protocol checks, SQL runtime tests and receiving-application deployment gates.
