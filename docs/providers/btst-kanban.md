# Provider plan: BTST Kanban (profile written, not yet run end to end)

> Status: the profile is in `resources/providers/btst-kanban.json` (`genlib provider check btst-kanban --target app` checks the prerequisites below; see [providers.md](../providers.md)). This page is the research and plan for the first "upstream dependency + Genlib integration package" provider (phase 3 of the [integration blueprint](../landscape.md#integration-blueprint-one-adoption-process-over-many-providers)). Nothing below has been installed, scaffolded, migrated or built against an app; the "Not verified" list at the end is explicit. Facts were read on 2026-10-11 from the npm registry and the repository at tag v4.5.1.

## End-to-end run (2026-10-11)

A fixture app was built with create-next-app 16.4.0 (next 16.4.0, React 19.3.0, Tailwind 4.3.3) and shadcn 4.19.1, then taken through the profile:

| Step | Result |
| --- | --- |
| `provider check` | Ready after `shadcn init` (before it: `FAIL shadcn-css-variables`) |
| Install | The original command failed (`ERESOLVE`: npm picked zod 3 for the auto-installed peers, against better-call's zod 4 peer). Listing every required peer exactly resolves without `--legacy-peer-deps`; the profile now does this |
| Scaffold in scratch copy | 13 files; it patched `app/globals.css` (one `@import`) and generated a pages layout instead of editing the root layout |
| `provider plan` / `adopt` | 13 create, 1 merge (`app/globals.css`), 0 conflicts; adopt wrote the files, the lock and a receipt |
| Build | Failed until `cacheComponents` and `partialPrefetching` were set to false in `next.config.ts` (create-next-app 16.4 enables them); the profile now checks this. Also fails closed without `BTST_SITE_URL`, as designed |
| Memory adapter | Pages return 200 and render server-side; 18 of 18 API checks pass (boards, columns, tasks at every priority, moves, reorders, two concurrent moves, cascading delete) |
| Server authorization (`kanbanPermissions`, evaluation-only header identity) | 401 on all 14 operations anonymously; 403 on all 12 record operations for another user; client-supplied `ownerId` ignored. Collection reads carry no owner facts |
| Kysely on file-backed PGlite, `transaction: true` | Migration created the three tables (via `@electric-sql/pglite-socket`, because the CLI needs a live PostgreSQL URL). Reads returned `columns: []`: `@btst/adapter-kysely@3.0.0` looks up `schema["kanbanColumn"]` where the key is `column`. A one-line local patch fixed it, and data then survived a restart; the stock package does not pass. `transaction: false` is refused with `ATOMIC_TRANSACTION_REQUIRED` and writes nothing. A duplicate board name returns HTTP 500 |
| `genlib adopted` | Exposed two Genlib bugs, now fixed: provider route files never counted as used, and `--accepts` refused provider artifacts |

Status stays `planned`: the persistent path needs an unpatched adapter release (or a tested Prisma path) before the profile can claim acceptance.

## Why Genlib wraps BTST instead of running its CLI

BTST (`better-stack-ai/better-stack`, MIT) ships complete feature plugins, but its scaffolder conflicts with Genlib's installer rules: `init --yes` overwrites existing files, without `--skip-install` it runs the package manager, its prerequisite check only warns and never checks React, Next or Tailwind versions, and server authorization is opt-in (omitted means permissive). The provider profile therefore checks prerequisites, scaffolds in a scratch copy, applies only a conflict-free diff with receipts, requires server authorization, and accepts the result against named behaviors.

## 1. Repository, license, activity

| Fact | Value | Source |
| --- | --- | --- |
| Canonical repo | `better-stack-ai/better-stack` (npm `repository` of `@btst/stack` and `@btst/codegen`) | https://registry.npmjs.org/@btst%2fstack |
| Product name | "BTST" (README title); site https://www.better-stack.ai | README.md |
| License | MIT (SPDX `MIT`), "Copyright (c) 2025 - present, olliethedev" | https://github.com/better-stack-ai/better-stack/blob/main/LICENSE.md (raw fetched) |
| Latest tag | `v4.5.1` -> commit `f38a969374f221995acac2382b5462529e583c2b`, committed 2026-10-02T13:58:45-04:00 | `git ls-remote --tags` |
| Default branch head | `53cced7…` 2026-10-02 (merge of PR #288) | clone |
| Activity | 348 commits visible in a depth-50 clone back to 2026-03-23 (lower bound); tags v3.1.0-rc.1 (09-16) … v4.0.0 (09-29) … v4.5.1 (10-02); 88 npm versions of `@btst/stack` since 1.0.0 (2025-10-13) | clone, npm `time` |
| Database layer repo | `better-stack-ai/better-auth` (fork of Better Auth), `packages/btst/*`; MIT (Better Auth's LICENSE.md, "Bereket Engida") | https://raw.githubusercontent.com/better-stack-ai/better-auth/main/LICENSE.md |

Risk: very fast release cadence (v4.0.0 -> v4.5.1 in 3 days; v3 -> v4 major two weeks after 3.0.0). Every plugin is
marked `"releaseStatus": "Preview"` in `packages/cli/plugin-decisions.json`. Pin exact versions.

## 2. npm packages (dist-tags read 2026-10-11)

| Package | latest | Repo dir | Notes |
| --- | --- | --- | --- |
| `@btst/stack` | 4.5.1 (next: 3.1.0-rc.1) | better-stack `packages/stack` | runtime + all plugins via subpath exports; deps `@btst/db@3.0.0`, `@milkdown/kit`, `@milkdown/crepe`, `slug`, `remend` |
| `@btst/codegen` | 4.5.1 | better-stack `packages/cli` | bin `btst`; commands `init`, `generate`, `migrate` (last two delegate to `npx @btst/cli@3.0.0`) |
| `@btst/cli` | 3.0.0 | better-auth `packages/btst/cli` | bin `btst`/`cli`; peers `better-auth@1.7.6`, `@better-auth/core@1.7.6`, `@better-auth/utils@0.4.2` |
| `@btst/db` | 3.0.0 | better-auth `packages/btst/db` | same exact better-auth peers |
| `@btst/adapter-memory` | 3.0.0 | better-auth | peers: better-auth cohort |
| `@btst/adapter-prisma` | 3.0.0 | better-auth | peers `prisma`/`@prisma/client` `^5 || ^6 || ^7` + cohort |
| `@btst/adapter-drizzle` | 3.0.0 | better-auth | peers `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0` + cohort |
| `@btst/adapter-kysely` | 3.0.0 | better-auth | peers `kysely ^0.28.17 || ^0.29.0` + cohort |
| `@btst/adapter-mongodb` | 3.0.0 | better-auth | |
| `@btst/plugins` | 3.0.0 | better-auth | |
| `@btst/yar` | 1.3.2 | better-stack-ai/yar | router; peer react ^18 || ^19 |
| `@btst/better-auth-ui` | 3.0.1 | | companion only |
| `@btst/todo-plugin` | 0.0.3 (2025-12-06) | | stale example, ignore |

`@btst/stack@4.5.1` peerDependencies (all required except `next`, `react-router`, `@tanstack/react-router`,
`@vercel/blob`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, which are optional):
`react >=19.2.6`, `react-dom >=19.2.6`, `tailwindcss >=4.3.2`, `next >=15.0.0`, `react-router >=7.0.0`,
`@tanstack/react-router >=1.0.0`, `@tanstack/react-query ^5.0.0`, `zod >=4.2.0`, `better-call 1.4.0` (exact),
`@btst/yar >=1.3.2`, `ai >=5.0.0`, `@ai-sdk/react >=2.0.0`, `katex`, `rehype-katex`, `remark-math`, `rehype-raw`,
`rehype-highlight`, `highlight.js`, `remark-gfm`, `react-markdown`, `react-hook-form >=7.55.0`,
`@hookform/resolvers >=5.0.0`, `lucide-react`, `cmdk`, `sonner`, `date-fns`, `clsx`, `tailwind-merge`,
`class-variance-authority`, `@radix-ui/react-{slot,label,dialog,switch}`, `react-error-boundary`,
`@tailwindcss/typography`. So even a Kanban-only install carries the AI/markdown peer set.

Verified cohort (docs/content/docs/breaking-changes.mdx, "v3 -> v4"):
`@btst/stack`/`@btst/codegen` 4.5.1; `@btst/db`, `@btst/adapter-*`, `@btst/cli` 3.0.0; `better-auth` and
`@better-auth/core` 1.7.6; `@better-auth/utils` 0.4.2; `@better-fetch/fetch` 1.3.2; `better-call` 1.4.0; React/DOM
>=19.2.6; Tailwind >=4.3.2; `@tanstack/react-query` and `@tanstack/query-core` **5.102.0** ("Query Core 5.104.0
changes hydration behavior"). npm latest today: react-query 5.104.1, better-auth 1.7.7 -> an unpinned install picks
versions outside the cohort.

## 3. Feature plugins (all in `@btst/stack@4.5.1`; from README table and plugin-decisions.json)

Entry points follow one pattern: server `@btst/stack/plugins/<p>/api` (`<p>BackendPlugin`), client
`@btst/stack/plugins/<p>/client` (`<p>ClientPlugin`), CSS `@btst/stack/plugins/<p>/css`, plus `/permissions`,
`/client/hooks`, `/client/components`, `/query-keys` where present. Schema in `packages/stack/src/plugins/<p>/db.ts`.

| Plugin key | Topology | Provides | External services | Adopter supplies |
| --- | --- | --- | --- | --- |
| blog | Full-stack | tables `post`, `tag`, `postTag`; API `/posts` CRUD, `/posts/next-previous`, `/tags`; pages `/blog`, `/blog/drafts`, `/blog/new`, `/blog/:slug`, `/blog/:slug/edit`, `/blog/tag/:tagSlug`; metadata + sitemap | none | adapter; image upload fn; authz policy |
| kanban | Full-stack | tables `kanbanBoard`, `kanbanColumn`, `kanbanTask` (cascade FKs); API boards CRUD, columns CRUD + `/columns/reorder`, tasks CRUD + `/tasks/move`, `/tasks/reorder`; pages `/kanban`, `/kanban/new`, `/kanban/:boardId`; priorities LOW/MEDIUM/HIGH/URGENT; default columns To Do/In Progress/Done | none | **isolating adapter** (`transaction: true`) for persistent writes; `resolveUser`/`searchUsers`; authz |
| comments | Full-stack | threads, replies, reactions, moderation | none | adapter; host resource type/id; authz; user resolver |
| cms | Full-stack | content types/items, generated forms | none | Zod content types; adapter; upload fn |
| form-builder | Full-stack | form authoring, submissions | none | isolating Prisma/Drizzle/Kysely (memory/Mongo rejected by codegen) |
| media | Full-stack | uploads, folders, picker | optional S3 / Vercel Blob | isolating adapter + storage adapter (Mongo rejected) |
| ai-chat | Full-stack | streaming chat, history | AI model provider (credentials, billing) | isolating adapter; model |
| ui-builder | Client-only, requires CMS | page builder | | |
| open-api | Backend-only | OpenAPI doc + reference (Scalar from jsDelivr) | jsDelivr | |
| route-docs | Client-only | route reference UI | | |
| better-auth-ui | Companion | auth pages | existing Better Auth server | |

## 4. Frameworks and adapters

Maintained/tested (README, installation.mdx): **Next.js 15+ App Router**, **React Router v7**, **TanStack Start**.
"Remix is not a separate v3 support claim." Entry modules: `@btst/stack/next` (+`/next/server`),
`@btst/stack/react-router`, `@btst/stack/tanstack` (+`/tanstack/server`). Repo devDeps use next 16.0.10, react ^19.2.7.

Adapters: Prisma (PostgreSQL, MySQL, SQLite, CockroachDB, MongoDB), Drizzle (pg, mysql, sqlite), Kysely,
MongoDB, Memory (single-process, tests only). Codegen install specs (`packages/cli/src/utils/constants.ts`):
`@btst/adapter-<x>@3.0.0`; Prisma adds `@prisma/adapter-pg` and `pg`; Drizzle adds `drizzle-orm@0.45.2`.
`transaction: true` is required for AI Chat, Form Builder, Kanban, Media; without it, owner-sensitive/persistent ops
fail closed with `ATOMIC_TRANSACTION_REQUIRED` (databases/adapters.mdx).

Generated adapter code (scaffold-plan.ts): Prisma is fully wired (`PrismaPg` + `generated/prisma/client`,
`BTST_PRISMA_PROVIDER`); **Drizzle and Kysely are stubs** (`const drizzleDb = {} as never` / `const kyselyDb = {}
as never` with TODO) that the app must replace. Doc inconsistency: installation.mdx's Drizzle example omits the
trailing `({})` that adapters.mdx and the generator use.

## 5. Documented setup (generated path, Blog quickstart; Kanban identical except plugin key)

Prerequisites (installation.mdx "Quickstart prerequisites"): Node.js 22; existing Next.js App Router app;
React/DOM >=19.2.6; shadcn/ui initialized with CSS variables and Tailwind >=4.3.2; clean commit; shadcn `button`,
`dropdown-menu`, `sonner` with `<Toaster />` in root layout. README pins `shadcn@4.19.1 init --base radix --preset nova --css-variables`.

Commands:
```bash
npx @btst/codegen@4.5.1 init --framework nextjs --adapter memory --plugins blog   # or kanban
# .env.local
BTST_SITE_URL=http://localhost:3000
BTST_API_URL=http://localhost:3000
npm run dev   # success = http://localhost:3000/pages/blog renders (may be empty)
BTST_SITE_URL=... BTST_API_URL=... npm run build   # production build fails closed without trusted origins
```

Files written/patched for Next.js (`getFrameworkPaths`, `src/` prefix if CSS is under `src/`):
`lib/stack.ts`, `lib/stack-client.tsx`, `lib/stack-client.server.ts`, `lib/query-client.ts`,
`app/api/data/[[...all]]/route.ts`, `app/(request)/pages/[[...all]]/page.tsx`, `app/(request)/pages/layout.tsx`,
`app/(static)/pages/layout.tsx`, `app/pages/client-layout.tsx`, `components/navbar.tsx`, `components/mode-toggle.tsx`
(path per alias), `app/sitemap.ts` (blog/cms/kanban), SSG pages (`app/(static)/pages/ssg-kanban/page.tsx` is a
redirect for Kanban), `next.config.ts` only for ai-chat/media; patches global CSS (plugin `@import`) and root layout
(or prints manual instructions). React Router: `app/lib/*`, `app/routes/api/data/$.ts`, `app/routes/pages/$.tsx`,
`app/routes/pages/_layout.tsx`. TanStack: `src/lib/*` (+`stack-client.origins.ts`), `src/routes/api/data/$.ts`,
`src/routes/pages/$.tsx`, `src/routes/pages/route.tsx`, `src/routes/sitemap[.]xml.ts`.

Installs (unless `--skip-install`): `@btst/stack@4.5.1 @btst/yar@1.3.2 @tanstack/react-query@5.102.0
@tanstack/query-core@5.102.0 next-themes@0.4.6` + adapter spec + plugin extras.

Kanban-generated overrides (scaffold-plan.ts): `uploadImage` throws a TODO error, `resolveUser: async () => null`,
`searchUsers: async () => []`.

**Safety findings for Genlib:** `init --yes` selects conflict policy `"overwrite"` (`pickConflictPolicy`) and,
without `--plugins`, a default plugin set; without `--skip-install` it runs the package manager. Codegen's
`validate-prerequisites.ts` only warns (missing components.json, no Tailwind v4 import); it does **not** check React,
Next or Tailwind versions. Upstream's own fixture test uses `--legacy-peer-deps` for the first install, then installs
all `@btst/stack` peers with strict resolution.

Authorization is opt-in (auth.mdx): "Omitting server authorization preserves permissive v2 behavior"; once
`serverAuth` is configured, protected operations deny missing rules and anonymous/denied requests fail closed
(401 anonymous, 403 authenticated).

## 6. Schema / migration CLI

`@btst/codegen generate|migrate` delegate to `npx @btst/cli@3.0.0` (constant `BETTER_DB_CLI_SPEC`), so the app does
not get a second `btst` binary. Exact invocations (cli.mdx):
```bash
npx @btst/cli@3.0.0 generate --config=lib/stack.ts --orm=prisma  --output=schema.prisma
npx @btst/cli@3.0.0 generate --config=lib/stack.ts --orm=drizzle --output=src/db/schema.ts
npx @btst/cli@3.0.0 generate --config=lib/stack.ts --orm=kysely  --output=migrations/schema.sql --database-url=postgres://...
npx @btst/cli@3.0.0 migrate  --config=lib/stack.ts --database-url=postgres://...            # Kysely only; applies directly
npx @btst/cli@3.0.0 migrate  --config=lib/stack.ts --output=migrations.sql --database-url=... # SQL to file
npx @btst/codegen@4.5.1 generate --orm=prisma --config=lib/stack.ts --output=schema.prisma     # passthrough form
```
Prisma/Drizzle: use their own migration tools after `generate`. The CLI executes the config file (tsconfig aliases,
Next env files loaded, `server-only` import ignored); `better-auth` and the ORM must be installed in the app.
Plugin pages still show the older unpinned form `npx @btst/cli generate --orm prisma ...`.

## 7. Acceptance references in the repo (at v4.5.1)

- `e2e/tests/smoke.kanban.spec.ts` (Playwright, against generated apps for nextjs/tanstack/react-router via
  `e2e/playwright.codegen.config.ts`): boards list page renders; create board and navigate to board page; create task
  in column; edit task; edit task into another column; delete task; add column to board; delete board; new board page
  renders; create board from new board page; board page with tasks shows priority badges; task with assignee displays
  avatar. All assert no console errors; API via `POST /api/data/boards`, `/api/data/tasks`.
- `e2e/tests/smoke.blog.spec.ts`: 20 tests incl. posts/drafts/new/edit pages, search, tags, sitemap.xml, delete.
- `packages/stack/src/plugins/kanban/__tests__/authorization.test.ts` (vitest): incl. "rejects board creation without
  atomic transactions before hooks or writes", "fails closed across every anonymous HTTP operation", "ignores
  client-supplied ownership on board create and update", "serializes competing moves, preserves ordering, and runs only
  the winning hook", "rolls back move claims when a post-authorization domain hook rejects", "deleting the owned board
  also removes columns and tasks from the memory adapter", "preserves omitted-auth compatibility…".
- `.../kanban/__tests__/getters.test.ts`, `identity-partition.test.tsx`, `client-runtime*.test.ts(x)`.
- `packages/cli/scripts/test-init.sh`: create-next-app fixture, shadcn 4.0.5 init, codegen init (memory, all plugins
  but form-builder), rejection of form-builder+memory with unchanged tree hash, idempotent rerun, `npm run build`.
- Shadcn ejection block: `packages/stack/registry/btst-kanban.json` (registry:block, 34 files, deps `@dnd-kit/*`,
  `@radix-ui/react-popover`, …; registryDependency on
  `raw.githubusercontent.com/olliethedev/shadcn-minimal-tiptap/refs/heads/feat/image-upload-config/...` — a mutable
  branch). Docs point at `.../blob/main/...`; pin to `v4.5.1` raw URL if used with `genlib registry`.
- Upstream agent skill `.agents/skills/btst-integration` (docs install it with unpinned `npx skills@latest`).

## 8. Recommendation: Kanban first

Kanban over Blog because it has the most complete server+DB+UI path with no hosted service: three related,
prefix-named tables (no collision with an app's `post`/`tag`), 13 HTTP operations including move/reorder,
mandatory isolated transactions with named concurrency tests, fail-closed authorization tests and 12 e2e behaviors.
Blog is the best-documented quickstart and needs no transaction, but its generic table names, editor image-upload
TODO and lighter server semantics make it a weaker acceptance target. AI Chat (model provider) and Media (storage)
need external services; Form Builder is comparable but less covered by e2e.

### Draft feature contract `kanban-board` (requirements)

1. `boards` — Create, list, view, rename and delete boards; a new board gets To Do, In Progress and Done columns.
2. `columns-tasks` — Add, edit, delete and reorder columns; create, edit and delete tasks with priority
   (LOW/MEDIUM/HIGH/URGENT) and optional assignee.
3. `move-ordering` — Moving a task between columns or reordering keeps a stable order; competing moves serialize and
   only the winner's hooks run.
4. `atomic-writes` — Persistent writes run in isolated transactions; without them the operation fails closed
   (`ATOMIC_TRANSACTION_REQUIRED`) before hooks or writes; deleting a board removes its columns and tasks.
5. `authorization` — With server authorization configured, anonymous calls get 401 and denied calls 403 on every
   operation, and client-supplied ownership is ignored. (Omitting auth is permissive; the profile must require it
   outside local evaluation.)
6. `persistence` — `kanbanBoard`, `kanbanColumn`, `kanbanTask` are generated from `dbSchema`, migrated, and data
   survives a server restart (memory adapter does not count).
7. `routes-ui` — `/pages/kanban`, `/pages/kanban/new`, `/pages/kanban/:boardId` render server-side with no console
   errors, and assignees resolve through app-provided `resolveUser`/`searchUsers`.

### Draft adoption steps (Next.js App Router, PostgreSQL via Kysely; unverified end to end)

Kysely is suggested because it is the only adapter whose schema step is one BTST command (`migrate` applies directly);
Prisma is the alternative that codegen wires completely. Not run by me.

0. Preconditions checked by Genlib (below). Clean git tree. Work in a scratch copy/worktree first.
1. Install pinned cohort (explicit, shown to user; no automatic install):
   ```bash
   npm install --save-exact @btst/stack@4.5.1 @btst/yar@1.3.2 @btst/adapter-kysely@3.0.0 \
     @tanstack/react-query@5.102.0 @tanstack/query-core@5.102.0 next-themes@0.4.6 \
     better-auth@1.7.6 @better-auth/core@1.7.6 @better-auth/utils@0.4.2 @better-fetch/fetch@1.3.2 better-call@1.4.0 \
     kysely@0.29.6 pg
   # plus the remaining required @btst/stack peers (zod, ai, @ai-sdk/react, katex, react-markdown, ... see section 2)
   ```
   (exact `pg` version and whether npm resolves the full peer set without `--legacy-peer-deps`: **not verified**.)
2. Scaffold without overwriting: run `npx @btst/codegen@4.5.1 init --framework nextjs --adapter kysely --plugins kanban
   --skip-install --yes` **in the scratch copy**, diff against the app, refuse if any pre-existing file other than the
   global CSS and root layout would be replaced (`--yes` = overwrite), then apply the diff with receipts.
3. Edit `lib/stack.ts`: replace `const kyselyDb = {} as never` with
   `new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) })`;
   confirm the generated line is `createKyselyAdapter(kyselyDb, db, { transaction: true })({})`; add `auth`/`serverAuth`
   using `kanbanPermissions` from `@btst/stack/plugins/kanban/permissions` (auth.mdx pattern).
4. Edit `app/pages/client-layout.tsx` overrides: real `resolveUser`/`searchUsers`; implement or disable `uploadImage`.
5. `.env.local`: `BTST_SITE_URL`, `BTST_API_URL`, `DATABASE_URL`.
6. Migrate: `npx @btst/codegen@4.5.1 migrate --config=lib/stack.ts --database-url="$DATABASE_URL"`
   (= `npx @btst/cli@3.0.0 migrate ...`). Optionally `--output=migrations/btst-kanban.sql` first to review SQL.
7. Verify: `npx tsc --noEmit`; `BTST_SITE_URL=… BTST_API_URL=… npm run build`; start, then HTTP checks
   (`POST /api/data/boards` anonymous -> 401 with auth on; authorized create -> 3 default columns; move/reorder;
   restart and re-read) and the page routes; adapt `smoke.kanban.spec.ts` tests as the named acceptance behaviors;
   record with `genlib adopted <id> --target app --accepts ...`.

### What Genlib must check before adoption

- Framework: `next` >=15 with an `app/` router (or React Router 7 / TanStack Start for later profiles); refuse Pages
  Router-only apps and Remix.
- `react` and `react-dom` >=19.2.6 (same version); `tailwindcss` >=4.3.2 with a v4 `@import "tailwindcss"`; Node 22.
- shadcn `components.json` with `cssVariables: true`; `sonner` component and `<Toaster />`; `button`, `dropdown-menu`.
- `@tanstack/react-query`/`query-core` at 5.102.0 (refuse or warn at 5.104.x); a single `QueryClientProvider`.
- ORM/adapter: Kysely `^0.28.17 || ^0.29.0`, or Drizzle `^0.45.2`, or Prisma 5-7; persistent adapter must support
  `transaction: true`; memory only for evaluation; Mongo not in this profile.
- `better-auth`/`@better-auth/core` exactly 1.7.6 (adapter/CLI peers) — conflict if the app already uses another
  Better Auth version (latest is 1.7.7).
- Path conflicts: existing `app/api/data/**`, `app/pages/**`, `app/(request)/pages/**`, `app/(static)/pages/**`,
  `app/sitemap.ts`, `lib/stack*.ts`, `lib/query-client.ts`, `components/navbar.tsx`, `components/mode-toggle.tsx`;
  existing DB tables `kanbanBoard`/`kanbanColumn`/`kanbanTask`.
- Server authorization present before anything beyond local evaluation.

## Not verified

- GitHub stars/forks/issues/Release objects (API blocked); only tags/commits verified.
- Any install, scaffold, migration, build or test run — nothing was executed against an app.
- Whether `npm install` resolves the full peer set without `--legacy-peer-deps`.
- Whether `@btst/adapter-kysely` `transaction: true` behaves correctly on SQLite or PGlite (only PostgreSQL is shown in docs);
  whether a PGlite-backed Kysely/Drizzle instance works with BTST adapters.
- Kanban `uploadImage` scope (generated as TODO; presumably task-description editor images).
- Rendered docs site content beyond the repo's MDX source.
