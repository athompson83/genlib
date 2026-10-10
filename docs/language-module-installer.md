# Installable language examples (opt-in)

The standalone multilingual examples now have a **separate, conservative installer**, without changing Genlib's React/TypeScript module registry. It copies original source files only; it does not install runtimes, dependencies, execute hooks, modify manifests, or run code.

```sh
node tools/language-modules.mjs list
node tools/language-modules.mjs inspect swift-identifier-validation
node tools/language-modules.mjs plan swift-identifier-validation --target /existing/project
node tools/language-modules.mjs add swift-identifier-validation --target /existing/project
```

Add `--with-tests` to copy test files where listed. Files are copied into `genlib/<language>/...` by default; `--into <relative dir>` picks another folder inside the target and `--flat` drops the source folders (so a Python module and its test land side by side and import each other as written; refused if two files would share a name). Existing files are not overwritten and the target directory must exist.

The default output is compact text: the copied paths, the module's public signatures (the same as `genlib outline`) and the command that runs the copied tests, so an agent can call the code without opening it. Add `--json` for the full plan with SHA-256 hashes. A measured A/B run showed agents printing the whole copied source when this output was a long JSON list; see [token-budget.md](token-budget.md).

**Limitations:** These are standalone examples, not native UI packages, production OAuth integrations, or guaranteed compatible modules for every project. Check language/runtime versions, package namespaces, and build conventions before copying. This installer is an initial source-copy mechanism, not a transactional package manager or an update system. It intentionally refuses target conflicts and symlinked destination parents. After copying, run the receiving project's own compiler, tests, and security checks.

See `docs/multilanguage-modules.md` and `examples/languages/README.md` for language-specific contracts and limitations.
