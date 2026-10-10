# Project starter

Original Genlib templates, Apache-2.0, for starting or tightening a Node.js/TypeScript service. Merge selected files into the target repository; they do not replace an existing toolchain.

| Source | Target | Adaptation |
| --- | --- | --- |
| `tsconfig.json` | `tsconfig.json` | Strict NodeNext settings for a server package. Add `"DOM"` to `lib` and a JSX setting for browser code, or keep the framework's generated config |
| `.nvmrc` | `.nvmrc` | Runtime major the project and CI actually use |
| `package.scripts.json` | Merge into `package.json` | Replace each `REPLACE_WITH_REAL_*` command; `ci:verify` and `ci:docs` are what the GitHub and ship starters execute |
| `.env.example` | `.env.example` | List every variable the app reads, with safe placeholders |

Recommended order for a new repository:

1. `git init`, then copy `.gitignore`, `.gitattributes` and `.editorconfig` from the [GitHub starter](../github/README.md).
2. Add these project files and a minimal `src/` entry point; make `npm run ci:verify` pass locally.
3. Install Genlib modules with `genlib plan`/`add` (start with `env-config` and `structured-logger` for services).
4. Add the GitHub starter's CI workflow, issue/PR templates and Dependabot config.
5. Add documentation from the [docs starter](../docs/README.md).
6. Add release, container and CodeQL workflows from the [ship starter](../ship/README.md).

`verbatimModuleSyntax` requires `import type` for type-only imports. Remove it if the project's bundler or test runner does not support it.
