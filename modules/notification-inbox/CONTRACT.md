# Notification inbox · 0.1.0

## What installs

Three original Apache-2.0 TypeScript files under `notification-inbox/`:

- `core.ts`: `createInbox` (publish, list, unread count, mark read, mark all read, archive, prune), `InboxError`, `isSafeLink` and the `InboxStore` interface, with the suggested SQL shape in its header comment.
- `memory-store.ts`: `MemoryInboxStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createInboxHandler`, a server-only Fetch `Request`/`Response` adapter for the signed-in user's own inbox.

There is no hidden database, session system, UI or push channel. The receiving application supplies those through the integration points below.

## When to use it

Use it for the in-app bell menu or activity feed of a signed-in app: "Dana mentioned you", "Invoice 42 was paid", with an unread badge, mark as read and archive. Do not use it as an email, SMS or mobile-push sender, an audit log or a chat system: those have different delivery and retention needs.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `InboxStore` | A table indexed on `(tenant_id, user_id, created_at DESC, id DESC)`, a unique partial index on `(tenant_id, user_id, dedupe_key)` so `insert` returns `false` on a duplicate, and `updateMany` as one `UPDATE` scoped by `tenant_id` and `user_id`. See the SQL comment in `core.ts`. |
| `publish(recipient, notification)` | Your own trusted server code (a domain event handler, a job). Decide who should be told and check their preferences first. It is never exposed over HTTP. |
| `authenticate(request)` | The signed-in user's id and active tenant id, from your session or verified token. Never from the request body or query. |
| `authorize(actor, action)` (optional) | An extra check, for example that the user is still a member of the tenant. Return `false` to deny. Ownership scoping is enforced either way. |
| `prune()` | A scheduled job (hourly or daily) that removes expired items and enforces `maxPerUser`. |

```ts
import { createInbox } from "./genlib/notification-inbox/core.js";
import { createInboxHandler } from "./genlib/notification-inbox/http.js";

const inbox = createInbox({ store, retentionMs: 90 * 86_400_000, maxPerUser: 500 });
// Server code, after a comment is saved:
await inbox.publish({ tenantId, userId: mentionedUserId }, {
  kind: "comment.mention", title: `${author} mentioned you`, link: `/projects/${projectId}#c${commentId}`,
  dedupeKey: `comment:${commentId}:mention`,
});
export const handler = createInboxHandler({ inbox, prefix: "/api/inbox", allowedOrigins: [APP_ORIGIN], authenticate });
```

## Behavior

- Every read and write is scoped to the actor's own `tenantId` and `userId`. Ids that belong to another user or tenant are silently ignored, so the `updated` count only reflects the actor's own items.
- `publish` validates the notification: `kind` is 1 to 64 letters, digits, `.`, `:`, `_` or `-`; `title` is 1 to 200 characters on one line (trimmed); `body` is at most 2,000 characters; `link` is a relative path (`/a/b?c#d`) or an `https` URL without credentials; `dedupeKey` is 1 to 200 characters; `data` is a JSON object of at most `maxDataBytes` (default 4,096) and is stored as a detached copy.
- A repeated `dedupeKey` for the same recipient within the retention window returns the existing item, including under concurrent publishes. After the window the key is released.
- `list` returns unarchived items newest first (`createdAt`, then `id`), 1 to 50 per page (default 20), with an opaque `nextCursor` (null on the last page) and an `unreadOnly` filter.
- `unreadCount` counts unread, unarchived items.
- `markRead(ids)` and `archive(ids)` take 1 to 100 ids and keep the first read or archive time. `markAllRead({before})` marks unread items created at or before `before` (default now), so items that arrive while the user clicks stay unread.
- Archived items leave `list` and `unreadCount`.
- `prune` deletes items older than `retentionMs` (default 90 days, 1 hour to 2 years), then the oldest beyond `maxPerUser` (default 500) per user, and reports both counts.
- Errors are `InboxError` with codes: `forbidden`, `invalid-recipient`, `invalid-kind`, `invalid-title`, `invalid-body`, `invalid-link`, `invalid-dedupe-key`, `invalid-data`, `invalid-ids`, `invalid-cursor`, `invalid-limit`, `invalid-before` and `bad-request`.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}?cursor=&limit=&unread=1` | none | `200 {items, nextCursor}` |
| `GET {prefix}/count` | none | `200 {unread}` |
| `POST {prefix}/read` | `{ids}` | `200 {updated}` |
| `POST {prefix}/read-all` | `{before?}` or empty | `200 {updated}` |
| `POST {prefix}/archive` | `{ids}` | `200 {updated}` |

Signed-out callers get 401. State-changing requests without an allowed `Origin` get 403, and `forbidden` from `authorize` is 403. Other `InboxError` codes and malformed JSON are 400. Other methods on a known route get 405 (including `POST {prefix}`: there is no publish route), and unknown paths get 404. Responses carry `cache-control: no-store`. Items in responses omit `dedupeKey`, `tenantId` and `userId`.

## Verify

`npm run build && node --test tests/notification-inbox.test.mjs` covers these cases:

- newest-first order and cursor paging, including timestamp ties
- dedupe idempotency, concurrent publishes and key release after retention
- unread counts with mark read, mark all read and archive
- cross-user and cross-tenant isolation
- unsafe links and other invalid input
- retention and `maxPerUser` pruning
- the HTTP routes, status codes, origin check, 401 and the missing publish route

In the receiving app, add the same cases against your real store, including two concurrent publishes with one `dedupeKey` and an ordinary user trying to mark another user's ids.

## If something fails

- Another user's item changed → your `updateMany` does not filter by both `tenant_id` and `user_id`; scope the `WHERE` clause, not just the id list.
- Duplicate items for one `dedupeKey` → the unique partial index is missing, or `insert` throws instead of returning `false` on that conflict.
- Paging repeats or skips items → order by `created_at DESC, id DESC` and compare the `(created_at, id)` pair, not `created_at` alone.
- Every request returns 401 → `authenticate` must return `{tenantId, userId}` for a signed-in user.

## Limits

This package does not render the bell, push real-time updates, send email, SMS or mobile push, choose recipients or apply user preferences (see the `notification-preferences` module). Render titles and bodies as text, never HTML. Add rate limits to the routes (see the `rate-limit` module) and bound publish volume in your own code. Production database correctness, session security and consuming-application acceptance remain project responsibilities.
