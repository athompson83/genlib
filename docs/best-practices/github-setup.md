# GitHub setup, folders, and filtering

This guide covers four common meanings of a filtered GitHub setup: organizing the repository, excluding local/generated files from Git, retrieving/searching only relevant code, and running checks according to changed paths. They solve different problems and should be configured separately. The examples are original Genlib recommendations; linked provider behavior was checked against primary documentation on 2026-10-10.

Start with [the reusable GitHub starter](../../templates/github/README.md). Its files are inactive examples until deliberately merged into another repository. Preserve that repository's instructions, owners, toolchain, and established delivery policy.

## 1. Organize around actual responsibilities

Choose one layout that matches the product. Do not create empty service packages or platform folders before they have a purpose.

| Repository shape | Recommended directories | Boundary to preserve |
| --- | --- | --- |
| One web application | `src/features/`, `src/shared/`, `tests/`, `docs/`, `scripts/` | Feature code owns its behavior; shared code has several concrete consumers |
| Several clients with shared contracts | `apps/web/`, `apps/mobile/`, `apps/desktop/`, `packages/contracts/`, `packages/ui/`, `packages/config/` | Clients use explicit public package interfaces; do not import another app's internals |
| API/service with clients | `services/api/`, client app directories, contract/schema directory, migrations, integration tests | Server validates authorization and owns authoritative writes |
| Reusable source registry such as Genlib | `modules/`, `registry/`, `lib/`, `tests/`, `docs/`, `templates/` | Source, provenance, contract, compatibility, and verification remain discoverable |

Record runtime entry points, dependency direction, authoritative storage, and generation rules in `ARCHITECTURE.md`. Keep tests close enough that a contributor can discover the behavior they validate. Put operational procedures in `docs/runbooks/`. Check in build inputs and migrations; explicitly identify generated outputs that must also be versioned.

Separate organization from access control. A folder, sparse checkout, ignored file, or code owner does not enforce authorization over already accessible repository content.

## 2. Configure Git tracking deliberately

Use [`.gitignore`](../../templates/github/.gitignore) for generated dependencies/build output, caches, local configuration, and local secret files. Keep dependency lockfiles, reviewed fixtures, migration history, application source, and sanitized environment examples tracked. Add stack-specific patterns only after checking what the framework generates; [GitHub's maintained ignore collection](https://github.com/github/gitignore) is a useful reference.

Git ignore rules affect intentionally untracked files. They do not remove a file from an existing commit or make previously committed credentials private. Check an unexpected match with `git check-ignore -v -- path/to/file` and inspect tracking with `git ls-files -- path/to/file`. Resolve already tracked files separately after reviewing the proposed deletion from the repository. If a credential was disclosed, revoke/rotate it; adding an ignore rule does not repair disclosure. See [Git's ignore reference](https://git-scm.com/docs/gitignore) and [GitHub's ignore guidance](https://docs.github.com/en/get-started/git-basics/ignoring-files).

Use [`.gitattributes`](../../templates/github/.gitattributes) for repository-wide line endings and binary classification and [`.editorconfig`](../../templates/github/.editorconfig) for editor formatting. Merge existing conventions and inspect any renormalization diff. Do not install custom clean/smudge filters simply to reduce context size. Use Git LFS only for assets that merit its storage and checkout requirements, after reviewing host availability and cost. [GitHub's repository practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories) discuss large-file handling and repository security features.

## 3. Retrieve and search the relevant subset

For Genlib, search catalog metadata before source. A complete local clone is appropriate for registry generation and integrity checks; sparse checkouts can omit files those commands require. For a large target repository, partial clone reduces initially transferred objects while sparse checkout limits the working tree.

The following is a shell example with replaceable repository and directory names, not an installer command to run against Genlib unchanged:

```sh
git clone --filter=blob:none --sparse https://github.com/OWNER/REPOSITORY.git project
cd project
git sparse-checkout set apps/web packages/contracts packages/ui docs .github
```

Replace the URL and paths with the inspected target. `--filter=blob:none` defers blob downloads until needed; it requires server support and later commands can still fetch omitted objects. Cone-mode sparse checkout includes parent/root files as well as the requested directories. Include relevant workspace manifests, lockfiles, configs, shared packages, and test fixtures before building. Use `git sparse-checkout disable` to restore the full working tree when needed. References: [git clone](https://git-scm.com/docs/git-clone), [git sparse-checkout](https://git-scm.com/docs/git-sparse-checkout).

For local search, prefer narrow paths and file types:

```sh
rg --files src/features docs
rg -n 'createCheckout|verifyWebhook' src tests -g '*.{ts,tsx}'
git diff --stat
git diff --name-only
```

GitHub code search supports repository, path, language, and Boolean filters. These example queries target this public repository; adapt them to the project:

```text
repo:athompson83/genlib path:modules "idempotency"
repo:athompson83/genlib path:docs "compatibility"
repo:athompson83/genlib language:JavaScript NOT path:registry "verify"
```

Search terms are discovery filters, not permission boundaries or proof of code quality. Consult [GitHub Code Search syntax](https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax).

## 4. Filter CI work without losing required checks

Do not put a `paths` or `paths-ignore` trigger on a workflow whose check must always complete before merging. GitHub documents that a workflow skipped by path/branch filtering can leave its required check pending. Use an always-triggered verification job and decide inside it which expensive checks to run. The [starter workflow](../../templates/github/.github/workflows/ci.yml) implements this with a [dependency-free classifier](../../templates/github/.github/scripts/classify-changes.mjs). See [required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

The starter always performs real documentation validation, then performs full application verification unless the diff contains only explicitly permitted documentation paths. Manifests, lockfiles, licenses, runtime source, workflow changes, unknown paths, Markdown containing executable components (`.mdx`), and unavailable comparisons all select full checks. Pull requests use the merge base of the event's base/head SHAs. Merge queues and manual runs select full checks. An empty or failed comparison is never evidence that tests can be skipped.

The workflow requires actual target `ci:docs` and `ci:verify` package scripts; it fails if they are absent. It includes no fake passing test command. Validate both lanes in the target and require the single observed `Verify` check afterward. Avoid commit skip directives on required workflows. If docs participate in code generation, release artifacts, or runtime content, change the allowlist to run the relevant full verification too.

For a larger monorepo, extend classification only after mapping shared dependencies: a contract or root lockfile change may affect every client; a backend schema change may require client contract tests. Keep an unconditional final required check that fails when any selected check fails, is cancelled, or unexpectedly skips. Do not treat “no selected jobs” as sufficient verification. This starter uses one job to keep that dependency logic simple.

## 5. Give changes reviewable ownership

Use [the CODEOWNERS starter](../../templates/github/.github/CODEOWNERS) after replacing the owner placeholder with an eligible user or visible team that has write access. Protect `.github/` and the ownership file itself, and place broader patterns before specific exceptions. CODEOWNERS requests reviews; required code-owner approval is a separate repository rule. Verify pattern errors in GitHub. These are documented behaviors in [About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

Adopt [the PR template](../../templates/github/.github/pull_request_template.md) and [issue forms](../../templates/github/.github/ISSUE_TEMPLATE/bug_report.yml) to collect problem, resulting behavior, evidence, and rollout information. Do not assign nonexistent labels, owners, or security contacts. GitHub defines form fields in its [issue-form syntax reference](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms).

Use the target's agreed delivery policy. Do not automatically replace direct-to-main authorization with a new PR approval requirement. When setting up protected production branches, choose rules from concrete requirements: observed checks, real reviewers, force-push restrictions, and deployment environments. Review any bypass roles against the team's actual incident/release process.

## 6. Maintain dependencies and credentials

The [Dependabot starter](../../templates/github/.github/dependabot.yml) monitors npm and GitHub Actions weekly. Adapt the ecosystem and directory list to actual manifests. Version-update scheduling does not itself enable alerts or security updates, and configuration must be on the default branch to take effect. Avoid blanket dependency ignores and automatic merging without behavioral verification. Reference: [About dependabot.yml](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file).

For Actions, grant the minimum token permissions, use immutable full action commit SHAs, disable persisted checkout credentials when no Git write is needed, and keep untrusted event text out of shell program text. Never execute untrusted PR code in a privileged `pull_request_target` job. Prefer short-lived OIDC credentials for supported deployment providers, scoped to the actual repository/environment; this guide does not create those grants. Reference: [GitHub's secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).

Enable applicable dependency, secret, and code scanning in the repository's actual plan/settings, then verify the expected jobs and reporting channels. Publish a completed `SECURITY.md` and test private vulnerability reporting where supported. A template's presence is not evidence that either scanning or private reporting is enabled. Reference: [GitHub repository best practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).

## Adoption evidence

Record the target commit, runtime/tool versions, active owner resolution, configured check name, successful and intentionally failing CI scenarios, dependency-update discovery, and private-report destination. Track gaps as gaps. Repository templates improve repeatability; they do not prove that an application is secure, deployable, or operationally supported.
