# Data workbench

Original Apache-2.0 source shares one row/edit/query contract across semantic tables, editable grids, local search and time-series summaries. Choose the smallest widget that meets the application need; selected entrypoints can be incorporated into an existing build.

## Install and compatibility

```sh
npm ci --ignore-scripts
npm test
```

Run these commands in this directory. The measured profile is Node 24.19.0 with React/ReactDOM 18.3.1. **This combined pack supports React 18 only** because stable [Glide Data Grid 6.0.3](https://github.com/glideapps/glide-data-grid) declares React 16–18 peers. Do not bypass dependency resolution to install it in React 19. A React 19 app can deliberately extract and verify a compatible subset as its own new profile.

The lock pins actual TanStack Table **v9**, Tabulator 6.6, Glide 6.0, MiniSearch 7.2 and uPlot 1.6 plus required Glide peers. `src/TanStackTable.tsx` uses the installed v9 feature/row-model API; v8 tutorial code is not interchangeable. Keep browser grids/charts behind a client boundary.

Import only the selected widget styles and `src/styles.css`:

```ts
import 'tabulator-tables/dist/css/tabulator.min.css';
import '@glideapps/glide-data-grid/dist/index.css';
import 'uplot/dist/uPlot.min.css';
```

Customize classes/tokens, explicit dimensions, column labels/widths, captions, series colors and heights. uPlot and canvas/grid containers need usable measured dimensions.

## Shared source contract

| Type/helper | Role |
|---|---|
| `DataRow` | Stable `id`, opaque server `version` and field values |
| `DataColumn` | Field key, label, text/number/boolean kind, editability and optional validation |
| `RowEdit` | Row identity, expected revision and changed fields |
| `DataQuery` | Bounded page, page size, search and allowlisted sorts |
| `DataSource` | Abortable list operation and asynchronous commit returning authoritative rows |
| `applyEdits` | Validates an entire edit batch before returning new rows; never mutates its inputs |
| `normalizeQuery` | Restricts pages/sizes, search and sortable fields before adapter use |

The edit preflight rejects unknown/read-only/prototype fields, invalid cells, repeated cell edits and stale revisions. The server must repeat authorization/validation and atomically compare versions. Client preflight does not commit to a database. Supply your own version-generation and conflict UX. `useDataSource` cancels/supersedes stale list responses and exposes load/error/refresh state; memoize the source and query.

## Widget alternatives

`TanStackTable` provides a semantic table with sort buttons, `aria-sort` and client paging. `PlainDataTable` is a dependency-light rendering alternative. Use server paging through `DataSource` for large datasets rather than loading them all into the browser. See [TanStack Table](https://tanstack.com/table/latest).

`mountTabulator(element, options)` returns replacement/destruction methods. It uses plaintext formatting, typed edit preflight, asynchronous commit and rollback when a save fails. `GlideGrid` supplies the same stable-row edit contract to a canvas grid. Both accept application error handling and authoritative returned rows. Neither invents a persistence backend. See [Tabulator](https://tabulator.info/) and [Glide](https://github.com/glideapps/glide-data-grid).

`createLocalSearch` uses real MiniSearch indexing with prefix/fuzzy search and explicit upsert/remove. Index only fields and rows the current user may access; rebuild on account/authorization changes. Local search is not a permission system or a server search index. See [MiniSearch](https://lucaong.github.io/minisearch/).

`alignTimeSeries` converts irregular samples to sorted aligned arrays for uPlot, fills absent series with null and makes the last observation at a duplicate timestamp win. Timestamps are **Unix seconds**, not JavaScript milliseconds. Nonfinite and out-of-Date-range values fail. `TimeSeriesChart` mounts, updates, observes size and destroys the actual plot; it includes a semantic data table. See [uPlot](https://github.com/leeoniya/uPlot).

Glide's semantic preview is limited to 100 rows and the chart's to 200 samples, with explicit notices. Provide complete paginated/table/export routes when users need more than those previews. A bounded preview does not provide access to an entire hidden dataset.

## Verification and licenses

Five tests compile the actual dependency APIs and verify batch immutability/conflicts, query allowlists, MiniSearch updates, time alignment and real TanStack v9 server rendering. Browser Tabulator/Glide editing, uPlot canvas/resize, focus and screen-reader interactions were not executed. Run them with the receiving application's fonts/layout/data sizes before adopting the profile.

Direct upstream libraries retain their MIT licenses; the original glue is Apache-2.0. Preserve installed dependency notices. Treat a TanStack major upgrade or Glide React-peer change as a profile change and rerun both local tests and browser acceptance rather than merely loosening version ranges.
