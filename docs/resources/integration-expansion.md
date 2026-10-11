# Integration expansion

This guide maps the October 2026 review into 51 explicit resource records: the 48 external recommendations, an Apache-scoped OpenRewrite profile, the original direct Genlib MCP package and a Typst compiler record promoted from the separate CLI index. Forty-three records live in the expansion catalog; uPlot, React Big Calendar, ical-generator, pg-boss, MiniSearch, tus-js-client, tusd and Uppy core reuse canonical records added during implementation. Existing catalog resources are reused by their canonical IDs instead of copied into another catalog.

The records identify exact upstream packages or APIs, their shortest adoption commands, source/service license boundaries and the matching Genlib contract. A source-reviewed record is useful discovery evidence. Executable behavior and runtime acceptance are recorded separately in module tests and integration-profile manifests.

## Find the appropriate implementation

```sh
node tools/resources.mjs search "resumable upload" --json --limit 5
node tools/resources.mjs inspect uppy-core --json
node tools/resources.mjs inspect census --json
```

Read [the public-data-clients contract](../../modules/public-data-clients/CONTRACT.md) for the original server adapters, [the maintainer health guide](../catalog-health.md) for optional cached dependency/advisory enrichment, and [the direct MCP guide](../mcp-server.md) for MCP configuration. Read an integration pack's `CONTRACT.md` and its exact profile before adopting third-party packages. Profiles can have different platform prerequisites and verification status.

## Web applications, documents and jobs

| Resource IDs | Reusable behavior | Primary source and material boundary |
| --- | --- | --- |
| `uppy-core`, `tus-js-client`, `tusd` | Upload selection, resumable transfers, server-side tus protocol handling | [Uppy](https://uppy.io/docs/), [tus-js-client](https://github.com/tus/tus-js-client), [tusd](https://github.com/tus/tusd): MIT projects; receiving app owns authorization, storage, quotas and abandoned-upload cleanup |
| `json-forms` | JSON Schema/UI schema forms with a selected renderer | [JSON Forms](https://jsonforms.io/docs/): MIT; pin a supported framework/renderer pair and retain server validation |
| `pdfme` | Template-driven PDF generation and optional designer | [pdfme](https://pdfme.com/docs/getting-started): MIT source; template assets and fonts retain their terms |
| `zip-js` | ZIP creation/reading with explicit file handling | [zip.js](https://gildas-lormeau.github.io/zip.js/): BSD-3-Clause; enforce expanded-byte, entry-count and path limits in the receiving app |
| `pg-boss` | Durable PostgreSQL jobs and retriable work | [pg-boss](https://github.com/timgit/pg-boss): MIT; external effects still need application-level idempotency and operational ownership |
| `tabulator`, `glide-data-grid` | Vanilla-JavaScript or canvas-backed data grids | [Tabulator](https://github.com/olifolkerd/tabulator), [Glide Data Grid](https://github.com/glideapps/glide-data-grid): MIT; profile choice depends on accessibility, edit/selection behavior and framework |
| `react-big-calendar`, `ical-generator` | Calendar presentation and server-side iCalendar generation | [React Big Calendar](https://github.com/bigcalendar/react-big-calendar), [ical-generator](https://github.com/sebbo2002/ical-generator): MIT; date/timezone, recurrence, persistence and permissions remain explicit |
| `react-arborist` | Virtualized interactive trees | [React Arborist](https://github.com/brimdata/react-arborist): MIT; receiving app owns keyboard behavior validation and persisted order |
| `libphonenumber-js`, `imask` | Phone parsing and formatted input | [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js), [IMask](https://github.com/uNmAnNeR/imaskjs): MIT; formatting and metadata checks are not proof that a phone number is owned or reachable |
| `uplot`, `minisearch` | Time-series rendering and local full-text indexing | [uPlot](https://github.com/leeoniya/uPlot), [MiniSearch](https://github.com/lucaong/minisearch): MIT; choose scale, search fields, update lifecycle and accessible alternatives deliberately |
| `typst` | Repeatable local typesetting and report compilation | [Typst compiler/CLI](https://github.com/typst/typst): Apache-2.0 with NOTICE; the hosted editor, imported fonts and templates have separate terms |

Existing resources promoted into these integration packs include `puckeditor-core`, `radix-primitives`, `react-aria`, `tanstack-table`, `gotenberg`, `react-email`, `exceljs`, `papaparse` and `medusa`. Their source records remain in their original catalogs. The existing Standard Webhooks module is reused by durable-job/webhook compositions.

## Development, API contracts and native applications

| Resource IDs | Intended profile | Primary source and limit |
| --- | --- | --- |
| `oasdiff`, `hurl`, `schemathesis` | Breaking-change checks, declarative HTTP assertions and schema-guided API tests | [oasdiff](https://github.com/oasdiff/oasdiff), [Hurl](https://hurl.dev/) are Apache-2.0; [Schemathesis](https://github.com/schemathesis/schemathesis) is MIT. Use isolated fixtures or an explicitly approved test target |
| `hey-api`, `typespec`, `microcks` | Opt-in generated clients, contract authoring and service mocks | [Hey API](https://github.com/hey-api/hey-api), [TypeSpec](https://github.com/microsoft/typespec) are MIT; [Microcks](https://microcks.io/documentation/) is Apache-2.0. Pin generators and validate generated diffs; the old Hey API repository redirects to the monorepo |
| `copier`, `ts-morph`, `libcst`, `rector`, `dependency-cruiser` | Repeatable templates, semantic source transforms and dependency-boundary checks | [Copier](https://github.com/copier-org/copier), [ts-morph](https://github.com/dsherret/ts-morph), [LibCST](https://github.com/Instagram/LibCST), [Rector](https://github.com/rectorphp/rector), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser): MIT core licenses; LibCST's bundled PSF/Apache notices also apply. Templates/recipes can run code, so adoption is explicit |
| `maestro`, `patrol` | Native/device UI and Flutter test flows | [Maestro](https://docs.maestro.dev/), [Patrol](https://patrol.leancode.co/): Apache-2.0 projects. Maestro Studio is free but is not open source; hosted products and supported physical/simulator targets are separate |
| `sqldelight`, `grdb-swift`, `swift-snapshot-testing` | Typed Kotlin SQL, Swift persistence and UI snapshots | [SQLDelight](https://sqldelight.github.io/sqldelight/) is Apache-2.0; [GRDB](https://github.com/groue/GRDB.swift) and [SnapshotTesting](https://github.com/pointfreeco/swift-snapshot-testing) are MIT. Actual SDK/device/OS builds require their platform toolchains |
| `uniffi`, `velopack` | Shared Rust bindings and desktop distribution | [UniFFI](https://github.com/mozilla/uniffi-rs) uses MPL-2.0; [Velopack](https://docs.velopack.io/) uses MIT. Review MPL obligations and each target's signing, update, installation and rollback behavior |
| `cedar`, `loro` | Local authorization policy and collaborative state | [Cedar](https://docs.cedarpolicy.com/) is Apache-2.0; [Loro](https://loro.dev/docs/) is MIT. The application still owns identity, synchronization transport, persistence, policy inputs and enforcement |
| `openrewrite` | Allowlisted Java package migration | [Exact Maven artifact declarations](https://repo.maven.apache.org/maven2/org/openrewrite/rewrite-core/8.90.4/rewrite-core-8.90.4.pom) and [the upstream module-license table](https://docs.moderne.io/user-documentation/recipes/lists/latest-versions-of-every-openrewrite-module/): restrict direct core artifacts to `rewrite-core`, `rewrite-java`, `rewrite-maven`, `rewrite-xml`; additional recipes need independent review |

The exact OpenRewrite core/java/maven/xml 8.90.4 POMs and Maven plugin 6.46.1 POM resolved and declared Apache-2.0 during implementation. The documentation-table candidate 8.93.0 did not resolve as a core artifact, so it was not retained as an install pin. Artifact resolution and license declarations do not establish that the Java profile has been executed. The [Maven plugin POM](https://repo.maven.apache.org/maven2/org/openrewrite/maven/rewrite-maven-plugin/6.46.1/rewrite-maven-plugin-6.46.1.pom) and transitive dependencies retain their own scope; an allowlist of recipe artifacts is not a claim that every dependency in the ecosystem has the same license.

Existing sources reused for related profiles include `openapi-typescript`/openapi-fetch, `orval`, `connect-rpc`, `sqlc`, `openfga`, `ast-grep`, Testcontainers and OpenTelemetry language packages. Their existence in the catalog does not certify every language or deployment mode.

## Public data APIs and maintenance APIs

All twelve rows have original typed adapters in `modules/public-data-clients`. These adapters are Apache-2.0 Genlib code; provider software, hosted access and returned data retain the terms below. Every adapter has an injectable transport, caller cancellation, normalized errors, bounded responses and response metadata. No provider SDK is a core runtime dependency.

| Resource ID | Implemented surface | Source/service/data boundary |
| --- | --- | --- |
| `frankfurter` | V2 single rates, selected currencies and historical ranges | [Frankfurter](https://frankfurter.dev/): MIT server source, public reference-rate service; preserve returned dates/provider attribution and implement decimal money rules in the application |
| `national-weather-service` | Point-to-grid discovery, forecasts and active alerts | [NWS API](https://www.weather.gov/documentation/services-web-api): U.S. government API, required application User-Agent; cache grid mapping, retain units and alert validity. No invented open-source license for the hosted API |
| `census` | A fixed vintage/dataset with allowlisted variables and geography | [Census key guidance](https://www.census.gov/data/developers/guidance/api-user-guide.API_Key.html): server key callback, dataset limits and attribution; preserve FIPS codes, suppression markers and missing data as strings/null |
| `vpic` | Full/explicitly partial VIN decoding and bounded read-only batch POST | [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/): government service/data terms, response error codes preserved; a decode is not a title, ownership or vehicle-history check |
| `crossref` | DOI metadata and bounded cursor search | [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/): API access and bibliographic metadata do not grant blanket reuse rights in deposited abstracts or full text; abstracts are excluded by default |
| `gleif` | LEI records and ambiguous paged entity search | [GLEIF API](https://www.gleif.org/en/lei-data/gleif-api): CC0 LEI data with API terms; legal and registration status stay separate; relationship links are returned as inert data |
| `ror` | V2 organizations, search and affiliation matching | [ROR API](https://ror.readme.io/docs/rest-api): MIT API source and CC0 ROR dataset are separate scopes; derived GeoNames fields retain applicable attribution. Preserve alternate names, successors and the result cap |
| `open-food-facts` | V3 product lookup and structured V2 taxonomy search | [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/): AGPL server source, ODbL database, database-content and image terms differ. Require a recognizable User-Agent and obey endpoint-specific quotas |
| `open-meteo` | Explicit noncommercial/customer/self-hosted forecast profiles | [Open-Meteo docs](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms): AGPL server source and CC-BY data do not make the free hosted endpoint unrestricted for commercial use. A customer key stays on the server |
| `deps-dev` | Exact package/version metadata and dependency graph | [deps.dev v3](https://docs.deps.dev/api/v3/): Apache API tooling is distinct from generated CC-BY-4.0 data, upstream aggregation rights and Google API terms; missing licenses remain unknown |
| `osv-api` | Exact version/commit queries, batch queries and advisory lookup | [OSV API](https://google.github.io/osv.dev/api/): Apache tooling does not replace originating advisory-database terms. Preserve advisory provenance; no findings is not proof of safety |
| `endoflife-date` | V1 products and explicit release selection | [API documentation](https://endoflife.date/docs/api/v1/) and [source](https://github.com/endoflife-date/endoflife.date): MIT code, separately licensed adapted descriptions/assets; v1 is described as beta. Confirm support decisions using linked official policies |

The eight operational APIs supply useful application data without account-changing operations. Open-Meteo adds an explicit commercial-access boundary. deps.dev, OSV and endoflife.date support the [maintainer health workflow](../catalog-health.md). Their network use is deliberate and cached; ordinary offline Genlib discovery does not call providers.

## Existing records corrected by the review

Ten direct wrappers are retained for historical migration discovery with `lifecycle.status: retired` and a reference-only integration mode. Active discovery excludes these retired resources by default. Migration/replacement services such as ChottuLink and Flinku retain their active status.

| Retired service | Corrected IDs | Authoritative evidence |
| --- | --- | --- |
| Firebase Dynamic Links | `firebase-dynamic-link`, `firebase-dynamic-links`, `xamarin-firebase-dynamic-links`, `adame-firebase-ios-dynamiclinks`, `yedincisenol-dynamic-links`, `google-api-firebase-dynamic-links`, `google-apis-firebasedynamiclinks-v1` | [Firebase shutdown FAQ](https://firebase.google.com/support/dynamic-links-faq): service shut down August 25, 2025 |
| Universal Analytics | `universal-analytics`, `thelia-google-universal-analytics`, `cordova-plugin-google-analytics` | [Google's legacy service notice](https://developers.google.com/analytics/legacy/universal-analytics): APIs and services shut down July 1, 2024 |

License scope was clarified in fourteen additional existing records, including the two Schedule-X records merged into main during implementation:

| Resource scope | Correction |
| --- | --- |
| `react-email-editor` | Its MIT React wrapper does not license the embedded Unlayer editor/service; [Unlayer terms](https://unlayer.com/terms) remain separate |
| `survey-react-ui`, `survey-angular-ui` | MIT form renderers remain distinct from paid Creator, Dashboard and PDF features under [SurveyJS licensing](https://surveyjs.io/licensing) |
| `survey-creator-core`, `survey-creator-react`, `survey-creator-vue`, `survey-creator-angular`, `survey-creator-js` | Commercial Creator scope, explicit license review and unknown SPDX ID; a `SEE LICENSE` registry declaration is not an open-source permission |
| `medusa`, `medusajs-analytics`, `medusajs-analytics-posthog`, `medusajs-notification-sendgrid` | MIT core/package declarations do not extend to separate [Medusa Enterprise functionality](https://github.com/medusajs/medusa) |
| `schedule-x-calendar`, `schedule-x-react` | MIT core/React-adapter declarations do not cover the separate Premium drag-and-drop, resize or advanced resource views described in [Schedule-X v4](https://schedule-x.dev/blog/schedule-x-v4) |

Schedule-X had no external catalog record at the start of the review; the subsequent scheduling catalog introduced two records, whose feature/license scopes are now corrected. Its [v4 announcement](https://schedule-x.dev/blog/schedule-x-v4) moves drag-and-drop and resize into Premium, so these capabilities are not described as current free Schedule-X features here. The calendar integration uses an explicitly selected alternative. The broader OpenRewrite ecosystem likewise includes [MSAL source-available restrictions](https://docs.moderne.io/licensing/moderne-source-available-license/) and proprietary artifacts; only the narrow reviewed Apache profile is indexed for direct use.

## Evidence and ongoing curation

`lifecycle` records the service/project state and its primary source. `readiness` distinguishes cataloged metadata, source review, an available implementation/profile and integration verification. `genlib.module` identifies original installable source; `genlib.integrations` points to specific receiving-application packs. None of these fields silently installs packages or changes an agent's authority.

The twelve API records bind to the original `public-data-clients` module. Its 20 Node transport/provider tests passed during implementation, using mocked transport and production parsing. Native builds, real provider quotas, live accounts, deployment security and receiving-application acceptance remain separate profile-specific work. The original direct MCP implementation is under `packages/genlib-mcp`; it is not represented as a published npm package.

Run offline validation and the scoped network verifier when maintaining these records:

```sh
node tools/resources.mjs validate
node scripts/verify-resources.mjs --file resources/catalog/integration-expansion.json
node scripts/verify-resources.mjs --ids universal-analytics,firebase-dynamic-links
```

The network verifier checks repository/link reachability and available registry-declared license strings. HTTP 401/403/429 is reported as blocked and review-required; unimplemented ecosystem checks remain unknown. A timeout is a failed check, not proof that a package is absent. Exact package versions in integration lockfiles and manifests, mock-transport results and real runtime evidence must remain identifiable separately. Recheck specific failures and record unresolved limits instead of converting blocked or unknown checks into successful verification.

## Genlib integration packs

These resource records include sorted `genlib.integrations` bindings and `readiness.level: recipe-available` with the contract as evidence. Read each contract for its supported profile, actual verification and remaining application work. Existing source/license review and module bindings are preserved.

- [API contracts and generated clients](../../integrations/api-contracts/CONTRACT.md): `hey-api`, `hurl`, `microcks`, `oasdiff`, `schemathesis`, `typespec`.
- [Authorization and collaborative state](../../integrations/authorization-collaboration/CONTRACT.md): `cedar`, `loro`.
- [Desktop host and update profiles](../../integrations/desktop-delivery/CONTRACT.md): `velopack`.
- [Developer codemods and template evolution](../../integrations/developer-codemods/CONTRACT.md): `copier`, `dependency-cruiser`, `libcst`, `openrewrite`, `rector`, `ts-morph`.
- [Invoices, PDF templates, email and spreadsheet exports](../../integrations/document-pipeline/CONTRACT.md): `pdfme`, `typst`.
- [PostgreSQL jobs and persistent webhook inbox](../../integrations/durable-jobs/CONTRACT.md): `pg-boss`.
- [Native acceptance and snapshot profiles](../../integrations/native-acceptance/CONTRACT.md): `maestro`, `patrol`, `swift-snapshot-testing`.
- [Native SQLite repositories and migrations](../../integrations/native-persistence/CONTRACT.md): `grdb-swift`, `sqldelight`.
- [Resumable uploads and ZIP exports](../../integrations/resumable-files/CONTRACT.md): `tus-js-client`, `tusd`, `uppy-core`, `zip-js`.
- [Shared Rust domain core and UniFFI bindings](../../integrations/shared-rust-core/CONTRACT.md): `uniffi`.
- [Calendar export and controlled file trees](../../integrations/web-calendar-files/CONTRACT.md): `ical-generator`, `react-arborist`, `react-big-calendar`.
- [Editable data tables, search and time series](../../integrations/web-data-workbench/CONTRACT.md): `glide-data-grid`, `minisearch`, `tabulator`, `uplot`.
- [Schema forms, page editing and input primitives](../../integrations/web-forms-editor/CONTRACT.md): `imask`, `json-forms`, `libphonenumber-js`.
