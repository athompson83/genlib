# Web and application integration profiles

These seven packs turn catalog selections into editable workflows: validated source models, real upstream adapters/components, fixtures, dependency locks and explicit application contracts. They cover uploads, forms/editing, data grids/search/charts, calendar/tree interactions, document exports, durable work and commerce. Genlib copies reviewed source; dependencies and services are adopted deliberately by the receiving project. See [installation and verification](../integrations.md) for the CLI and [MCP access](../mcp-server.md) for the same operations through a coding harness.

## Select by the work you need to avoid rebuilding

| Pack and contract | Reusable behavior | Main application adapter |
|---|---|---|
| [`resumable-files`](../../integrations/resumable-files/CONTRACT.md) | Uppy Dashboard/headless tus, scoped resume, per-request credentials, tusd quota/ownership hooks, bounded Blob/stream ZIP export | Authenticated upload gateway, persistent quota/ownership and completion/scanning |
| [`web-forms-editor`](../../integrations/web-forms-editor/CONTRACT.md) | JSON Forms validation, Puck registered blocks, revision-safe drafts, Radix/React Aria dialogs, phone and masked inputs | Authorized schemas, document store, publication and design tokens |
| [`web-data-workbench`](../../integrations/web-data-workbench/CONTRACT.md) | Shared typed batch edits for TanStack/Tabulator/Glide, MiniSearch updates, uPlot alignment and semantic previews | Versioned server data, atomic commits, paging and complete accessible data access |
| [`web-calendar-files`](../../integrations/web-calendar-files/CONTRACT.md) | Explicit timed/all-day rules, stable iCalendar output, controlled Arborist rename/create/delete/move | Availability and permission checks, durable event/tree revisions |
| [`document-pipeline`](../../integrations/document-pipeline/CONTRACT.md) | One invoice model across pdfme, React Email, ExcelJS/PapaParse; Gotenberg and trusted Typst variants | Accounting data, templates/fonts, conversion deployment and delivery |
| [`durable-jobs`](../../integrations/durable-jobs/CONTRACT.md) | pg-boss lifecycle, leased PostgreSQL webhook inbox, byte-identity deduplication, retries/dead states | Verified provider signature/tenant, database migration, workers and external-effect idempotency |
| [`commerce-storefront`](../../integrations/commerce-storefront/CONTRACT.md) | Medusa core product/cart APIs and UI, shipping/payment/order sequencing, uncertain-outcome handling | Server session/cart authorization and an explicitly authorized payment SDK flow |

Packs group related dependencies for verification, while source entrypoints expose alternatives separately. A project can use one primitive/grid/converter rather than shipping every alternative in its browser bundle. Keep the pack's lock and contract while evaluating it; any extracted subset becomes the receiving application's responsibility to verify.

## Discover and copy

Example agent requests are data, not instructions to change the project's authority:

```json
[
  { "task": "Add resumable authenticated uploads and a streaming ZIP download", "type": "integration" },
  { "task": "Build a schema-driven settings form and versioned page editor", "type": "integration" },
  { "task": "Add persistent webhook deduplication and PostgreSQL jobs", "type": "integration" }
]
```

Use the selected pack contract to check the existing application's dependency profile, boundaries and design system before copying:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" find schema forms --type integration --limit 3 --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration inspect web-forms-editor --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration plan web-forms-editor --target "$APP_ROOT" --json
node "$GENLIB_ROOT/bin/genlib.mjs" integration add web-forms-editor --target "$APP_ROOT" --json
```

The default destination is `genlib/integrations/<id>` inside the existing application. No npm install, migration, hook, publication, payment or service startup occurs during copying. From the copied pack folder, deliberately run:

```sh
npm ci --ignore-scripts
npm test
```

Every web pack uses these commands. `npm test` builds the actual pinned TypeScript package APIs and runs its fixtures. Source imports retain `.js` suffixes for NodeNext compilation; a receiving bundler may consume the TypeScript directly. Keep server-only files out of client exports. The root `genlib` command remains free of these runtime dependencies.

## Shared boundaries that make the recipes reusable

### Identity and versions

Use stable IDs and opaque revisions across persistent UI state. Forms/editor envelopes contain `{ id, schemaVersion, revision, data }`. Tables use row IDs and versions plus edits with `expectedVersion`. File trees preserve node identity when renamed or moved. These contracts let an application attach its own database rather than replacing the feature when persistence changes.

The server must enforce the same revision and permission checks atomically. A successful frontend preflight or an `If-Match` header does not prevent another writer from winning. `DraftSession` specifically preserves edits made during an outstanding save, and its conflict leaves the draft dirty. Tree/grid commit callbacks return to the host for durable acceptance. Remount stateful document/cart components when changing their document, tenant or session.

### Side effects and uncertainty

An upload resume record is a hint; every HEAD/PATCH/DELETE must pass the authenticated tus gateway. The tusd hook adapter reserves server-owned IDs and replaces client ownership metadata. Completion callbacks should persist and enqueue scanning/finalization, while replay-safe cleanup handles abandoned or terminated uploads. Hook routes authenticate tusd itself separately from authenticating the original user.

Webhook receipt deduplication lives in PostgreSQL. A unique tenant/provider/event key and raw-byte hash distinguish a genuine repeat from conflicting content. A random expiring lease prevents stale workers from recording completion after ownership changes. The handler still needs external-provider idempotency: database state cannot eliminate the crash window between a remote effect and receipt completion.

The storefront keeps credentials and cart ownership on the trusted server. It never retries an uncertain payment/cart mutation automatically. The UI requires contact/delivery, a selected shipping option and a reviewed total before the explicit order action. A host-supplied payment callback must perform the provider challenge flow; a callback that simply returns is not payment integration. No test performs a live purchase or sends a message.

### Units, dates and formats

| Boundary | Required representation |
|---|---|
| Medusa v2 price/cart data | Major currency units; do not divide API amounts by 100 |
| Invoice document | Safe integer minor units and explicit currency precision |
| uPlot samples | Unix seconds, with absent observations represented as null |
| Timed calendar event | ISO instant with explicit offset or `Z` |
| All-day calendar event | Strict date-only start and exclusive end |
| CSV input | Strings until the supplied domain parser validates them |
| Upload/archive path | Validated endpoint or portable relative name; never a storage authorization decision |

Convert deliberately at these boundaries rather than reusing similar-looking numbers or dates. In particular, the storefront and invoice fixtures intentionally use different monetary representations. The calendar displays browser-local timed events and exports UTC instants; this is not a generic venue-timezone or recurring-booking engine. Availability checks remain on the server.

## Styling and browser integration

The packs expose controlled props, callbacks, column/series definitions, template/plugin registries and CSS classes/tokens. Import only the selected upstream CSS in the host's intended style layer:

| Feature | Upstream stylesheet |
|---|---|
| Uppy Dashboard | `@uppy/core/css/style.min.css`, `@uppy/dashboard/css/style.min.css` |
| Puck | `@puckeditor/core/puck.css` |
| Tabulator | `tabulator-tables/dist/css/tabulator.min.css` |
| Glide | `@glideapps/glide-data-grid/dist/index.css` |
| uPlot | `uplot/dist/uPlot.min.css` |
| React Big Calendar | `react-big-calendar/lib/css/react-big-calendar.css` |

Each React pack also includes original `src/styles.css`, except the document renderer whose branding is controlled through template/email props. Supply real dimensions to grids, charts, trees and the calendar. Dispose imperative Uppy, Tabulator, uPlot, IMask and designer instances when their host lifecycle ends. Keep custom schemas/blocks synchronized with validation: Puck's supplied validator covers its flat starter blocks, so nested/custom slots need an appropriate validator.

Semantic alternatives are included where a canvas UI otherwise hides data. Glide previews the first 100 rows and the chart table previews 200 observations with visible limits; provide complete pagination/export/table access for larger datasets. Radix/React Aria own primitive behavior, but their integration with the application's layout and nested flows still needs focus, keyboard and assistive-technology acceptance. SSR markup tests are not a browser accessibility audit.

## Local verification matrix

All results below were run on Node **24.19.0**, using each pack's pinned dependencies, strict TypeScript build and Node test runner. The lane has **39 passing tests**, zero failures and zero skips. These are named local profiles, not receiving-application certification.

| Pack | React exercised | Tests | Actual execution | Remaining runtime acceptance |
|---|---:|---:|---|---|
| `resumable-files` | None | 6 | Real tus client/local HTTP resume; real zip.js round trips/streaming; hook policy adapters | Uppy browser interaction, deployed tusd/auth gateway/storage/scanning |
| `web-forms-editor` | 19.3.0 | 6 | Real JSON Forms/AJV and Puck SSR, draft races/conflicts, phone parsing, dialog triggers | Browser editor/masks/focus/keyboard, real persistence/publication |
| `web-data-workbench` | 18.3.1 | 5 | Real TanStack v9 SSR, MiniSearch updates, typed edits/query checks, uPlot data alignment | Canvas/grid editing, resize, large data and accessibility |
| `web-calendar-files` | 19.3.0 | 4 | Real iCalendar generation/DST rules; Arborist-compatible movement/tree invariants | Browser calendar/tree interaction, calendar-client import, booking persistence |
| `document-pipeline` | 19.3.0 | 6 | Real pdfme PDF/React Email/ExcelJS/PapaParse; mocked Gotenberg transport; controlled executable Typst fixture | Real converters, designer browser, fonts/layout/email-client review |
| `durable-jobs` | None | 5 | Real SQL in PGlite 0.5.8; actual pg-boss import/startup guards | External PostgreSQL concurrency/failover and pg-boss worker execution |
| `commerce-storefront` | 19.3.0 | 7 | Fixture Medusa transport and real React SSR; checkout controller/uncertainty | Live Medusa, stock conflicts, provider challenge and order reconciliation |

`web-data-workbench` explicitly requires **React 18** because the pinned stable Glide release does not support React 19. The other React packs declare React 18.3/19 peer fit, with execution only on the listed React 19 profile. Compatibility metadata is not evidence that an unexecuted React/browser/OS combination passed.

Five manifests label their bounded local profiles `tested`. `durable-jobs` and `commerce-storefront` remain `experimental` for their external-service acceptance gaps. New resource bindings are `recipe-available`; they do not automatically become `integration-verified`. Read [verification/readiness semantics](../integrations.md#interpret-verification-and-readiness) before comparing these statuses.

## License and maintenance boundaries

The adapters, fixtures, styles, SQL and Typst template are original Apache-2.0 contributions. Installed dependencies keep their upstream licenses and notices. The contracts link to current primary documentation and define precise component/service boundaries; a permissive code license does not cover a commercial service, paid extension, asset collection or third-party font.

| Boundary | Scope carried by this profile |
|---|---|
| Medusa | MIT core Store API; Enterprise Edition, hosted services and payment providers remain separate |
| Puck | MIT editor/rendering core and original blocks; no Cloud/AI service or copied commercial blocks |
| Gotenberg/Typst | Trusted conversion adapter; application deploys the renderer/compiler and reviews embedded dependencies/fonts/assets |
| React Email | Current supported component/rendering package; no email delivery service |
| zip.js | BSD-3-Clause dependency; original export policy remains Apache-2.0 |
| React Aria/Typst/PGlite | Upstream Apache-2.0 components in the respective runtime/test scopes |

Review the lockfile and upstream release/peer/API changes together. A major TanStack migration, Glide React-peer change, pg-boss schema change or Medusa API change needs its corresponding behavioral fixture and runtime acceptance updated. No automatic upgrade overwrites customized source. `integration verify` reports changes relative to the copied baseline; it does not judge those edits or reset them.

For source selection and additional license evidence, see the [external integration expansion](../resources/integration-expansion.md). For typed API contracts, codemods, native persistence and other non-web workflows, see [developer and native profiles](developer-native.md).
