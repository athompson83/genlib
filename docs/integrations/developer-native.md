# Developer, backend and native integration packs

These nine opt-in packs turn reviewed external tools into editable source, configurations and behavioral fixtures. Each pack has its own dependency manifests, explicit file list and `CONTRACT.md`. Genlib copies the selected files and records integrity; it does not install dependencies, run generators, create an application host, start a service or publish an artifact.

Use `genlib integration list`, inspect one pack, then plan its installation into the receiving application. Read that application's instructions and selected pack contract before running its development commands. The shared [integration guide](../integrations.md) documents the safe installer and update boundary.

## Choose a pack

| Pack | Included working profiles | Application decisions still required |
| --- | --- | --- |
| [`developer-codemods`](../../integrations/developer-codemods/CONTRACT.md) | ts-morph import migration; LibCST import migration; ast-grep call rewrite; dependency-cruiser architecture rules; Copier three-way template update; separate Rector and OpenRewrite fixtures | Exact migration scope, receiving-app compile/tests, conflict review, approved templates and recipe artifacts |
| [`api-contracts`](../../integrations/api-contracts/CONTRACT.md) | Original OpenAPI contract, generated typed client, loopback server, Hurl and Schemathesis runners, oasdiff breaking-change assertion, Orval/Hey API/TypeSpec configurations and optional Microcks | Canonical contract, credentials and authorization, production transport policies, chosen client generator and real compatibility baseline |
| [`native-acceptance`](../../integrations/native-acceptance/CONTRACT.md) | New Flutter fixture host; widget/Patrol assertions; Maestro flow; Swift text baseline and an iOS visual snapshot test | Android/Xcode target setup, emulator, app IDs, accessible selectors and reviewed visual baseline on a fixed simulator |
| [`native-persistence`](../../integrations/native-persistence/CONTRACT.md) | SQLDelight Kotlin/JVM+iOS repository; GRDB Swift repository; original SQLite schema/migration fixtures and transaction tests | Native toolchains, durable driver lifecycle, migration rollout, concurrency, backups and sync |
| [`shared-rust-core`](../../integrations/shared-rust-core/CONTRACT.md) | Validated Rust state transitions; shared conformance fixture; Python FFI test; Swift/Kotlin/Python generation and host test source | Architecture-specific libraries, native linking and ABI tests, storage/authorization, UniFFI distribution obligations |
| [`desktop-delivery`](../../integrations/desktop-delivery/CONTRACT.md) | Electron, Tauri, Wails and Avalonia shells; narrow IPC boundary; explicit .NET update flow; local Windows Velopack packaging | One selected shell, WebView/OS prerequisites, installed-app acceptance, signing, controlled feed and release process |
| [`authorization-collaboration`](../../integrations/authorization-collaboration/CONTRACT.md) | OpenFGA check adapter and model fixtures; real Cedar policy/schema; Loro inventory/tree adapters and replica convergence tests | Trusted actors/entities, model/tuple lifecycle, authorization before CRDT transport, durable snapshots and conflict policy |
| [`typed-backend-services`](../../integrations/typed-backend-services/CONTRACT.md) | Generated Protobuf/Connect TypeScript service and clients; generated sqlc Go SQLite repository; real protocol and transaction tests | Chosen service runtime, injected persistence and authorization, database lifecycle, browser/CORS deployment and contract baseline |
| [`observability-harness`](../../integrations/observability-harness/CONTRACT.md) | Node/Python OpenTelemetry wrappers and span tests; explicit Collector configuration; Node/Python PostgreSQL Testcontainers fixtures | Trusted exporter and backend, permitted telemetry fields, production sampling, Docker runner and image policy |

These are independent profiles. A Node Connect fixture and a Go sqlc repository do not share process memory. Loro convergence does not authorize an action. A generated Swift or Kotlin binding does not establish native linking or mobile packaging. Each contract identifies the boundary where the receiving application supplies the missing behavior.

## Measured verification

The implementation environment was Linux x86_64 with Node 24.19.0 and Python 3.12.14. Isolated Rust 1.99.0 and Go 1.27.2 toolchains were provisioned for the selected runtime checks. Results below describe this environment; later CI results should be recorded separately.

| Pack/profile | Result recorded during implementation | Limits |
| --- | --- | --- |
| Developer Node | 3 tests passed using real ts-morph, ast-grep and dependency-cruiser | PHP/Rector and Java/Maven/OpenRewrite not executed here |
| Developer Python | 4 tests passed with LibCST 1.9.0 and Copier 9.18.2, including a real disposable Git template upgrade | Arbitrary receiving-template conflicts are not guaranteed to merge |
| API Node | Generated client/typecheck and 4 real HTTP/transport tests passed; Orval 8.41.0, Hey API 0.99.0 and TypeSpec 1.17.0 generation completed | Alternative generators were generated, not exercised as production clients; Hurl/oasdiff/Microcks were not run |
| API Schemathesis | Schemathesis 4.30.1, seed 42, all selected checks, coverage and fuzzing: 100 generated cases passed against the disposable fixture | Stateful testing disabled; explicit schema examples absent; no remote API tested |
| Persistence SQL | 2 Python SQLite tests passed for migration, defaults, constraints and rollback | Kotlin/SQLDelight generation and Swift/GRDB compilation not run |
| Shared Rust | 2 Cargo tests passed; actual generated Python shared-library conformance/error tests passed; Swift and Kotlin bindings generated | Swift/Kotlin host compilation, mobile ABIs and release linking not run |
| Desktop portable | 2 Node IPC/input tests passed; Go method test passed | No Electron GUI, Wails/Tauri build, Avalonia runtime or update VM acceptance |
| Authorization/collaboration | 6 Node tests passed with real Loro and injected OpenFGA HTTP; 2 real Cedar 4.13.0 policy tests passed | OpenFGA CLI model tests and live deployment not run |
| Typed backend | Protobuf lint/generation/typecheck and 2 real Connect HTTP tests passed; sqlc 1.31.1 generation and Go repository test passed | Browser/CORS and production service deployment not run |
| Telemetry | 2 real Node SDK tests and 1 real Python SDK test passed with in-memory exporters | Docker, Collector and PostgreSQL Testcontainers not run |
| Native acceptance | Source/configuration supplied; fixture-scaffold JavaScript syntax checked | Flutter/Patrol/Maestro/Swift/Xcode execution and image-baseline review not run |

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

For the typed backend, also run `npm run lint:proto`. Node 24 is the verified development lane; the manifest and contract give each package's supported lower bound. Ignoring package install scripts is deliberate. Electron's binary must be separately provisioned before launching its GUI; it is unnecessary for the portable IPC tests.

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

The verified Go lane used 1.27.2; the repository module requires Go 1.24+. `go.sum` is included. For the portable Wails method in `desktop-delivery`, run `go -C wails test app.go app_test.go`; this command intentionally does not build the GUI host.

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
| Hurl | Separately provisioned Hurl CLI | In `api-contracts`: `npm run test:hurl` |
| oasdiff | Separately provisioned oasdiff CLI | In `api-contracts`: `npm run test:breaking`; unchanged contract must pass and deliberately removed operation must fail |
| Microcks | Docker Compose | Follow `api-contracts/CONTRACT.md` to start the local service and import the authored specification |
| OpenFGA model | Compatible `fga` CLI | In `authorization-collaboration`: `fga model test --tests openfga/model.fga.yaml` |
| SQLDelight JVM | Java, a verified compatible Gradle installation, Kotlin 2.4.21 and SQLDelight 2.4.1 | In `native-persistence`: `gradle -p kotlin jvmTest` and `gradle -p kotlin verifySqlDelightMigration` |
| SQLDelight iOS | The previous tools plus macOS/Xcode | `gradle -p kotlin compileKotlinIosSimulatorArm64` |
| GRDB Swift | macOS, Swift 6.1+; GRDB 7.11.1 | In `native-persistence`: `swift test --package-path swift` |
| Swift text snapshots | macOS, Swift 6.1+; SnapshotTesting 1.19.6 | In `native-acceptance`: `swift test --package-path swift` |
| Flutter widget behavior | Flutter 3.32+/Dart 3.8+ | Create a new fixture with `node flutter/create-fixture.mjs /tmp/genlib-native-fixture`; in that fixture run `flutter pub get` and `flutter test test/inventory_test.dart` |
| Patrol | Patrol 4.10.0, patrol_cli 4.8.0, configured native test target and booted emulator; Java 17/Android SDK or macOS/Xcode | In the configured fixture: `patrol doctor`, then `patrol test -t patrol_test/inventory_test.dart` |
| Maestro | Java 17+ and installed disposable fixture on Android or an iOS simulator | In `native-acceptance`: `maestro test -e APP_ID=dev.genlib.genlib_inventory maestro/inventory.yaml`; select the iOS bundle ID for iOS |
| Avalonia | .NET 10 on the selected OS; Avalonia 12.1.4 | In `desktop-delivery`: `dotnet test avalonia-tests/GenlibInventory.Tests.csproj`; separately launch and exercise the GUI |
| Wails | Wails 2.14.0, Go and the selected OS WebView/GUI build tools | In `desktop-delivery/wails`: `wails doctor` and `wails build` |
| Tauri | Pinned npm/Cargo dependencies and selected OS WebView/build tools | In `desktop-delivery`: `npm run tauri:build`; packaging/signing remains application-specific |
| Velopack | Windows PowerShell/.NET 10, pinned vpk/Velopack 1.2.161 | In `desktop-delivery`: `./velopack/package-windows.ps1 -Version 0.1.0`; then test installed v0.1.0 to v0.1.1 updates in a disposable VM |
| Node Testcontainers | Docker daemon, disposable approved PostgreSQL image | In `observability-harness`: `npm run test:containers` |
| Python Testcontainers | Docker, Python environment with `python/requirements-containers.txt` | In `observability-harness`: `python -m pytest python/test_containers.py` |

No Gradle version is presented as verified: its plugin/toolchain compatibility must be resolved on the selected native lane. Receiving native projects should commit their generated Gradle, Swift, Flutter and Composer locks after successful resolution. Do not fabricate locks or image baselines to make a gate appear complete.

The Collector gate and local Compose startup are specified in its contract. Real telemetry exporters and production retention are configured by the receiving service. The PostgreSQL fixtures use `postgres:18.6-alpine3.24` by default; an approved immutable digest can be supplied with `GENLIB_TEST_POSTGRES_IMAGE`.

## Provenance and distribution

The delivered source, configuration, fixtures and adapters are original Apache-2.0 contributions. Third-party packages are resolved externally and retain their own terms. Lockfiles record dependency resolution; they are not third-party source vendoring. The SQLDelight version-one database is an original schema-only fixture. Wails' small `frontend/dist` files are authored static HTML/CSS/JavaScript, not a bundled third-party runtime.

Generated OpenAPI/Protobuf/sqlc/UniFFI trees and compiler outputs are excluded from pack delivery and version control. Tests regenerate from the original schemas/configuration. When an application commits or distributes generated output, retain the actual generator/runtime notices; an Apache pack manifest does not relicense runtime templates. In particular, UniFFI uses MPL-2.0 and LibCST has additional bundled PSF/Apache notices alongside its MIT core. Platform runtimes and container operating-system packages have their own notices.

OpenRewrite is an explicitly narrow core recipe profile. Only `org.openrewrite.java.ChangePackage` is selected. The declared core coordinates and build plugins have explicit pins; external MSAL/proprietary recipe bundles are excluded. The selection allowlist does not claim to be a complete license inventory of the tool's parser/transitive dependencies. Maven Central POM resolution established the documented artifact versions; the Java gate was not executed in this environment.

## Primary documentation

Use the pinned package manifests for versions and these upstream sources for integration details. Reading a source or resolving a package is distinct from the measured runtime results above.

- Codemods and templates: [Copier](https://copier.readthedocs.io/), [ts-morph](https://ts-morph.com/), [LibCST](https://libcst.readthedocs.io/), [Rector](https://getrector.com/documentation), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [ast-grep](https://ast-grep.github.io/), [OpenRewrite](https://docs.openrewrite.org/).
- API contracts: [OpenAPI TypeScript/fetch](https://openapi-ts.dev/), [Orval](https://orval.dev/), [Hey API](https://heyapi.dev/), [TypeSpec](https://typespec.io/), [oasdiff](https://github.com/oasdiff/oasdiff), [Hurl](https://hurl.dev/), [Schemathesis](https://schemathesis.readthedocs.io/), [Microcks](https://microcks.io/).
- Native integration: [Patrol compatibility](https://patrol.leancode.co/documentation/compatibility-table), [Maestro](https://docs.maestro.dev/), [Swift Snapshot Testing](https://github.com/pointfreeco/swift-snapshot-testing), [SQLDelight](https://sqldelight.github.io/sqldelight/latest/), [GRDB](https://github.com/groue/GRDB.swift), [UniFFI](https://mozilla.github.io/uniffi-rs/latest/).
- Desktop hosts: [Electron](https://www.electronjs.org/docs/latest/), [Tauri](https://v2.tauri.app/), [Wails](https://wails.io/docs/introduction), [Avalonia](https://docs.avaloniaui.net/), [Velopack](https://docs.velopack.io/).
- Services and state: [Cedar](https://docs.cedarpolicy.com/), [OpenFGA model tests](https://openfga.dev/docs/modeling/testing), [Loro](https://loro.dev/docs), [Connect](https://connectrpc.com/docs/), [sqlc](https://docs.sqlc.dev/), [OpenTelemetry](https://opentelemetry.io/docs/), [Testcontainers Node](https://node.testcontainers.org/), [Testcontainers Python](https://testcontainers-python.readthedocs.io/).
