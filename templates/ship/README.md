# Ship starter

Original Genlib templates, Apache-2.0. These files take a verified application from a passing CI run to a published, traceable release. They are **examples to merge into a target repository**, not active settings for Genlib. They create no accounts, secrets, environments, registries or deployments.

Adopt the [GitHub starter](../github/README.md) CI workflow first: the release workflow reuses its real `ci:verify` script and fails when that script is missing.

## Choose the files you need

| Source in this directory | Target location | Required adaptation |
| --- | --- | --- |
| `Dockerfile` | `Dockerfile` | Node version, real `build` script, output directory, start command, port and health path. Pin the base image by digest after verifying it |
| `.dockerignore` | `.dockerignore` | Merge with existing ignores; never include `.env` files or credentials in the build context |
| `CHANGELOG.md` | `CHANGELOG.md` | Replace the example with the first real release entry |
| `.github/workflows/release.yml` | Same relative path | Tag pattern and runtime. Requires `package.json` version to equal the tag without `v` |
| `.github/workflows/codeql.yml` | Same relative path | Default branch name and the target's CodeQL languages |
| `.github/workflows/container.yml` | Same relative path | Registry and tag scheme. Requires the Dockerfile and GitHub Packages permission |

Templates for other platforms (Python, Go, mobile stores, serverless) are not included. Replace the Node-specific steps with the target's real toolchain instead of claiming these files validate it unchanged.

## Release flow

1. Merge verified work to the default branch. CI must pass on that commit.
2. Update `CHANGELOG.md` and bump the version with `npm version <patch|minor|major>`. This creates the matching commit and `vX.Y.Z` tag.
3. Push the commit and tag (`git push --follow-tags`). `release.yml` re-runs `ci:verify` on the tagged revision and publishes a GitHub release with generated notes. Tags containing `-` (for example `v2.0.0-rc.1`) publish as prereleases.
4. `container.yml` builds the image on every pull request without pushing, and pushes `ghcr.io/<owner>/<repo>` with semver and SHA tags plus SBOM and provenance for version tags.
5. Deploy the immutable artifact using the [deployment runbook](../docs/docs/runbooks/deployment.md). Publishing a release or image is not a deployment and does not prove the running revision.

## Security properties

Every workflow defaults to `contents: read` and grants write scopes only to the job that needs them. Third-party actions are pinned to full commit SHAs resolved from their upstream version tags on 2026-10-10; verify upstream releases when adopting or updating them. Checkout credentials are not persisted. The Dockerfile installs with `--ignore-scripts`, runs as the unprivileged `node` user and uses Node's built-in `fetch` for its health check instead of adding curl.

Pair the runtime with Genlib's `health-checks`, `security-headers`, `env-config` and `structured-logger` modules when the application lacks equivalents: they provide the `/healthz` endpoint the image checks, response hardening, fail-fast configuration and redacted JSON logs.

## Validate before relying on it

- Build the image locally (`docker build .`) and run it with production-like configuration. Confirm the health check turns healthy and the container runs as a non-root user.
- Push a prerelease tag in a test repository or fork and confirm the release job fails when `ci:verify` fails or the tag and version differ.
- Confirm CodeQL results appear under the repository's code scanning alerts before making it a required check.
