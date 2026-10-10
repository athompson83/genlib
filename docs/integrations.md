# Integration packs

Integration packs provide original Genlib application glue around selected external tools. Each pack includes a manifest, a contract, explicit source/configuration files, fixtures and verification commands. They are isolated opt-in profiles: copying one pack does not install its packages, start a service, run a migration or execute a hook.

## Choose a pack

| Pack | Included workflow | Receiving project supplies |
|---|---|---|
| `resumable-files` | Uppy/tus upload policy, resumable transport and streaming ZIP actions | Authorized upload endpoint, tenant identity, storage and browser acceptance |
| `web-forms-editor` | JSON Forms, Puck registered components, drafts, phone/masked inputs and accessible primitives | Schemas, brand tokens, permissions and durable draft persistence |
| `document-pipeline` | pdfme templates, PDF/conversion profiles, email and CSV/XLSX import/export | Authorized data, branding/fonts, rendering services and delivery |
| `web-data-workbench` | TanStack table, Tabulator/Glide editing, MiniSearch and uPlot summaries | Server data/paging, persistence and device/accessibility acceptance |
| `web-calendar-files` | Calendar booking rules, stable iCalendar output and controlled tree mutations | Availability/permission checks and atomic persistence |
| `durable-jobs` | pg-boss workers and a leased PostgreSQL webhook inbox | PostgreSQL, provider signature verification, tenant identity and operational policy |
| `commerce-storefront` | Medusa MIT-core storefront HTTP flow, cart and order state | Server credentials, customer/session authorization, payment integration and live checkout acceptance |
| `developer-codemods` | Copier updates, ts-morph/ast-grep, LibCST, Rector/OpenRewrite and import boundaries | Reviewed target files, selected rules and each language toolchain |
| `api-contracts` | OpenAPI clients, TypeSpec/Hey API/Orval variants, oasdiff, Hurl/Schemathesis and Microcks | The application's contract, authentication and disposable test service |
| `native-acceptance` | Maestro, Patrol and Swift snapshot fixtures | App under test, deterministic accounts, emulator/simulator and fixed OS baselines |
| `native-persistence` | SQLDelight/GRDB local persistence and versioned SQL migrations | Platform driver, app repository wiring and runtime migration acceptance |
| `shared-rust-core` | UniFFI Rust core with language binding examples | Mobile/desktop build packaging, generated bindings and target toolchains |
| `desktop-delivery` | Wails, Avalonia/Velopack, Tauri and Electron host profiles | OS build tools, signing/notarization, update hosting and release acceptance |
| `authorization-collaboration` | Cedar policy, OpenFGA sharing and Loro collaboration | Authenticated principals, persistence/sync, tenant boundaries and authoritative business rules |
| `typed-backend-services` | sqlc data access and Connect RPC service/client profiles | Database/service deployment, authentication and application contracts |
| `observability-harness` | OpenTelemetry correlation and disposable integration services | Collector destination, retention, redaction and runtime/service availability |

Read [web and application profiles](integrations/web.md) and [developer and native profiles](integrations/developer-native.md) for each pack's choices. The separate versioned [`public-data-clients` module](../modules/public-data-clients/CONTRACT.md) supplies 12 bounded server-side API adapters. [The expansion guide](resources/integration-expansion.md) records external licenses, services and adoption boundaries.

## Discover, inspect, plan and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find resumable uploads --type integration --limit 3 --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration inspect resumable-files --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration plan resumable-files --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration add resumable-files --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration verify --target "$APP_ROOT" --json
```

The default destination is `genlib/integrations/<id>` within the receiving project; `--out` selects another ordinary relative directory. Review the copied `CONTRACT.md` before installing dependencies. Commands in a manifest run from the pack directory unless the contract gives a named subproject directory. Keep an isolated package profile when upstream peer constraints differ from the main app.

The installer validates the manifest, checks source hashes, enforces declared React compatibility, plans every destination, and preserves existing untracked or modified files. Known incompatible React versions cannot be bypassed with `--allow-unverified`. Glide's stable profile is React 18; inspect other profiles for their declared majors. `--allow-unverified` permits a missing/unrecognized target manifest only after a separate compatibility check.

Original source provenance and hashes are recorded in `.genlib/integrations-lock.json`. Attribution is copied under `.genlib`; the module and integration installers share a write lock. Dependency managers and project scripts remain under the receiving project's control. After intentional source customization, `integration verify` reports drift without overwriting files or changing the baseline. Upgrading an installed version requires a deliberate diff and migration; a newer manifest cannot silently replace an old installation.

Files are staged before atomic publication. If installation fails, rollback removes only newly published files whose bytes still match that installation. Concurrent edits survive and remain available for deliberate reconciliation; temporary staging and the shared write lock are cleaned up.

The [direct MCP server](mcp-server.md) exposes the same inspect/read/plan/install/verify operations. Source reads are separate, bounded requests over the exact file inventory.

## Interpret verification and readiness

`verification.level` is `tested` or `experimental`. A tested pack names the environment and checks actually run in `verification.profiles`; every pack carries commands and limitations. Partial Node/Python checks do not establish Android, iOS, Windows or container service acceptance. Read the contract and run the target-specific checks before shipping a receiving application.

Catalog readiness is independent:

| Readiness | Meaning |
|---|---|
| `cataloged` | Discovery metadata is present |
| `source-reviewed` | The indicated upstream sources were reviewed |
| `recipe-available` | Reusable Genlib source/profile exists; inspect its verification scope |
| `integration-verified` | Named receiving-application profiles and evidence establish this narrower claim |

New packs are `recipe-available`. Their fixture tests do not automatically promote every related external resource to `integration-verified`. Lifecycle uses separate active/deprecated/retired/unknown values with evidence dates. Retired resources stay available for deliberate migration lookup through `--include-retired` and are excluded from default recommendations.

## Manifest and provenance

`integrations/<id>/integration.json` is authored metadata. It declares schema version 1, ID, semantic version, original Apache-2.0 license, title/summary, languages/frameworks/platforms, resource IDs, tags, files, entrypoints, compatibility when applicable and verification. Its `files` array includes `CONTRACT.md` and every file needed to adopt and verify the profile; the manifest itself is included automatically.

All file paths are relative to the pack. Vendor directories, installer state, traversal, symlinks, hard-linked source, file/directory collisions and undeclared entrypoints are rejected. A file is limited to 5 MiB and a pack to 25 MiB. Generated external dependency trees do not belong in the manifest. Small generated bindings owned by the profile may be included with accurate generator/provenance notes.

`npm run integrations:build` creates `registry/integrations.json` with exact file hashes and attribution hashes. `npm run integrations:check` checks freshness and validates all resource bindings. Never hand-edit generated hashes. An original Apache-2.0 adapter does not relicense its dependencies or provider data; review the exact upstream component and keep its notices. The conservative `--license-policy permissive` filter excludes mixed/unknown external licenses and any integration with a declared non-permissive or review-required resource.

Resource bindings are bidirectional: every pack's `resources` entry has a matching `genlib.integrations` reference on the external record, with `recipe-available` readiness and a contract path. Resource discovery, the compact index and Jev carry the available module/pack IDs. Discovery suggests inspecting that Genlib contract before the upstream installation command, so a resource lookup reaches the authored integration without another broad search.

## Add or update a pack

Write the contract and real source/fixtures in an isolated pack directory. Pin optional package/tool versions, declare precise runtime/peer support, execute meaningful profile checks, and leave unavailable profiles experimental with reproducible commands. Bind external resources by their existing canonical IDs; add missing resources with source evidence and scoped licensing. Use the root [contribution workflow](../CONTRIBUTING.md), regenerate registries/docs/skills/search index, and run `npm run check` plus the pack's own checks.
