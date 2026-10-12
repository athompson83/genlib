# Cursor pagination for APIs · 0.1.0

## What installs

Five original Apache-2.0 files under `keyset-pagination/`:

- `core.ts`: `createKeysetPager` (`page`, `parseLimit`, `inspectCursor`), `KeysetError`, the `KeysetSource`, `SortField` and `CursorKey` types, and the helpers `compareKeys`, `canonicalJson` and `formatLinkHeader`.
- `memory-store.ts`: `createMemoryKeysetSource`, a source over any array or iterable, for tests, prototypes and small lists.
- `sql-store.ts`: `buildKeysetQuery` (one parameterized SELECT per page) and `createSqlKeysetSource(executor, options)` for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).
- `schema.sql`: an example list table with one keyset index per declared sort. Copy the index pattern to the table you already list.
- `http.ts`: `createKeysetListHandler`, a server-only Fetch `Request`/`Response` adapter that wraps one list endpoint.

The core works without `http.ts`. There is no hidden database, session or secret store; the application supplies them.

## When to use it

Use it for any API list endpoint or infinite-scroll feed that must stay correct while rows are inserted and deleted, and that serves more than one tenant or user. Do not use it when clients need to jump to page N or show a total page count; that needs offset pagination and a count query, with their known costs.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `keys` | One or more `{id, secret}` with 32+ random bytes from your secret store. The first signs; every listed key verifies. Rotate by prepending a new key; remove the old one after `ttlMs`. |
| `sorts`, `defaultSort` | Named sorts. Each lists 1 to 8 `{key, direction, type, column?}` fields over NOT NULL columns and ends with a `unique: true` tie-breaker (usually the primary key). `type` is `number`, `string` (code-point order, like `COLLATE "C"`) or `timestamp` (a `timestamptz` column, exact to the microsecond). |
| `source` | `createSqlKeysetSource(db, {table, columns?, scopeColumns, filterColumns?, where?, toItem?})` on PostgreSQL, `createMemoryKeysetSource({items})`, or your own `fetch(query)` that returns rows strictly after `query.after` in `query.order`, at most `query.limit`. |
| `getValue(item, key)` | Optional. Reads a sort value from an item (default `item[key]`) for sources without `fetchWithKeys`. The SQL and memory sources supply keys themselves: the SQL source reads each sort `column` straight from the row, so `toItem` only shapes the response. |
| `defaultLimit`, `maxLimit`, `ttlMs` | Defaults 20, 100 and 24 hours. |
| HTTP `scope(request)` | The tenant/user from your trusted session or API key. Returning null answers 401. Never read it from the query. |
| HTTP `filters` | The query parameters the endpoint accepts as filters: `{type, values?, multiple?}`. |

```ts
import { createKeysetPager } from "./genlib/keyset-pagination/core.js";
import { createSqlKeysetSource } from "./genlib/keyset-pagination/sql-store.js";
import { createKeysetListHandler } from "./genlib/keyset-pagination/http.js";

const pager = createKeysetPager({
  keys: [{ id: "2026-10", secret: CURSOR_SECRET_BYTES }],
  sorts: {
    newest: [
      { key: "createdAt", column: "created_at", direction: "desc", type: "timestamp" },
      { key: "id", direction: "desc", type: "string", unique: true },
    ],
  },
  defaultSort: "newest",
  source: createSqlKeysetSource(db, {
    table: "projects", scopeColumns: { tenantId: "tenant_id" }, filterColumns: { status: "status" },
    toItem: (row) => ({ id: row.id, name: row.name, status: row.status, createdAt: row.created_at }),
  }),
});
export const GET = createKeysetListHandler({
  pager, prefix: "/api", routes: { list: "/projects" },
  scope: async (request) => { const s = await session(request); return s ? { tenantId: s.tenantId } : null; },
  filters: { status: { type: "string", values: ["active", "archived"] } },
});
```

## Behavior

- **Cursor format.** `<keyId>.<base64url JSON>.<base64url HMAC-SHA256>`, at most 4,096 characters. A page whose boundary values would make a longer cursor throws a `RangeError` at encode, rather than issuing a cursor the next request would reject. The JSON holds the direction, the sort name, the boundary row's sort values, an expiry and a 128-bit keyed fingerprint of the scope, filters and sort definition. It never holds an offset or the raw scope. Values are signed, not encrypted.
- **Verification order.** Shape (`malformed-cursor`), then signature with the key named in the cursor (`invalid-signature`, also for an unknown key id), then expiry (`expired-cursor`), then the fingerprint against the current request (`scope-mismatch`). Base64url must be canonical.
- **Scope binding.** The fingerprint covers the scope object, the filters (key order does not matter, values do) and the sort's name, fields, directions and columns. Another tenant, other filters, a dropped filter, another sort or an edited sort definition all fail with `scope-mismatch`. The page size is not bound, so clients may change `limit` between pages.
- **Keyset order.** The pager asks the source for `limit + 1` rows strictly after the cursor's key tuple. The extra row only tells whether another page exists. Backward pages flip every direction and reverse the result. The pager checks that rows arrive strictly increasing and after the cursor (`checkOrder`, default true).
- **End signal.** `nextCursor` is null on the last page and `prevCursor` is null on the first. The HTTP adapter emits `Link: <url>; rel="next", <url>; rel="prev"` for the cursors that exist. Link URLs keep the request's other query parameters.
- **Limits.** Absent or empty uses `defaultLimit`. A positive integer (number or decimal string) above `maxLimit` is clamped. Anything else is `invalid-limit`.
- **SQL.** Scope and filters become equalities (`= ANY($n)` for arrays, `IS NULL` for null). A uniform-direction sort seeks with a row comparison such as `(created_at, id) < ($2, $3)`, which PostgreSQL uses as an index condition. A mixed sort uses an OR chain plus a leading bound on the first column. All values are parameters. Identifiers must match `[a-z_][a-z0-9_]*` (optionally `table.column`) and are double-quoted, so keyword names such as `order` work. The SQL source refuses a scope missing a mapped key, a scope key without a column, and unmapped filters.
- **Timestamps.** A `timestamp` key is selected as `to_char(col AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` and bound back as `$n::timestamptz`. Drivers would round the column to a millisecond `Date`, and rows a few microseconds apart would then be skipped or reported out of order. Do not convert timestamps to epoch milliseconds or `Date.toISOString()` for sorting. In memory, give timestamp keys in the same 6-digit UTC form.
- **Concurrent writes.** Each page seeks from the last row's values, not a position, so rows inserted or deleted elsewhere neither duplicate nor skip rows. Deleting the cursor row itself is safe.

## HTTP routes

| Route | Query | Result |
| --- | --- | --- |
| `GET {prefix}{routes.list}` (default: the prefix itself) | `cursor`, `limit`, `sort`, declared filters | `200 {items, nextCursor, prevCursor, limit, sort}` with `Link` and `cache-control: private, no-store` |

Errors return `{error, message}`. `statusFor` merges over these defaults: 400 for `malformed-cursor`, `invalid-signature`, `expired-cursor`, `scope-mismatch`, `invalid-limit`, `invalid-sort` and `invalid-filter`; 401 `unauthorized`; 404 `not-found`; 405 `method-not-allowed`. `params` renames `cursor`, `limit` and `sort`. `linkHeader: false` drops the header, and `publicOrigin` sets the Link origin behind a proxy. A repeated single-value filter, a value outside `values` or a non-numeric number is `invalid-filter`. Undeclared parameters are ignored.

## Verify

`npm run build && node --test tests/keyset-pagination.test.mjs tests/keyset-pagination-sql.test.mjs` covers these cases:

- the opaque cursor and its contents
- exactly-once walks for uniform and mixed sorts at several limits (memory and PGlite)
- prev/next round trips and the end signal
- tampered, malformed, expired and unknown-key cursors
- key rotation
- scope, filter and sort binding
- limit clamping
- sort validation
- inserts and deletes between pages (memory and PGlite)
- the generated SQL and an `EXPLAIN` showing the index condition
- microsecond-exact timestamp walks, quoted keyword identifiers and code-point order (PGlite)
- the cursor length limit
- HTTP parsing, Link headers, statuses and overrides

In the receiving app, run a walk against your real table with writes between pages. Run `EXPLAIN` on the seek query to confirm it uses your index.

## If something fails

- **"returned rows out of order":** a text sort column uses a collation other than `C`. Give it `COLLATE "C"` in the index and table, or pass `checkOrder: false`.
- **"Sort value ... is a Date":** a `timestamptz` column is declared `number` or `string`. Declare it `type: "timestamp"`.
- **"Sort value ... must be a non-null":** a sort column is nullable or its `column` is wrong. Make it NOT NULL.
- **"Cursor would be ... too long":** a sort uses long text values. Sort by a shorter column.
- **Every second page fails with `scope-mismatch`:** the client did not resend the same filters with the cursor, or `scope()` returns a different object per request (for example, adding a request id).
- **Sequential scan:** create an index on the scope columns followed by the sort columns in the sort's directions (see `schema.sql`).

## Limits

- **Readable cursors.** Values are signed, not encrypted.
- **Collation.** The order check compares strings by code point, as `COLLATE "C"` does.
- **Timestamp range.** Timestamp keys need `timestamptz` columns with years 0001 to 9999.
- **Empty backward page.** A backward page that comes back empty returns no cursors; restart from the first page.
- **Testing scope.** PGlite runs as a single connection, so concurrent writes are simulated between pages rather than under multi-connection contention.

Row-level authorization, secret storage, production index tuning and consuming-application acceptance remain project responsibilities.
