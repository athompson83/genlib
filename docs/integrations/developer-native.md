# Developer, backend and native integration packs

These nine opt-in packs turn reviewed external tools into editable source, configurations and behavioral fixtures. Each pack has its own dependency manifests, explicit file list and `CONTRACT.md`. Genlib copies the selected files and records integrity; it does not install dependencies, run generators, create an application host, start a service or publish an artifact.

Use `genlib integration list`, inspect one pack, then plan its installation into the receiving application. Read that application's instructions and selected pack contract before running its development commands. The shared [integration guide](../integrations.md) documents the safe installer and update boundary.

## Choose a pack

| Pack | Included working profiles | Application decisions still required |
| --- | --- | --- |
| [`developer-codemods`](../../integrations/developer-codemods/CONTRACT.md) | ts-morph import migration; LibCST import migration; ast-grep call rewrite; dependency-cruiser architecture rules; Copier three-way template update; separate Rector and OpenRewrite fixtures | Exact migration scope, receiving-app compile/tests, conflict review, approved templates and recipe artifacts |
| [`api-contracts`](../../integrations/api-contracts/CONTRACT.md) | Original OpenAPI contract, typed client, pagination, ETag/bodyless-304 caching, bounded upload create/chunk/complete workflow, Hurl/Schemathesis/oasdiff gates, alternative generator profiles and optional Microcks | Canonical contract, credentials and authorization, production transport policies, chosen client generator and real compatibility baseline |
| [`native-acceptance`](../../integrations/native-acceptance/CONTRACT.md) | Deterministic sign-in, real permission boundary, navigation, offline queue/failure/retry; widget/controller and Patrol/Maestro flows; five iOS presentation snapshots | Android/Xcode target setup, emulator, app IDs, accessible selectors and reviewed visual baseline on a fixed simulator |
| [`native-persistence`](../../integrations/native-persistence/CONTRACT.md) | SQLDelight Kotlin/JVM+iOS repository; GRDB Swift repository; original SQLite schema/migration fixtures and transaction tests | Native toolchains, durable driver lifecycle, migration rollout, concurrency, backups and sync |
| [`shared-rust-core`](../../integrations/shared-rust-core/CONTRACT.md) | Validated Rust state transitions; shared conformance fixture; Python FFI test; Swift/Kotlin/Python generation and host test source | Architecture-specific libraries, native linking and ABI tests, storage/authorization, UniFFI distribution obligations |
| [`desktop-delivery`](../../integrations/desktop-delivery/CONTRACT.md) | Four real native picker/OS-vault hosts; bounded IPC; signed or checksum-validated update flows; explicit local Electron/Tauri/Wails/Velopack release scripts | One selected shell, WebView/OS prerequisites, installed-app acceptance, signing, controlled feed and release process |
| [`authorization-collaboration`](../../integrations/authorization-collaboration/CONTRACT.md) | OpenFGA check adapter and model fixtures; real Cedar policy/schema; Loro inventory/tree adapters and replica convergence tests | Trusted actors/entities, model/tuple lifecycle, authorization before CRDT transport, durable snapshots and conflict policy |
| [`typed-backend-services`](../../integrations/typed-backend-services/CONTRACT.md) | Generated TypeScript and Go Connect clients/servers, shared pagination/error conformance, both cross-language HTTP directions, and an independent generated sqlc Go SQLite repository | Chosen service runtime, injected persistence and authorization, database lifecycle, browser/CORS deployment and contract baseline |
| [`observability-harness`](../../integrations/observability-harness/CONTRACT.md) | Node/Python OpenTelemetry wrappers and span tests; explicit Collector configuration; Node/Python PostgreSQL Testcontainers fixtures | Trusted exporter and backend, permitted telemetry fields, production sampling, Docker runner and image policy |

These are independent profiles. A Node Connect fixture and a Go sqlc repository do not share process memory. Loro convergence does not authorize an action. A generated Swift or Kotlin binding does not establish native linking or mobile packaging. Each contract identifies the boundary where the receiving application supplies the missing behavior.

## Measured verification

The implementation environment was Linux x86_64 with Node 24.19.0 and Python 3.12.14. Isolated Rust 1.99.0 and Go 1.27.2 toolchains were provisioned for the selected runtime checks. Results below describe this environment; later CI results should be recorded separately.

| Pack/profile | Result recorded during implementation | Limits |
| --- | --- | --- |
| Developer Node | 3 tests passed using real ts-morph, ast-grep and dependency-cruiser | PHP/Rector and Java/Maven/OpenRewrite not executed here |
| Developer Python | 4 tests passed with LibCST 1.9.0 and Copier 9.18.2, including a real disposable Git template upgrade | Arbitrary receiving-template conflicts are not guaranteed to merge |
| API Node | Generated client/typecheck and 7 real HTTP/transport tests passed, including successful pagination, ETag/bodyless 304 and chunk upload/concurrent-offset/completion behavior; Orval 8.41.0, Hey API 0.99.0 and TypeSpec 1.17.0 generation completed | Alternative generators were generated, not exercised as production clients; Microcks was not run |
| API HTTP tools | Hurl 8.0.1 passed all 22 request-chain assertions; oasdiff v1.33.0 accepted the unchanged schema and rejected removal of `GET /items` | Linux x86_64, verified upstream Hurl asset and exact oasdiff module built with Go 1.27.2; pins/checksums in `api-contracts/http/tool-versions.json` |
| API Schemathesis | Schemathesis 4.30.1, seed 42, coverage and fuzzing across 8 operations: 284 generated cases passed, 14 skipped | Examples absent and stateful testing disabled; state-dependent PATCH/complete operations mostly rejected generated requests, while positive chains passed separately in Hurl/Node; no remote API tested |
| Persistence SQL | 2 Python SQLite tests passed for migration, defaults, constraints and rollback | Kotlin/SQLDelight generation and Swift/GRDB compilation not run |
| Shared Rust | 2 Cargo tests passed; actual generated Python shared-library conformance/error tests passed; Swift and Kotlin bindings generated | Swift/Kotlin host compilation, mobile ABIs and release linking not run |
| Desktop portable | 9 Node tests, 5 Go tests and 3 standalone Rust tests passed; real bounded file IO, simulated credential adapters, TLS/ECDSA update staging/final synthetic-file replacement and validation errors; Windows amd64 Wails cross-build passed | No OS vault, GUI, Tauri native compile, Avalonia runtime or installed update acceptance; synthetic update file never executed |
| Authorization/collaboration | 6 Node tests passed with real Loro and injected OpenFGA HTTP; 2 real Cedar 4.13.0 policy tests passed | OpenFGA CLI model tests and live deployment not run |
| Typed backend | Protobuf lint/generation/typecheck; 3 Node tests, 6 Go tests including a race run, and 2 cross-language HTTP tests passed; sqlc 1.31.1 generation and its separate Go repository test passed | Generated Go→TypeScript and TypeScript→Go over local HTTP/1.1 Connect; browser/CORS, HTTP/2, gRPC, streaming and production deployment not run |
| Telemetry | 2 real Node SDK tests and 1 real Python SDK test passed with in-memory exporters | Docker, Collector and PostgreSQL Testcontainers not run |
| Native acceptance | Three widget flows, two controller tests, complete Patrol/Maestro state flows and five iOS image scenarios authored; fixture-scaffold JavaScript syntax checked | Flutter/Patrol/Maestro/Swift/Xcode execution and image-baseline review not run locally; Flutter 3.47.7 is the resolved headless CI version |

`verification.profiles` carries these scoped results into discovery. The authorization/collaboration and typed-backend packs are marked tested for their named local runtime profiles. Packs with unavailable native, GUI, container or optional tool gates remain experimental. An unavailable prerequisite must fail an explicitly selected gate; there are no success placeholders.

## Portable development and CI commands

Run commands from the selected pack directory unless another directory is named. Provision tools deliberately; package managers are never run by the Genlib installer. The npm lockfiles and Python frozen requirements record the resolved development environment. Rust and Go fixtures include their verified lock/checksum files. Review dependency updates together with generated diffs and behavior tests.

### Node profiles

For `developer-codemods`, `api-contracts`, `desktop-delivery`, `authorization-collaboration`, `typed-backend-services` and `observability-harness`:

```sh
npm ci --ignore-scripts
npm test
```

`api-contracts` generates its default types before compiling the client. `typed-backend-services` generates its descriptors before compiling and running its local service tests. Extra API-generation gates are:

```sh
npm run generate:orval
npm run generate:hey
npm run generate:typespec
```

For the typed backend, also run `npm run lint:proto`, `go -C connect-go mod download`, `npm run test:go` and `npm run test:cross-language`. The separate Connect Go module requires Go 1.25+ and pins Connect Go 1.21.0 and Protobuf/protoc-gen-go 1.36.12 through Go tool directives and `go.sum`. Both generated implementations consume the shared conformance fixture: 3 create/get round trips, 5 pagination cases and 10 typed-error cases, including rejected-write storage checks. Node 24 is the verified development lane; the manifest and contract give each package's supported lower bound. Ignoring package install scripts is deliberate. Electron's binary must be separately provisioned before launching its GUI; it is unnecessary for the portable IPC tests.

### Isolated Python profiles

Use Python 3.12 and a separate virtual environment per pack. The following example is for developer codemods:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.lock.txt
.venv/bin/python -m unittest discover -s python -v
```

Git is required for the disposable Copier update test. In `observability-harness`, install its own `python/requirements.lock.txt` and run:

```sh
.venv/bin/python -m unittest discover -s python -p test_telemetry.py -v
```

In `api-contracts`, install `http/requirements.lock.txt` and expose that environment's executable directory to the runner:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r http/requirements.lock.txt
PATH="$PWD/.venv/bin:$PATH" npm run test:schemathesis
```

The API runner chooses an ephemeral loopback port, creates the server, invokes the selected CLI, and closes the server even after failure. A fixed public fixture token is local test data. In `native-persistence`, the standard-library SQL prerequisite needs no external package:

```sh
python3 tests/test_sql_profile.py
```

Windows virtual environments use `Scripts` instead of `bin`; these Python commands were exercised on Linux. They are not a claim of native Windows tool execution.

### Go and Rust profiles

For `typed-backend-services`, ensure the installed generator's directory is on PATH:

```sh
go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1
sqlc generate -f go/sqlc.yaml
go -C go test ./...
```

The verified Go lane used 1.27.2; the repository module requires Go 1.24+. `go.sum` is included. For the desktop pack, run `go -C wails test app.go app_test.go delivery.go delivery_test.go` (Go 1.25.12+) to exercise the narrow methods, bounded HTTPS source, real signatures and consent-before-install behavior without building the GUI. A Windows host compile gate is `go -C wails build -tags desktop,production -o ../build/wails-fixture.exe .`. Standalone Tauri validation tests use `rustc --edition 2021 --test tauri/src-tauri/src/boundary.rs -o /tmp/genlib-desktop-boundary-tests` and then run that executable; a native `cargo check` remains separate.

For `shared-rust-core`:

```sh
cargo test --locked
python3 bindings/generate.py python
python3 bindings/test_python.py
python3 bindings/generate.py swift
python3 bindings/generate.py kotlin
```

The generator uses the pinned UniFFI 0.32.2 from Cargo.lock, queries Cargo's target directory, builds the host library and preserves generated outputs separately. Clear `CARGO_BUILD_TARGET` for this host-binding fixture. Cross-compilation and architecture packaging are separate receiving-project operations.

For `authorization-collaboration`:

```sh
cargo test --locked --manifest-path cedar/Cargo.toml
```

The verified Cedar run used two build jobs, no development debug information and an isolated target directory after the workspace filesystem failed to archive a compiled object. A CI runner with similar constraints can set `CARGO_BUILD_JOBS=2`, `CARGO_PROFILE_DEV_DEBUG=0` and a writable `CARGO_TARGET_DIR`; source and test failures still fail normally.

## Optional tool and native gates

These commands are executable gates, not results. Provision the exact selected toolchain and record the run before promoting a profile.

| Profile | Required environment | Gate |
| --- | --- | --- |
| Rector | PHP 8.2+ and Composer; Rector 2.7.0 pinned in `php/composer.json` | In `developer-codemods/php`: `composer install --no-interaction`, then `composer test`; `composer preview` is a dry-run diff gate and may fail when changes are expected |
| OpenRewrite | Python 3, Java 17+, Maven; core 8.90.4, Maven plugin 6.46.1, compiler plugin 3.14.1 | In `developer-codemods`: `python3 openrewrite/verify.py` checks actual package migration, Java behavior and idempotence in a disposable checkout |
| Hurl | Separately provisioned Hurl 8.0.1 CLI | In `api-contracts`: `npm run test:hurl` |
| oasdiff | Separately provisioned oasdiff v1.33.0 CLI | In `api-contracts`: `npm run test:breaking`; unchanged contract must pass and deliberately removed operation must fail |
| Microcks | Docker Compose | Follow `api-contracts/CONTRACT.md` to start the local service and import the authored specification |
| OpenFGA model | Compatible `fga` CLI | In `authorization-collaboration`: `fga model test --tests openfga/model.fga.yaml` |
| SQLDelight JVM | Java, a verified compatible Gradle installation, Kotlin 2.4.21 and SQLDelight 2.4.1 | In `native-persistence`: `gradle -p kotlin jvmTest` and `gradle -p kotlin verifySqlDelightMigration` |
| SQLDelight iOS | The previous tools plus macOS/Xcode | `gradle -p kotlin compileKotlinIosSimulatorArm64` |
| GRDB Swift | macOS, Swift 6.1+; GRDB 7.11.1 | In `native-persistence`: `swift test --package-path swift` |
| Swift text snapshots | macOS, Swift 6.1+; SnapshotTesting 1.19.6 | In `native-acceptance`: `swift test --package-path swift` |
| Flutter widget/controller behavior | Flutter 3.47.7 stable, exact ref `abaf9c523780a608bd46686fd5e53740a07077f8`; source minimum Flutter 3.32/Dart 3.8 | Create a new fixture with `node flutter/create-fixture.mjs /tmp/genlib-native-fixture`; in that fixture run `flutter pub get` and `flutter test --reporter expanded` |
| Patrol | Patrol 4.10.0, patrol_cli 4.8.0, configured native test target and booted emulator; Java 17/Android SDK or macOS/Xcode | In the configured fixture: `patrol doctor`, then `patrol test -t patrol_test/inventory_test.dart` |
| Maestro | CLI 2.11.0, Java 17+ and installed disposable fixture on Android or an iOS simulator | In `native-acceptance`: `maestro test -e APP_ID=dev.genlib.genlib_inventory maestro/inventory.yaml` and `maestro test -e APP_ID=dev.genlib.genlib_inventory maestro/permission-denied.yaml`; select the iOS bundle ID for iOS |
| Avalonia | .NET 10 on the selected OS; Avalonia 12.1.4 | In `desktop-delivery`: `dotnet test avalonia-tests/GenlibInventory.Tests.csproj`; separately launch and exercise the GUI |
| Wails | Wails 2.14.0, Go 1.25.12+ and selected OS WebView/GUI tools | In `desktop-delivery/wails`: `wails doctor` and `wails build`; `npm run wails:package` from the pack produces signed Windows/Linux update files with the required release-owner feed/key inputs |
| Tauri | Rust 1.99 selected, pinned Cargo/npm dependencies, selected OS WebView/build tools | In `desktop-delivery`: `cargo check --locked --manifest-path tauri/src-tauri/Cargo.toml`; `npm run tauri:package` enables native bundles and version-bound signatures with the configured release-owner key |
| Electron delivery | Matching desktop OS, Electron binary and release-owner signing configuration | `npm run electron:package` with version/feed configuration; Windows requires the signing publisher. The script forces signing on Windows/macOS and never publishes |
| Velopack | Windows PowerShell/.NET 10, pinned vpk/Velopack 1.2.161 | In `desktop-delivery`: `./velopack/package-windows.ps1 -Version 0.1.0 -UpdateFeed https://updates.example.invalid/inventory/windows-x64/`; then test installed v0.1.0 to v0.1.1 updates in a disposable VM |
| Node Testcontainers | Docker daemon, disposable approved PostgreSQL image | In `observability-harness`: `npm run test:containers` |
| Python Testcontainers | Docker, Python environment with `python/requirements-containers.txt` | In `observability-harness`: `python -m pytest python/test_containers.py` |

No Gradle version is presented as verified: its plugin/toolchain compatibility must be resolved on the selected native lane. Receiving native projects should commit their generated Gradle, Swift, Flutter and Composer locks after successful resolution. Do not fabricate locks or image baselines to make a gate appear complete.

Native device fixtures additionally require the camera permission declarations and host test setup in `native-acceptance/CONTRACT.md`. The Flutter stable ref is verified through the [official SDK documentation](https://docs.flutter.dev/install/manual) and [tag API](https://api.github.com/repos/flutter/flutter/git/ref/tags/3.47.7); this lookup is not a Flutter test result. Wails automatic executable updates support Windows/Linux; Avalonia's supplied Velopack packaging targets Windows x64. Their other OS windows/pickers/vaults do not imply unimplemented release support.

The Collector gate and local Compose startup are specified in its contract. Real telemetry exporters and production retention are configured by the receiving service. The PostgreSQL fixtures use `postgres:18.6-alpine3.24` by default; an approved immutable digest can be supplied with `GENLIB_TEST_POSTGRES_IMAGE`.

## Provenance and distribution

The delivered source, configuration, fixtures and adapters are original Apache-2.0 contributions. Third-party packages are resolved externally and retain their own terms. Lockfiles record dependency resolution; they are not third-party source vendoring. The SQLDelight version-one database is an original schema-only fixture. Wails' small `frontend/dist` files are authored static HTML/CSS/JavaScript, not a bundled third-party runtime. Desktop PNG/ICO icons are exports of the original included SVG through the pinned Tauri CLI, not stock artwork or generated runtime code.

Generated OpenAPI/Protobuf/sqlc/UniFFI trees and compiler outputs are excluded from pack delivery and version control. Tests regenerate from the original schemas/configuration. When an application commits or distributes generated output, retain the actual generator/runtime notices; an Apache pack manifest does not relicense runtime templates. In particular, UniFFI uses MPL-2.0 and LibCST has additional bundled PSF/Apache notices alongside its MIT core. Platform runtimes and container operating-system packages have their own notices.

OpenRewrite is an explicitly narrow core recipe profile. Only `org.openrewrite.java.ChangePackage` is selected. The declared core coordinates and build plugins have explicit pins; external MSAL/proprietary recipe bundles are excluded. The selection allowlist does not claim to be a complete license inventory of the tool's parser/transitive dependencies. Maven Central POM resolution established the documented artifact versions; the Java gate was not executed in this environment.

## Primary documentation

Use the pinned package manifests for versions and these upstream sources for integration details. Reading a source or resolving a package is distinct from the measured runtime results above.

- Codemods and templates: [Copier](https://copier.readthedocs.io/), [ts-morph](https://ts-morph.com/), [LibCST](https://libcst.readthedocs.io/), [Rector](https://getrector.com/documentation), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [ast-grep](https://ast-grep.github.io/), [OpenRewrite](https://docs.openrewrite.org/).
- API contracts: [OpenAPI TypeScript/fetch](https://openapi-ts.dev/), [Orval](https://orval.dev/), [Hey API](https://heyapi.dev/), [TypeSpec](https://typespec.io/), [oasdiff](https://github.com/oasdiff/oasdiff), [Hurl](https://hurl.dev/), [Schemathesis](https://schemathesis.readthedocs.io/), [Microcks](https://microcks.io/).
- Native integration: [Patrol compatibility](https://patrol.leancode.co/documentation/compatibility-table), [Maestro](https://docs.maestro.dev/), [Swift Snapshot Testing](https://github.com/pointfreeco/swift-snapshot-testing), [SQLDelight](https://sqldelight.github.io/sqldelight/latest/), [GRDB](https://github.com/groue/GRDB.swift), [UniFFI](https://mozilla.github.io/uniffi-rs/latest/).
- Desktop hosts: [Electron](https://www.electronjs.org/docs/latest/), [Tauri](https://v2.tauri.app/), [Wails](https://wails.io/docs/introduction), [Avalonia](https://docs.avaloniaui.net/), [Velopack](https://docs.velopack.io/), [electron-updater](https://www.electron.build/auto-update.html), [Tauri updater](https://v2.tauri.app/plugin/updater/), [go-selfupdate](https://github.com/creativeprojects/go-selfupdate/tree/v1.6.0), [go-keyring](https://github.com/zalando/go-keyring), [Rust keyring](https://docs.rs/keyring/4.2.0/keyring/), [ktsu.CredentialCache](https://github.com/ktsu-dev/CredentialCache/tree/v1.3.62).
- Services and state: [Cedar](https://docs.cedarpolicy.com/), [OpenFGA model tests](https://openfga.dev/docs/modeling/testing), [Loro](https://loro.dev/docs), [Connect](https://connectrpc.com/docs/), [sqlc](https://docs.sqlc.dev/), [OpenTelemetry](https://opentelemetry.io/docs/), [Testcontainers Node](https://node.testcontainers.org/), [Testcontainers Python](https://testcontainers-python.readthedocs.io/).
