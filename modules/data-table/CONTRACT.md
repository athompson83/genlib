# Searchable sortable data table

## Exports and requirements

`DataTable<T>`, `DataTableProps<T>`, `DataTableColumn<T>`, `DataTableSort`, `DataTableValue`, and the pure `selectTableRows` helper are exported by `data-table/DataTable.tsx`. Requires the target's React 18 or 19 and TypeScript/TSX pipeline. No runtime library is added. The file has a `"use client"` boundary.

Import `theme-tokens/theme.css`, then `data-table/data-table.css`, in the application's global CSS entry. CSS is scoped to `.gl-table`.

## Inputs

- Required: immutable `rows`, at least one `columns` entry, stable unique `rowId(row)`, and a text `caption`.
- A column has a unique `id`, text `header`, and `value(row)` returning a string, number, boolean, null, or undefined. Optional `render(row)` changes visible content. Search continues to use `value`, not the renderer.
- A column is sortable only with `sortable: true`. Optional `compare(left, right)` supplies custom ordering. Default ordering handles numbers, booleans, and natural text; missing values stay last in either direction. Ties retain input order.
- Set `searchable: false` on a column to exclude it from case-insensitive substring search. Set it on the table to hide and disable search.
- `pageSize` defaults to 10. Non-finite values or values below 1 fall back to 10; positive fractions are rounded down.
- `initialSort` initializes internal sort state. `searchLabel`, `searchPlaceholder`, `emptyMessage`, `noResultsMessage`, and `className` customize presentation.

## Integration points

`plan` and `add` return this example with paths relative to the receiving app's root, including a custom `--out`. Put the component in a client module and adjust relative paths if that file lives elsewhere. Load the two stylesheets once, using the framework's global CSS entry when required.

```tsx
"use client";
import { DataTable, type DataTableColumn } from "./genlib/data-table/DataTable.js";
// Load once; use the framework's global CSS entry when required.
import "./genlib/theme-tokens/theme.css";
import "./genlib/data-table/data-table.css";

type Project = { id: string; name: string; openTasks: number };
const columns: DataTableColumn<Project>[] = [
  { id: "name", header: "Project", value: (row) => row.name, sortable: true },
  { id: "tasks", header: "Open tasks", value: (row) => row.openTasks, sortable: true, align: "end" },
];

export function ProjectsTable({ projects }: { projects: readonly Project[] }) {
  return <DataTable rows={projects} columns={columns} rowId={(row) => row.id} caption="Projects" pageSize={10} />;
}
// Mount ProjectsTable with your already-authorized project rows.
// Run the app's TSX build; check search, sorting, pagination and empty states.
// genlib verify checks copied-file hashes, not rendering or application behavior.
```

In server-component frameworks, define accessor and renderer functions in a client component. Pass only already-authorized serializable data across the server/client boundary. Do not attempt to serialize these callback functions from a server component.

## Behavior and verification

Search and sort return to page one. Dataset shrinkage clamps the page to an available page. The input array is not mutated. Column headers communicate sort direction, every table has a caption, and count changes use a polite status region. The scroll region is keyboard-focusable for wide content.

Tests cover filtering, ascending/descending and stable sorting, missing values, immutability, pagination, page clamping, zero matches, and accessible sort/search controls. The handoff test compiles the returned example against the installed files and exercises it in a local React DOM fixture with a custom output path; it does not validate browser layout or the receiving application's routes, data, or styling. Validate the completed table with the project's data and assistive technology.

After mounting the component, run the receiving application's actual build and tests, check that both stylesheets load, and exercise search, both sort directions, page changes and empty states. A successful `genlib verify` only establishes agreement with the copied baseline. No application test command is created or executed by installation.

## Boundaries

This is a small-dataset client table. All supplied data is present in the browser even when filtered out or on another page. Filtering is never access control. There is no fetch adapter, database, server pagination, virtualization, selection, or persistence. Large or sensitive datasets need a separately designed server query and authorization path. Custom cell renderers must preserve valid table semantics and accessible interactive controls.
