# CSV download safe for Excel · 0.1.0

## What installs

Five original Apache-2.0 files under `csv-download/`:

- `core.ts`: `createCsvExporter` (`exportCsv`, `columnsFor`, `defaultsFor`), `CsvExportError`, the `RowSource` and `ExportLog` interfaces, and the helpers `csvField`, `formatCell`, `safeCsvFilename`, `contentDisposition` and `downloadHeaders`.
- `memory-store.ts`: `createMemoryRowSource` and `MemoryExportLog`, reference implementations for tests and prototypes.
- `http.ts`: `createCsvExportHandler`, a server-only Fetch `Request`/`Response` adapter with configurable `routes` and `statusFor`.
- `schema.sql` and `sql-store.ts`: the `csv_export_log` audit table, `createSqlExportLog(executor, { table? })`, and `createSqlRowSource(executor, options)`, a tenant-scoped keyset source over one of your tables. Table and column names are validated against `[a-z_][a-z0-9_]*` and double-quoted per part (`"public"."order"`), so keywords such as `order` or `user` work; every value is a parameter. Both take any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

The core does not need `http.ts`: call `exportCsv` from any route and return `new Response(result.stream, { headers: result.headers })`.

## When to use it

Use it when signed-in users download a table (orders, contacts, invoices, audit entries) as a CSV file that they will open in Excel, Numbers or Google Sheets. Do not use it to import CSV (see `csv-import`) or to produce `.xlsx` workbooks.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `columns` | Every exportable column: `{ key, header, value(row) }`. Only these are ever written. `defaultColumns` is the set used when a request selects none. |
| `source.fetchPage(requester, { cursor, limit, filter })` | One page of rows **already scoped to `requester.tenantId`**, keyset-paged: `WHERE tenant = $1 AND id > cursor ORDER BY id LIMIT limit`, returning `{ rows, nextCursor }`. On PostgreSQL use `createSqlRowSource(db, { table, columns, tenantColumn?, ownerColumn?, filters? })`. |
| `authorize(requester, row)` | Optional row-level rule (owner, team, record status). Refused rows are skipped and counted as `denied`. |
| `canReadColumn(requester, key)` | Optional column-level rule for sensitive columns (salary, email). Selecting a refused column fails with `forbidden`. |
| `canExport(requester, request)` | Optional permission for the export itself, checked before any row is fetched. |
| `tenantOf(row)` | Optional cross-check: rows from another tenant are skipped even if the source returned them. |
| `log` | Optional `ExportLog`; `createSqlExportLog(db)` writes one `csv_export_log` row per export. |
| HTTP `authenticate(request)` | Your session lookup, returning `{ tenantId, userId, roles? }` or `null`. Never take the tenant from the query string. |
| HTTP `parseFilter(url, requester)` | Optional. Turns query parameters into the source's filter; throw `CsvExportError("invalid-request", …)` for bad input. |

```ts
import { createCsvExporter } from "./genlib/csv-download/core.js";
import { createSqlRowSource, createSqlExportLog } from "./genlib/csv-download/sql-store.js";
import { createCsvExportHandler } from "./genlib/csv-download/http.js";

const exporter = createCsvExporter({
  columns: [
    { key: "id", header: "Order", value: (r) => r.id },
    { key: "customer", header: "Customer", value: (r) => r.customer },
    { key: "total", header: "Total", value: (r) => Number(r.total) },
  ],
  source: createSqlRowSource(db, { table: "orders", columns: ["customer", "total", "tenant_id"], filters: { status: "status" } }),
  tenantOf: (r) => String(r.tenant_id),
  authorize: (who, row) => who.roles?.includes("admin") || row.owner_id === who.userId,
  log: createSqlExportLog(db), maxRows: 50_000,
});
export const handler = createCsvExportHandler({
  exporter, prefix: "/api/orders", authenticate: (request) => sessionFrom(request),
  routes: { export: "/export.csv" }, statusFor: { forbidden: 404 },
  parseFilter: (url) => (url.searchParams.get("status") ? { status: url.searchParams.get("status") } : undefined),
  onError: (error) => log.error("csv export", error),
});
```

## Behavior

- **RFC 4180.** Fields containing `,`, `"`, CR, LF or a leading/trailing space are quoted, with `"` doubled. Every record, including the last, ends with CRLF (`lineEnding: "\n"` is an explicit opt-out). A record of one empty field is written as `""` so it is not a blank line.
- **Formula neutralization.** String cells and headers starting with `=`, `+`, `-`, `@`, TAB or CR get a leading `'` before quoting (OWASP CSV injection guidance). `formulaTriggers`, `formulaEscape` and `neutralizeFormulas: false` change this. Numbers, bigints, booleans and dates are typed values and are written as-is, so `-5` stays a number. `null`, `undefined`, `NaN` and invalid dates become empty; objects fail with `invalid-cell`.
- **Excel encoding.** The file is UTF-8 and starts with the byte-order mark `EF BB BF` (`bom: false` to omit it). The content type is `text/csv; charset=utf-8`.
- **Authorized rows and columns.** The requester is copied and frozen. The source receives it for every page; the client's `filter` is passed through but can never change the tenant. Rows refused by `tenantOf` or `authorize` are skipped and counted. Requests may only name declared, readable columns, each at most once.
- **Streaming and bounds.** The first page is fetched before `exportCsv` returns, so an unavailable source becomes an error status instead of a cut file. Later pages are fetched only when the `ReadableStream` (byte-length queue, `highWaterMark` 64 KiB) asks for more, so memory holds about one page and an unread download stops fetching. `maxRows` (100,000) and `maxBytes` (50 MiB, BOM and header included) end the export: by default the stream errors with `limit-exceeded`; with `onLimit: "truncate"` it ends cleanly and the summary says `truncated: true`. A source that returns more than `limit` rows, repeats its cursor or returns over 100 empty pages in a row fails with `source-error`.
- **Cancellation.** Cancelling the stream (client disconnect) or aborting the `signal` stops fetching and records a `cancelled` summary, including when the abort makes an in-flight page fetch reject.
- **Summary.** Each export calls `log.record` and then `onFinish` once with `{ ok, error?, tenantId, userId, columns, rows, denied, bytes, pages, truncated, startedAt, finishedAt }`.
- **Errors.** `forbidden`, `invalid-columns`, `invalid-request`, `invalid-cell`, `limit-exceeded`, `source-error`, `cancelled`. Source exceptions are wrapped; the original is kept in `error.cause`, never in the message.

## Download headers

`downloadHeaders(filename)` returns `content-type: text/csv; charset=utf-8`, `cache-control: no-store`, `x-content-type-options: nosniff` and an RFC 6266 `content-disposition: attachment`. The name is sanitized (path separators, quotes, `;`, control and Windows-reserved characters become `_`; dots and spaces trimmed; `.csv` ensured; at most 150 characters). Printable-ASCII names use `filename="…"`; other names add an ASCII fallback plus `filename*=UTF-8''…` percent-encoded per RFC 8187.

## HTTP routes

| Route (default) | Query | Result |
| --- | --- | --- |
| `GET {prefix}/export` | `columns=a,b` (or repeated), `filename`, your filter parameters | `200` streamed CSV attachment |
| `GET {prefix}/columns` | none | `200 {columns: [{key, header}], defaults: [key]}` for this requester |

Override paths with `routes: { export, columns }` and statuses with `statusFor`. Default statuses: `unauthenticated` 401, `forbidden` 403, `invalid-columns` and `invalid-request` 400, `not-found` 404, `method-not-allowed` 405, `limit-exceeded` 413, `source-error` and `invalid-cell` 500 (generic message; details go to `onError`). More than 100 column names is `invalid-request`. Error bodies are `{error, message}` JSON with `cache-control: no-store`.

## Verify

`npm run build && node --test tests/csv-download.test.mjs tests/csv-download-sql.test.mjs` covers:

- RFC 4180 quoting and CRLF records, including embedded line breaks
- formula neutralization, its configuration and the typed-number exemption
- BOM, UTF-8 bytes and the LF opt-out
- RFC 6266/8187 headers and filename sanitization
- tenant scoping, `authorize`, `tenantOf`, column allow-lists and `canReadColumn`, `canExport`
- row and byte caps (error and truncate), backpressure, cursor paging, malformed sources, cancellation and abort
- the export log, the HTTP adapter with `routes`/`statusFor` overrides, and the PostgreSQL source and log on PGlite

In the receiving app, run an export as two users of different tenants against your real tables and confirm each file holds only that user's rows.

## If something fails

- **Excel shows `Ã©` instead of `é`:** the BOM was removed (`bom: false`) or a proxy re-encoded the body.
- **Numbers show a leading `'`:** the column returns strings; return a `number` from `value` (for PostgreSQL `numeric`, `Number(r.total)` when precision allows).
- **The download stops partway:** read `onFinish`/the log; `limit-exceeded` means raise `maxRows`/`maxBytes` or narrow the filter.
- **Rows repeat or loop:** your source's cursor column is not unique or not the `ORDER BY` column.

## Limits

This package does not authenticate users or define permissions.

- **Neutralization scope.** Leading spaces before `=` and full-width characters are not detected.
- **Mid-stream failures.** After the first chunk is sent the status is already 200, so a later limit or source error aborts the connection.
- **No background jobs.** Exports run within the request; queue a job and email a link for longer runs.
- **Testing scope.** The SQL source is tested on PGlite (single connection) with text ids.

Production data volumes, spreadsheet application versions and consuming-application acceptance remain project responsibilities.
