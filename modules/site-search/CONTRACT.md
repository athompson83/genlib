# Site search with filters · 0.1.0

## What installs

Five original Apache-2.0 files under `site-search/`:

- `core.ts`: `createSearch` (index, remove, query), `SearchError`, the query parser `parseQuery`, the tokenizer (`tokenize`, `foldText`), `renderHighlight` and the `SearchStore` interface.
- `memory-store.ts`: `MemorySearchStore`, a per-tenant inverted index with BM25 ranking and the Porter-lite `stem`, for tests, prototypes and small single-process datasets.
- `http.ts`: `createSearchHandler`, a server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: the PostgreSQL table `search_documents` (GIN indexes on `tsv` and `attrs`) and `createSqlSearchStore(executor, { config, table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database, crawler or user system. The application indexes its own records and supplies persistence and authorization through the integration points below.

## When to use it

Use it for a search box over an app's own records (products, articles, help pages, tickets) with filters, facet counts, highlights and type-ahead, scoped per tenant. Do not use it for web crawling, typo-tolerant or semantic (vector) search, multi-language stemming or millions of documents per tenant on the in-memory store. A dedicated engine (Meilisearch, Typesense, OpenSearch) fits those better.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `SearchStore` | On PostgreSQL: apply `schema.sql` and call `createSqlSearchStore(db, { config: "english" })` (`"simple"` disables stemming and stop words). Elsewhere: `MemorySearchStore` or your own `upsert`, `remove`, `search`. |
| `fields` | Weighted text fields, for example `{ title: "A", body: "C" }` (A 1.0, B 0.4, C 0.2, D 0.1). Keep the order stable. |
| `filters` | Declared attributes: `keyword` (exact, multi-value), `number` and `date` (ranges, sortable), `boolean`. |
| `authorize(actor, action, tenantId)` | Your membership check for `search` and `index` (index and remove). Return `false` to deny, `true` to allow, or for `search` the actor's principals (groups, roles, `user:<id>`) matched against document `visibility`. |
| `authenticate(request)` | The signed-in user from your session or verified token. Never from the request body. |

Optional: `now`, `maxDocumentLength` (100,000 characters), `facetLimit` (20).

```ts
import { createSearch } from "./genlib/site-search/core.js";
import { createSqlSearchStore } from "./genlib/site-search/sql-store.js";
import { createSearchHandler } from "./genlib/site-search/http.js";

const search = createSearch({
  store: createSqlSearchStore(pool, { config: "english" }),
  authorize, // (actor, action, tenantId) => false | true | ["staff", "user:42"]
  fields: { title: "A", body: "C" },
  filters: { category: "keyword", price: "number", publishedAt: "date", inStock: "boolean" },
});

// In your product save path:
await search.index(actor, { tenantId, id: product.id, fields: { title: product.name, body: product.description },
  attrs: { category: product.tags, price: product.price, inStock: product.stock > 0 } });

export const handler = createSearchHandler({ search, prefix: "/api/search", allowedOrigins: [APP_ORIGIN], authenticate });
```

## Behavior

- **Query syntax.** Words are ANDed. `"quoted phrases"` match the words in order. `-word` and `-"a phrase"` exclude. `prefix*` on the last word matches word starts, for type-ahead. A word that folds into several tokens (`e-mail`) is a phrase. Everything else, including `& | ! : ( ) '` and SQL, is ordinary text. Queries hold at most 256 characters and 16 terms (`invalid-query`). Text with no searchable token returns no hits. An empty `q` lists every visible document that passes the filters. Exclusions alone filter.
- **Tokenizer.** A token is a run of letters, digits and combining marks starting with a letter or digit. It is folded: Unicode NFKD, combining marks removed (crème becomes creme), lowercased. The in-memory store then stems with Porter-lite. Plural `-ies` becomes `-y`, `-sses` becomes `-ss`, `-es` is dropped after s, x, z, ch or sh, and a final `-s` is dropped except after ss, us or is. Then `-eed` becomes `-ee`, and `-ing` and `-ed` are dropped when a vowel remains. A doubled final consonant is undoubled (running becomes run), or a final e is restored on short words (making becomes make). Words of three letters or fewer stay unchanged, and there are no stop words. PostgreSQL stems with its configuration (Snowball for `english`) on the same folded text.
- **Ranking.** The in-memory store uses BM25 (k1 1.2, b 0.75, idf `ln(1 + (N − n + 0.5)/(n + 0.5))`) with field-weighted term frequency and length. A phrase scores as the sum of its words, and a prefix scores as its best matching word. PostgreSQL uses `ts_rank_cd` with the same weights. Ties order by id.
- **Filters.** `keyword` takes a string or a list (any of); `number` and `date` take `{gte, gt, lte, lt}` (dates as ISO strings or epoch ms); `boolean` takes true or false. Undeclared filters fail with `invalid-filter`, undeclared attributes on `index` with `invalid-attr` and undeclared fields with `invalid-field`. Keyword attributes are stored as string lists, dates as epoch milliseconds.
- **Facets.** `facets: ["category", "inStock"]` returns `{ value, count }` per keyword or boolean value over the whole filtered set (including that facet's own filter), by count then value, up to `facetLimit`. Other attributes fail with `invalid-facet`.
- **Sorting and paging.** `sort` is `relevance` (default), a number or date attribute (ascending) or `-attr` (descending). Documents missing the attribute come last. `limit` is 1 to 50 (default 20). `cursor` is an opaque keyset position on (score or value, id). A cursor from another sort order fails with `invalid-cursor`.
- **Highlights.** Each hit has `highlights` per matching field: a fragment (about 200 characters in memory, `MaxWords=30` in PostgreSQL) with each match wrapped in `pre`/`post` markers (default `<mark>`/`</mark>`). The text is HTML-escaped unless `highlight.raw` is true. Control characters are removed from field text on index. PostgreSQL fragments show the accent-folded text.
- **Isolation.** Every call checks `authorize` for its tenant first, and stores filter by `tenantId`. A document with a `visibility` list is returned only when the reader's principals share a member. An empty list means every reader in the tenant. Facets and totals count only visible documents.
- **Writes.** `index` upserts (tenantId, id) and returns `{ id, updatedAt }`. The SQL upsert is one statement that ignores a write older than the stored `updated_at`. `remove` fails with `not-found` for an unknown id.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}?tenantId&q&f.<attr>=..&sort&cursor&limit&facets=a,b` | none | `200 {hits, facets, total, cursor}` |
| `PUT {prefix}/{id}` | `{tenantId, fields, attrs?, visibility?}` | `200 {id, updatedAt}` |
| `DELETE {prefix}/{id}?tenantId` | none | `200 {removed: true}` |

Filter parameters: `f.color=red&f.color=blue` (any of), `f.inStock=true`, `f.price=10..100`, `f.price=10..`, `f.publishedAt=..2026-06-30` (inclusive), or one value for an exact match.

Error codes map to HTTP statuses:

| Code | Status |
| --- | --- |
| `forbidden` | 403 |
| `not-found` | 404 |
| `invalid-*`, `bad-request`, malformed JSON | 400 |

Signed-out callers get 401. PUT and DELETE without an allowed `Origin` get 403. Bodies over `maxRequestBytes` (256 KiB) get 400. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/site-search.test.mjs tests/site-search-sql.test.mjs` covers these cases on both stores:

- the tokenizer, stemmer and query parser
- AND, phrase, exclusion and prefix
- accent folding and stemming
- field weights changing the order
- BM25 scores on a known corpus (in memory)
- keyword, range, date and boolean filters, and undeclared-filter rejection
- facet counts
- cursor paging without duplicates, including tied scores and missing sort values
- tenant isolation and visibility
- highlight escaping and raw markers
- injection-shaped queries and filter values
- the HTTP routes

`tests/site-search-sql.test.mjs` runs on PostgreSQL semantics through PGlite. It also checks the schema and its indexes, the escaped tsquery text, and that 20 concurrent upserts of one document leave one row holding the newest write.

In the receiving app, add the same cases against your real store, plus an authorization test for an ordinary member, a restricted document and an outside user.

## If something fails

- `could not determine data type of parameter` → a custom store binds a parameter it never uses; bind values only where the SQL references them.
- Accented words do not match on PostgreSQL → documents were written without the store (raw SQL). Index through `createSqlSearchStore` so text is folded first, or re-index.
- Results leak between tenants or groups → your `authorize` ignores `tenantId` or returns too many principals; return only the reader's own groups.
- `invalid-cursor` after changing sort → cursors belong to one sort order; restart from the first page.
- A prefix misses inflected words on PostgreSQL → the english configuration stems the prefix; use `config: "simple"` for type-ahead-heavy fields or require longer prefixes.

## Limits

This package does not crawl, correct typos, expand synonyms, detect languages, do vector search, count numeric facet buckets or rate-limit requests. Add rate limits to the search route (see the `rate-limit` module). Scores differ between the in-memory and PostgreSQL stores. The SQL store is tested on PGlite (one connection), not on every hosted Postgres under parallel load. Production database correctness, session security and consuming-application acceptance remain project responsibilities.
