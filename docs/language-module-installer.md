# Installable language examples (opt-in)

The standalone multilingual examples now have a **separate, conservative installer**, without changing Genlib's React/TypeScript module registry. It copies original source files only; it does not install runtimes, dependencies, execute hooks or modify manifests, and it runs code only when you pass `--run-tests`.

```sh
node tools/language-modules.mjs list
node tools/language-modules.mjs inspect swift-identifier-validation
node tools/language-modules.mjs plan swift-identifier-validation --target /existing/project
node tools/language-modules.mjs add swift-identifier-validation --target /existing/project
```

Add `--with-tests` to copy test files where listed. Files are copied into `genlib/<language>/...` by default. `--into <relative dir>` picks another folder inside the target. `--flat` drops the folders the copied files share and, without `--into`, copies straight into the target, so a Python module and its test land side by side and import each other as written. Folders below the shared one are kept, so the passkey test still finds `../fixtures/` after a flat copy. A flat copy is refused if two files would share a name. Existing files are not overwritten, and the target directory must exist.

**Dependency manifests.** A manifest that already exists at the destination is kept, never overwritten: the copy skips it and reports its lines to merge (`# kept existing requirements.txt; add: nh3==0.3.7`; `skipped[].merge` in `--json`). The manifest can be the receiving app's own `requirements.txt`, `go.mod` or `package.json`, or one from an earlier cookbook copy. Any other existing file still stops the copy before anything is written. Install commands are plain shell commands. `# deps:` lists the runtime ones and `# test deps:` the ones only the tests need.

**Dependency and test steps run where the files land** (`lib/language-layout.mjs`, shared with `genlib quick` and `capability inspect`). A manifest-relative command runs in the folder of the copied manifest:

- `npm ci` becomes `cd genlib/oidc-token-verification/typescript && npm ci`;
- `pip install -r requirements.txt` after a flat copy becomes `cd python && pip install -r requirements.txt`.

A package-add command (`npm install docx@9.9.0`, `pip install pypdf==6.20.0`, `go get`) adds to the app's own manifest at the root. When the app's manifest was kept, the merge lines are reported and the install runs at the root. A copied `go.mod` makes the copy its own module, so its tests run as `cd <that folder> && go test ./...`.

`--json` lists the ordered `steps`: copy, then dependencies (with `cwd`), then test (`argv`, `cwd`). Capability copy commands follow the same order. For a module with dependencies, the copy omits `--run-tests`, and the tests run as the last step, once the dependencies are installed.

**Output.** The default output is compact text:

- the copied paths;
- the module's public signatures, the same as `genlib outline`;
- `# test:`, the command that runs the copied tests. It names test modules only; fixtures and fixture generators are copied but not run.
- `# tests cover:`, what those tests check. It is read from the source, so `plan` shows it before anything is copied.
- `# repo evidence (Genlib CI, not this copy):`, how Genlib's own CI verified the module;
- any capability caveat.

With this an agent can call the code without opening it. `--run-tests` (Python and Go) runs the copied tests in the same call and reports `# tests run: passed on this copy (...)`, saving the agent a turn. If they fail, it reports `# tests run: FAILED on this copy` with the failing output, leaves out the repository-evidence line and exits non-zero. Test execution is separate from output, so `--json` returns the same result as `testRun` (`passed`, `failed` or `unsupported`, with the command, working directory, summary and failing tail), together with `tests`, `testCommand`, `skipped` and `evidence`. `genlib quick` includes `--run-tests` in Python and Go copy commands. A measured A/B run showed agents printing the whole copied source when this output was a long JSON list; see [token-budget.md](token-budget.md).

**Limitations:** These are standalone examples, not native UI packages, production OAuth integrations, or guaranteed compatible modules for every project. Check language/runtime versions, package namespaces, and build conventions before copying. This installer is an initial source-copy mechanism, not a transactional package manager or an update system. It intentionally refuses target conflicts and symlinked destination parents. After copying, run the receiving project's own compiler, tests, and security checks.

See `docs/multilanguage-modules.md` and `examples/languages/README.md` for language-specific contracts and limitations.
