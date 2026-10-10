# Native SQLite persistence

This pack contains original Apache-2.0 repository glue, SQL and tests. SQLDelight is Apache-2.0; GRDB.swift is MIT. External dependencies are not vendored. Kotlin/JVM and Kotlin/iOS use generated SQLDelight queries; Swift uses GRDB directly. Choose the stack already present in the application.

## Behavior

Both repositories create, list, complete and archive inventory records. Batch insertion is a database transaction: an invalid or duplicate record rolls back earlier rows in the same batch. Queries use bound parameters. Version-one rows survive the additive archive migration. The receiving app owns stable IDs, backups, retention, encryption/key storage, concurrency scheduling, sync, and conflict policy. This fixture is not a synchronization engine. The returned SQLDelight driver must be closed by its owner. The JVM factory is deliberately in-memory; the iOS driver opens a versioned persistent file.

Kotlin files use SQLDelight 2.4.1 and Kotlin 2.4.21, pinned for review. With a compatible Gradle installation, run `gradle -p kotlin jvmTest` to generate queries and run repository behavior tests, and `gradle -p kotlin verifySqlDelightMigration` for the checked-in original version-one schema database. Generate a Gradle wrapper from the verified Gradle version in the receiving project; no binary wrapper is vendored. `gradle -p kotlin compileKotlinIosSimulatorArm64` additionally needs macOS/Xcode. The selected iOS source sets use SQLite Native; this does not imply native PostgreSQL/MySQL driver support. [SQLDelight multiplatform setup](https://sqldelight.github.io/sqldelight/latest/multiplatform_sqlite/).

Swift uses GRDB 7.11.1 and Swift 6.1+. Run `swift test --package-path swift` to exercise transactions and a real version-one-to-two migration. Keep synchronous SQL off the UI's latency-sensitive path. [GRDB documentation](https://github.com/groue/GRDB.swift).

## Verification

`python3 tests/test_sql_profile.py` executes the authored SQL schema, migration, defaults, constraints and rollback against Python's SQLite. It is a portable prerequisite check, not evidence that Kotlin code generation or Swift compilation passed. Gradle, Kotlin/Native, Swift and Xcode are unavailable in the implementation environment; their gates remain explicitly unexecuted and the pack is experimental. Commit receiving-project Gradle/Swift dependency locks after successful native resolution and review.
