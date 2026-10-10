# Maintainer catalog health

`tools/catalog-health.mjs` inventories exact npm versions from lockfiles and optionally enriches a deliberately bounded selection with [deps.dev](https://docs.deps.dev/api/v3/), [OSV](https://google.github.io/osv.dev/api/) and [endoflife.date](https://endoflife.date/docs/api/v1/). It preserves the owning manifest and lockfile for every package occurrence. This is maintenance evidence for a reviewed revision; it does not install, execute, upgrade or approve an upstream package.

## Start offline

Run from a trusted Genlib checkout:

```sh
node tools/catalog-health.mjs --limit 10 --json
node tools/catalog-health.mjs --limit 10 --offset 10 --json
node tools/catalog-health.mjs --root /absolute/path/to/project --limit 20 --json
```

The CLI defaults to its own Genlib checkout. `--root` selects another repository to inventory; it never selects that repository as the source of executable audit code. No build, package installation, provider credentials or network access is required for offline mode. An offline run reads an existing cache if present and creates no files.

The inventory reads `package.json` and `package-lock.json` at the root and in immediate directories under `packages/` and `integrations/`. It understands npm lockfile versions 2 and 3 and reads the lockfile's `packages` entries, including nested dependency occurrences. It does not traverse `node_modules`, run package scripts, resolve semver ranges, read a package manager's credentials or invent versions from dependency ranges.

Repeated `name@version` pairs share one query while retaining all of their `owners`: manifest path, lockfile path, package path and development/optional flags. A second resolved version remains a separate pin. npm aliases retain the actual package name when the lockfile supplies `name`.

Only exact versions whose lockfile source is HTTPS on `registry.npmjs.org` or `registry.yarnpkg.com` are eligible for public metadata queries. Local links, Git sources, private registries, missing source origins, unsupported lockfile formats and absent lockfiles remain visible as `unqueryable` entries or `inventoryIssues`. The tool does not infer that a private fork has the properties of a similarly named public release. Cargo, Maven, Swift, Dart, NuGet, Go and Python lockfiles are outside this npm inventory; their integration profiles retain their own verification gates.

## Request a bounded network audit

Build Genlib's original public-data clients with the repository's development toolchain first. This is an explicit maintainer step; the audit tool never runs it automatically.

```sh
npm run build
node tools/catalog-health.mjs --network --limit 5 --json
node tools/catalog-health.mjs --network --limit 5 --offset 5 --json
node tools/catalog-health.mjs --network --limit 5 --cache /absolute/path/to/review-cache.json --json
```

Network mode sends only each selected public npm package name and exact version to deps.dev and OSV. Ownership paths and lockfile contents are not sent. OSV's query is a read-only HTTP POST. The implementation reuses the compiled [public-data-clients module](../modules/public-data-clients/CONTRACT.md), including fixed HTTPS origins, response parsing, cancellation, byte limits and normalized errors. It never downloads a tarball or invokes an upstream executable.

| Bound | Behavior |
| --- | --- |
| Selected package pins | Default 10; `--limit` accepts 1–100 |
| Pagination through the local inventory | `--offset` and `summary.nextOffset`; deterministic order by exact package key |
| Provider operations | At most two active operations; at most two operations per selected pin before cache hits |
| Remote retries | Disabled; provider errors are reported and briefly cached |
| Per-operation deadline | Five seconds by default in the library, covering the response body |
| Provider response | At most 512 KiB decoded bytes |
| OSV advisory/page handling | One page per exact query; up to 1,000 stored advisory summaries; another page or truncation remains incomplete |
| Local lockfile | At most 8 MiB and 50,000 package entries per lockfile |
| Cache | At most 4 MiB and 2,000 provider entries; oldest query entries are removed first |
| Optional product lifecycle | At most three explicit products; at most 100 releases retained for each product, with truncation stated |

`--refresh` requests new provider queries even when cached entries remain fresh. It requires `--network`. Cancellation with Ctrl+C propagates to the clients and reports explicit aborted provider results; it does not turn an interrupted audit into an empty advisory response.

## Read results correctly

Each selected record contains the exact package identity, owning manifests, `depsDev`, `osv`, `advisoryState` and `coverageComplete`. Query records include the primary API documentation URL, `queriedAt`, `expiresAt` and whether the result came from cache.

| State | Meaning |
| --- | --- |
| `unknown` | No query evidence is available, cached evidence has expired, or the clock makes its freshness uncertain |
| `error` | A provider request failed, timed out, was cancelled, exceeded a response limit, returned a missing resource, or did not match the expected schema/identity |
| `incomplete` | A successful OSV response reports more pages or exceeds the bounded summary size |
| `advisories-found` | At least one provider returned an advisory ID; inspect provider-specific coverage and the advisory itself |
| `no-known-advisories` | Both selected provider queries completed within the implemented scope and returned no relevant advisory IDs at that query time |

`advisories-found` can coexist with `coverageComplete: false`. For example, deps.dev may return an advisory while OSV fails or has another page. `coverageComplete` refers only to these two exact-version query surfaces; it does not mean that every vulnerability database, dependency source or deployment condition has been assessed. Unknown or failed checks remain visible even when the other provider reports no advisory.

OSV results retain advisory IDs, modification dates and withdrawal dates. Withdrawn OSV entries remain in the evidence but do not become active advisory IDs. deps.dev returns direct advisory identifiers for a version; the audit inventories resolved dependencies independently and does not silently expand a remote dependency graph. It keeps publication time and deprecation metadata when supplied. Missing licenses remain `licenseKnown: false`; multiple upstream license strings are not rewritten into an invented SPDX `AND` or `OR` expression.

An empty result does not establish that a dependency is safe, supported or licensed for a particular use. Consult the actual advisory and license text before changing dependencies or releasing an application. [OSV's API documentation](https://google.github.io/osv.dev/api/) and [deps.dev's version endpoint documentation](https://docs.deps.dev/api/v3/) define the upstream query scope.

The process exits successfully when it produces a report, including reports with findings or unknown/failed provider checks. Invalid CLI options, unreadable roots and invalid/unsafe cache files produce an error and exit 1. A release gate must inspect the report's provider states, coverage and inventory issues; process exit 0 by itself is not a security gate.

## Cache and file ownership

The default cache is `.genlib/catalog-health-cache.json` beneath the selected root. `--cache FILE` selects another file. Successful query evidence lasts at most 24 hours; `Cache-Control: max-age` and `Age` can shorten that interval. `no-store` or `no-cache` responses are not persisted as reusable results. Errors expire after at most two minutes. A cached error remains an error until expiration; an expired error becomes unknown and preserves the previous query status and time.

Network mode replaces only its own valid cache format, using an exclusive temporary file and atomic rename. Cache files are written with owner-only permissions where the platform supports them. Symlinks, non-regular cache files and symlink parents are rejected. An existing unrelated or malformed JSON file is preserved and reported as `INVALID_CACHE`; select a new cache path or review and remove the old file explicitly.

The tool never changes manifests, lockfiles, catalog records, resource lifecycle/readiness fields or integration manifests. A cache entry is evidence to review, not a new ownership rule. The cooperating filesystem checks do not sandbox a hostile process with the same filesystem permissions. Concurrent audits should use separate cache paths; an atomic replacement prevents torn JSON but does not merge simultaneous writers.

## Optional product lifecycle evidence

```sh
node tools/catalog-health.mjs --network --limit 5 --product nodejs --product python --json
node tools/catalog-health.mjs --limit 5 --product nodejs --json
```

The first command explicitly queries endoflife.date's v1 product API. The second reads any corresponding cached evidence offline. Products are never inferred from a dependency name. The result preserves upstream generation/modified times, the linked official release policy, and independent `isEol` and `isMaintained` states. Extended maintenance can make these fields differ. API-supplied commands are neither retained nor executed.

endoflife.date is a secondary, community-maintained source, and its v1 API is currently described as beta. Confirm consequential support dates with the linked product policy. Hosted-service retirement, such as Firebase Dynamic Links shutdown, requires the service provider's own announcement; a package release calendar is insufficient. See [endoflife.date source and API guidance](https://github.com/endoflife-date/endoflife.date).

## Tests and maintenance evidence

```sh
npm run build
node --test tests/public-data-clients.test.mjs tests/catalog-health.test.mjs
```

The module's 20 tests and the maintainer tool's 10 tests passed locally on Node 24.19.0 with the repository's TypeScript 7.0.2 compiler. The maintainer tests replace only outbound Fetch while exercising the production provider clients. They cover exact versions and aliases, multiple manifest owners, private/local source exclusions, offline operation without a build, bounded queries, caching and expiry, errors and pagination, response identity mismatches, lifecycle evidence, cancellation and unsafe/invalid data files. Package scripts in test fixtures are deliberately inert and never invoked.

These are deterministic transport fixtures. They do not certify live provider availability, advisory completeness or the receiving application's deployment. Network catalog verification is separately available through `scripts/verify-resources.mjs`; repository/link and registry-license checks also remain distinct from executable integration tests.
