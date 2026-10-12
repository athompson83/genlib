# URL slugs · 0.1.0

## What installs

Five original Apache-2.0 files under `url-slugs/`:

- `core.ts`: `createUrlSlugs` (`slugify`, `create`, `rename`, `resolve`, `current`, `history`, `remove`, `isReserved`), the standalone `slugify`, `isCanonicalSlug` and `slugScope` helpers, `SlugError`, `DEFAULT_RESERVED_SLUGS` and the `SlugStore` interface.
- `memory-store.ts`: `MemorySlugStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createSlugResolveHandler`, a server-only Fetch `Request`/`Response` adapter that answers 200 or 301. The core works without it.
- `schema.sql` and `sql-store.ts`: the `url_slugs` table and `createSqlSlugStore(executor, { table? })` (optionally schema-qualified, quoted in SQL), for any `query(text, params)` executor with `$1` placeholders plus `transaction(work)` (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database or entity table. The application keeps its own records and calls this module when an entity is created, renamed or deleted.

## When to use it

Use it for human-readable URLs of posts, pages, products, projects or profiles, where titles change and old links must keep working. For short codes that are not derived from a title, use `short-links`. If you only need a one-off slug string, the `slugify` capability or the standalone `slugify` export is enough.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlSlugStore(db)` with an executor that has `transaction`. Elsewhere, provide a unique `(scope, slug)` key, a unique current slug per `(scope, entity_id)` and an atomic rename. |
| scope | `slugScope(tenantId, collection)` from trusted server context (session, verified host). Every operation takes the scope first. |
| `reserved` | Your route names added to the defaults: `[...DEFAULT_RESERVED_SLUGS, "posts", "tags"]`. Passing a list replaces the defaults. |
| `maxLength`, `separator`, `unicode`, `fallback` | URL shape: 80 code points, `-`, ASCII and `item` by default. |
| HTTP `scopeFor(request, params)` | Returns the scope for a request, or `null` to refuse. Route params such as `:collection` are passed in. |
| HTTP `routes`, `prefix`, `statusFor`, `locationFor`, `redirectStatus` | Your URL layout, error statuses and redirect target. |

```ts
import { createUrlSlugs, slugScope, DEFAULT_RESERVED_SLUGS } from "./genlib/url-slugs/core.js";
import { createSqlSlugStore } from "./genlib/url-slugs/sql-store.js";
import { createSlugResolveHandler } from "./genlib/url-slugs/http.js";

const slugs = createUrlSlugs({ store: createSqlSlugStore(db), reserved: [...DEFAULT_RESERVED_SLUGS, "drafts"] });
const { slug } = await slugs.create(slugScope(tenant.id, "posts"), post.id, post.title);
await slugs.rename(slugScope(tenant.id, "posts"), post.id, newTitle);

export const handler = createSlugResolveHandler({
  slugs, prefix: "/blog",
  scopeFor: (request) => { const t = tenantFromSession(request); return t ? slugScope(t.id, "posts") : null; },
});
```

## Behavior

- **Slugify.** Input is NFC-composed, compatibility forms are folded (ᴭ to Æ, ℏ to ħ) and lowercased (ẞ to ß); then Latin letters U+00C0 to U+017F go through the shared Genlib table (ß to ss, Æ to ae, Ł to l, Þ to th), and other characters are NFKD-decomposed with their marks dropped (ạ to a, ﬁ to fi, fullwidth letters to ASCII). Apostrophes (`'`, `’`, `ʼ`) join words, `&` becomes `and`, and every other run of punctuation, spaces or symbols becomes one separator. With `unicode: true`, letters, digits and combining marks of other scripts are kept (NFC); a mark never stays on a Latin letter. Output is idempotent: `slugify(slugify(x)) === slugify(x)` in both modes, so every created slug resolves. The slug is cut at the last word boundary within `maxLength`; a single overlong word is hard-cut. Nothing usable left gives `fallback`.
- **Unique per scope.** `create(scope, entityId, title)` picks the first free candidate among `slug`, `slug-2`, `slug-3` ... (the base is trimmed at a word boundary so the suffixed slug still fits). It then inserts. If a concurrent writer took the candidate, the store reports `slug-taken` and the core picks again, up to `maxAttempts` (default 50). An entity has one current slug; a second `create` fails with `entity-exists`.
- **Reserved words.** Derived slugs skip reserved words (`Admin` becomes `admin-2`). With `{ exact: true }`, the text is a user-chosen slug and is never rewritten: non-canonical input (uppercase, spaces, doubled separators) fails with `invalid-slug`, reserved words with `reserved-slug` and taken slugs with `slug-taken`. Pass user input through `slugs.slugify` first if you want it normalized.
- **Rename and redirects.** `rename(scope, entityId, title)` retires the current slug and makes the new one current, in one atomic store call. Old slugs stay owned by the entity, so no one else can take them and hijack the redirect. `resolve(scope, slug)` returns `ok` for the current slug and `redirect` with the current slug for an old or differently cased one. Redirects always point at the current slug, so chains collapse (a → b → c sends a straight to c). Renaming back to an old slug reclaims it without a suffix, and the slug it replaces then redirects to it, so no loop can form.
- **Removal.** `remove(scope, entityId)` deletes all of the entity's slugs; they become free and resolve to `not-found`.
- **Errors.** `SlugError` codes: `invalid-scope`, `invalid-entity`, `invalid-slug`, `reserved-slug`, `slug-taken`, `entity-exists`, `not-found`, `conflict` (retries exhausted) and `slug-unavailable` (no suffix up to `maxSuffix`).

## HTTP routes

| Route | Result |
| --- | --- |
| `GET` or `HEAD {prefix}{routes.resolve}` (default `/:slug`) | `200 {entityId, slug}` for the current slug |
| same, old or differently cased slug | `301` (or `redirectStatus` 308) with `Location` set to the same route and the current slug, query string kept; `cache-control: private, max-age=3600` |
| unknown slug, other tenant, path outside the route | `404 {error: "not-found"}` |

Other responses: 403 `forbidden` when `scopeFor` returns nothing, 405 `method-not-allowed` with `Allow: GET, HEAD`, 400 `invalid-slug` for malformed percent-encoding. `statusFor` overrides any of these statuses, for example `{ "not-found": 410 }`. `locationFor` replaces the default redirect target. Redirects are cached for a finite time on purpose: a permanently cached 301 would loop in a browser after the entity reclaims an old slug.

## Verify

`npm run build && node --test tests/url-slugs.test.mjs tests/url-slugs-sql.test.mjs` covers:

- normalization, Unicode mode, idempotence over every BMP code point (and a sample above) in both modes, word-boundary truncation and the fallback
- first-free numeric suffixes that fit `maxLength`
- ten concurrent creates of one title getting distinct slugs (memory store and PGlite unique key with retry)
- reserved words (exact refusal, derived skipping, configurable list) and refusal of non-canonical exact slugs
- keyword and schema-qualified table names (quoted identifiers) on PGlite
- rename history, collapsed redirects, reclaiming, no loops across a rename sequence, protection of old slugs, and concurrent renames leaving one current slug
- tenant and collection scoping
- HTTP 200, 301 with `Location`, 403, 404, 405, 400, HEAD, and the `routes`, `prefix`, `statusFor`, `redirectStatus` and `locationFor` overrides

In the receiving app, run the same cases against your real store, including concurrent creates against the database.

## If something fails

- **Two entities got the same slug:** your store's insert is not guarded by a unique `(scope, slug)` key, or it does not report `slug-taken` on conflict.
- **`rename` throws about `transaction()`:** pass an executor with `transaction(work)` to `createSqlSlugStore`.
- **Redirects go to the wrong tenant's content:** `scopeFor` is reading the tenant from something the client controls.

## Limits

- **Scripts.** ASCII mode drops non-Latin scripts, so such titles get the fallback; set `unicode: true` to keep them.
- **Old slugs.** They are never released individually, only by `remove`.
- **Testing scope.** PGlite runs as a single connection, so the concurrency tests check the unique key, retry and transaction logic, not real multi-connection contention.
- **Not included.** Rewriting links in content, sitemaps and offensive-word filtering.
