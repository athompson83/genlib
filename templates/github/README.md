# GitHub repository starter

Original Genlib templates, Apache-2.0. These files are **examples to merge into a target repository**, not active settings for Genlib. They do not create repository rules, accounts, secrets, environments, or deployments.

## Choose the files you need

| Source in this directory | Target location | Required adaptation |
| --- | --- | --- |
| `.gitignore` | `.gitignore` | Match the application's generated files and secret formats; retain lockfiles and source |
| `.gitattributes` | `.gitattributes` | Merge existing attributes; inspect line-ending changes before renormalization |
| `.editorconfig` | `.editorconfig` | Preserve the target's accepted formatting rules |
| `.github/CODEOWNERS` | `.github/CODEOWNERS` | Replace every active `@REPLACE_WITH_OWNER` with a real, eligible owner |
| `.github/pull_request_template.md` | Same relative path | Match the review and deployment process |
| `.github/ISSUE_TEMPLATE/` | Same relative directory | Keep useful forms; configure real support/reporting destinations separately |
| `.github/dependabot.yml` | Same relative path | Select actual ecosystems and manifest directories |
| `.github/workflows/ci.yml` | Same relative path, or an unused workflow filename | Supply actual verification scripts, runtime, lockfile, runner, and timeout |
| `.github/scripts/classify-changes.mjs` | Same relative path | Keep with the workflow; review the docs-only allowlist for the target |

Read [GitHub setup](../../docs/best-practices/github-setup.md) and [README and documentation practices](../../docs/best-practices/readme-and-docs.md). A complete [documentation starter](../docs/README.md) is provided alongside this directory.

Copy selected files using the project's normal editing process. Review the diff against existing files; do not replace another application's workflow, policies, owners, or contribution rules wholesale. These starters are not catalog modules and are not installed by `genlib add`.

## Adopt the Node/npm CI starter

The supplied workflow is specifically for a Node.js application with `package.json`, `package-lock.json`, and an npm-based verification process. Native mobile, Rust, Python, .NET, and other targets must replace the setup/install/run steps with their actual toolchain. Do not claim this workflow validates those targets unchanged.

Before enabling it:

1. Copy both the workflow and classifier script. Keep the checkout action's default tested revision; pull requests normally test GitHub's merge revision.
2. Set a supported runtime compatible with the target. Node 22 and the full action commit pins are inherited from Genlib's existing CI, not a claim that those releases are newest. Verify upstream releases when adopting or updating the pins.
3. Add **real** `ci:docs` and `ci:verify` scripts to the target's existing package scripts. `ci:docs` must execute its actual Markdown/link validation and documentation build if present. `ci:verify` must execute its actual type/build checks and behavioral test suite. Use the target's existing scripts where they already perform these checks. Missing scripts intentionally fail the workflow; do not replace them with `echo`, `true`, `--if-present`, or an unconditional success.
4. Review dependency lifecycle requirements. The starter's `npm ci --ignore-scripts` avoids installation hooks; projects needing generated/native dependencies must add their reviewed setup step explicitly. The later `npm run` commands intentionally execute the verification scripts.
5. Run an actual documentation-only PR and a source-changing PR. Demonstrate that a broken doc and failing application test each make `Verify` fail in the corresponding lane. Confirm the check attaches to the PR's tested revision.
6. After successful target validation, configure the repository's required check using the exact `Verify` check shown in GitHub. The workflow name is `Application CI`. Keep job names unique across workflows and include `merge_group` if using a merge queue. Do not activate rules by guessing check names.

The workflow uses read-only contents permissions, full checkout history, no persisted checkout credentials, a bounded runtime, and immutable action pins. It creates one `Verify` job for every configured event. There are no workflow-level path/branch filters. A commit-message skip directive can still prevent a run; do not use such directives when this check is required. See [GitHub's required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## How change classification works

| Event/change | Verification |
| --- | --- |
| PR with only named root Markdown documents or `docs/**/*.md` | Documentation checks; application suite omitted |
| PR or push touching application code, lockfiles, manifests, workflows, licenses, MDX, docs configuration, or an unknown path | Documentation and application checks |
| PR with a source file renamed into docs | Full checks: rename detection is disabled so both paths are considered |
| New branch, missing/invalid event SHAs, missing history, diff failure, empty diff | Full checks |
| Merge queue, manual dispatch, any unrecognized event | Full checks |

Pull requests compare their head against the merge base of the event's base/head commit SHAs. Push events compare the event's before/after SHAs. Filenames are NUL-separated and passed through no shell; they are never added to Actions outputs. The script performs no fetch, package installation, network call, credential access, or repository mutation.

The docs-only shortcut is appropriate only if those Markdown files cannot change runtime behavior, code generation, schema contracts, release packaging, or required compliance outputs. Narrow the allowlist or always run full checks when that assumption does not hold. The classifier cannot infer a target's dependency graph. It reduces redundant application test runs, not the need for a real documentation gate.

The classifier is covered by Genlib's `tests/github-templates.test.mjs`, including a real local Git branch/divergence fixture. Those tests validate the starter's logic; they do not establish that the receiving application's commands or GitHub rules are correct.

## Verify configuration and ownership

Replace active owner placeholders, then use GitHub's CODEOWNERS error view to confirm the file parses and owners are eligible. The Issue forms contain no invented labels or assignees. Dependabot monitors npm and GitHub Actions by default and does not authorize automatic merging. Security alerts, private reporting, branch rules, and deployment access remain separately configured repository capabilities.
