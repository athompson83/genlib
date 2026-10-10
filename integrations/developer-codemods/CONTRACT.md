# Developer codemods and template evolution

Original glue is Apache-2.0. Third-party tools remain external; no upstream implementation is vendored. LibCST includes additional bundled license notices: retain its installed package notices. OpenRewrite is restricted to the named Apache core recipe scope in `openrewrite/allowed-artifacts.json`; external MSAL/proprietary recipe bundles are excluded. The recipe allowlist is not a complete transitive dependency license inventory. Review the actual resolved tool/parser dependencies before distribution.

## Inputs and behavior

- `rewriteImports(source, from, to)` changes exact static TypeScript import and re-export specifiers. It returns source/count and never writes. Dynamic imports, CommonJS and plain strings are outside scope. Review the diff and compile the receiving application.
- Python `migrate` changes absolute `from MODULE import ...` paths. It deliberately leaves relative and plain imports alone to avoid changing implicit binding names.
- ast-grep recipe changes console calls to `logger.info`; the application must supply a compatible logger. It does not install or configure logging.
- dependency-cruiser rejects import cycles, client-to-server edges, and imports of internal feature files. Adapt paths to the application's architecture. Its strict entrypoint rule expects sibling internal modules to use their own permitted layout.
- Copier renders only the bundled no-task template. The test upgrades a temporary Git fixture while preserving an application extension. A real conflicting upgrade requires human/agent review; preservation is not guaranteed for arbitrary edits. Never run `--trust` for a discovered template, enable arbitrary tasks, or bypass Genlib's safe installer. `overwrite=True` is used only inside the disposable three-way-merge fixture, never by the pack installer.
- Rector and OpenRewrite operate only when explicitly invoked. First run their dry-run commands in a clean receiving checkout; keep application tests as the correctness gate.

## Verification

From this pack, provision development tools explicitly: `npm ci --ignore-scripts`; Python virtual environment with `pip install -r python/requirements.lock.txt`; PHP/Composer and Java/Maven profiles are separate.

- `npm test` checks static imports, strings, comments, idempotence, AST calls and architecture violations.
- `python -m unittest discover -s python -p 'test_*.py'` checks Python transforms and a real local Copier update.
- In `php/`: `composer install`, `composer test`, `composer preview` (preview exits nonzero when changes are expected).
- `python3 openrewrite/verify.py` requires Java 17+ and Maven. It copies the original fixture into a temporary directory, compiles and checks behavior, runs the actual package-migration recipe, asserts the new source path, compiles/checks behavior again, and verifies a second application makes no source change. Missing tools or failed assertions fail the gate. This Java/Maven profile has not been executed here. In a receiving checkout first use `mvn rewrite:dryRun` and review its patch before an explicitly selected `mvn rewrite:run`.

The profile pins OpenRewrite core 8.90.4, rewrite-maven-plugin 6.46.1 and maven-compiler-plugin 3.14.1. Their exact Maven Central POMs were reachable during authoring; that is resolution evidence, not execution evidence. `org.openrewrite.java.ChangePackage` is the only selected recipe. No external recipe jar is added.

Dependency versions are pinned for reproducibility; keep package locks. There are no installation hooks and discovery never executes these commands.
