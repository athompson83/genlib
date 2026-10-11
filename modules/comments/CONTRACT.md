# Threaded comments · 0.1.0

## What installs

Five original Apache-2.0 files under `comments/`:

- `core.ts`: `createComments` (post, edit, remove, list, listReplies, react, flag, moderate), `CommentError`, `extractMentions`, `DEFAULT_REACTIONS` and the `CommentStore` interface.
- `memory-store.ts`: `MemoryCommentStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createCommentHandler`, a server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: three PostgreSQL tables (`comments`, `comment_reactions`, `comment_flags`) and `createSqlCommentStore(executor, { tables? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no hidden database, user system or notification service. The receiving application supplies those through three integration points.

## When to use it

Use it when users of a multi-tenant app discuss a record (a task, document, invoice, ticket or design) in threads, with replies, mentions, reactions and community flagging. Do not use it for realtime chat (no delivery or presence), public anonymous comments (every call needs a signed-in actor), or reviews with ratings.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `CommentStore` | On PostgreSQL: apply `schema.sql` and call `createSqlCommentStore(db)`. Elsewhere: implement the interface with primary keys on `(comment_id, user_id, emoji)` and `(comment_id, user_id)` and an atomic flag counter. |
| `authorize(actor, action, {tenantId, resourceType, resourceId})` | Your membership and resource-access check for `read`, `post` (also edit own, delete own, react) and `moderate`. Return `false` to deny. |
| `authenticate(request)` | The signed-in user from your session or verified token. Never from the request body. |

Optional: `editWindowMs` (15 minutes), `maxDepth` (3), `maxBodyLength` (10,000), `flagThreshold` (3), `previewReplies` (3), `reactions` (👍 ❤️ 🎉 😄 😕 👀) and `sanitize` for apps that store rich text.

```ts
import { createComments } from "./genlib/comments/core.js";
import { createSqlCommentStore } from "./genlib/comments/sql-store.js";
import { createCommentHandler } from "./genlib/comments/http.js";

const comments = createComments({ store: createSqlCommentStore(pool), authorize });
export const handler = createCommentHandler({
  comments, prefix: "/api/comments", allowedOrigins: [APP_ORIGIN], authenticate,
});
```

## Behavior

- A top-level comment has depth 0; a reply has its parent's depth + 1, at most `maxDepth`. The parent must be on the same tenant and resource and not deleted; otherwise `invalid-parent`, with the same code for unknown and other-tenant ids.
- Bodies are trimmed plain text of 1 to `maxBodyLength` characters. `sanitize`, when given, transforms the trimmed body before storage. The module never renders HTML; render bodies as text.
- `@handles` matching `@[\w.-]{1,64}` become `mentions` (deduplicated case-insensitively, at most 50; email addresses do not count). Resolving and notifying is up to you.
- The author may edit within `editWindowMs` of posting; moderators may edit any time. Edits set `editedAt` and re-extract mentions.
- `remove` is a soft delete by the author or a moderator: `body` becomes null, mentions empty, `deletedAt` set. Replies remain, and the deleted comment stays in the thread as a placeholder.
- `list` returns top-level comments newest first with an opaque `nextCursor` (keyset on `createdAt, id`), each with its first `previewReplies` replies oldest first and a `replyCount` of direct replies. `listReplies` pages one comment's direct replies oldest first. `limit` is 1 to 50 (default 20).
- `react` toggles one of the allowed emoji for the actor and returns counts per emoji with `reacted` for the actor.
- `flag` records one flag per user. When a `visible` comment reaches `flagThreshold` flags it becomes `hidden`: ordinary readers get `body: null`, while the author and moderators still see it. `moderate(id, "approve")` sets `approved`, which further flags do not auto-hide (an edit returns it to `visible`); `"hide"` hides it. Moderators also see `flagCount`.
- Every id-based operation loads the comment and checks `read` on its own tenant and resource first, so ids from another tenant are `not-found`. Listing a target the actor cannot read is `forbidden`.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}?tenantId&resourceType&resourceId&cursor&limit` | none | `200 {comments, nextCursor}` |
| `GET {prefix}/{id}/replies?cursor&limit` | none | `200 {replies, nextCursor}` |
| `POST {prefix}` | `{tenantId, resourceType, resourceId, body, parentId?}` | `201 {comment}` |
| `PATCH {prefix}/{id}` | `{body}` | `200 {comment}` |
| `DELETE {prefix}/{id}` | none | `200 {comment}` |
| `POST {prefix}/{id}/reactions` | `{emoji}` | `200 {reacted, reactions}` |
| `POST {prefix}/{id}/flag` | `{reason}` | `200 {flagged, hidden}` |
| `POST {prefix}/{id}/moderate` | `{action: "approve" \| "hide"}` | `200 {comment}` |

Error codes map to HTTP statuses:

| Code | Status |
| --- | --- |
| `forbidden` | 403 |
| `not-found` | 404 |
| `deleted` | 410 |
| `edit-window-closed`, `already-flagged`, `conflict` | 409 |
| `invalid-*`, `too-deep`, `bad-request` | 400 |

Signed-out callers get 401. State-changing requests without an allowed `Origin` get 403. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/comments.test.mjs tests/comments-sql.test.mjs` covers these cases:

- posting and threading with the depth limit
- cross-resource, cross-tenant, unknown and deleted parents
- mentions
- the edit window and moderator edits
- soft delete keeping replies
- list order, cursors, reply previews and reply counts
- reaction toggles and the allow-list
- flags hiding at the threshold, approval and hiding by moderators
- tenant isolation and authorization denial
- HTTP routes, status codes, the origin check and 401

`tests/comments-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite. It covers the schema, the core behaviors, 50 concurrent reactions from 25 users plus 10 concurrent removals with exact counts, 24 concurrent flags from 12 users that record exactly 12 and hide on exactly the threshold flag, and soft delete.

In the receiving app, add the same cases against your real store and an authorization test for an ordinary member and an outside user.

## If something fails

- Reaction counts drift under load → the toggle is not one statement; keep the `DELETE ... RETURNING` / `INSERT ... ON CONFLICT DO NOTHING` form and the primary key on `(comment_id, user_id, emoji)`.
- A comment hides early or late → `flag_count` is updated outside the flag insert; keep the single `WITH ... INSERT ... UPDATE` statement so a repeat flag changes nothing.
- Users of one tenant see another's comments → your `authorize` ignores `tenantId`; check membership in the target tenant for every action.
- `invalid-cursor` after a deploy → cursors are positions, not tokens; clients should restart from the first page.

## Limits

This package does not resolve mentions, send notifications, render or sanitize HTML, list a moderation queue, keep edit history, deliver comments in realtime or rate-limit requests. Add rate limits to post, reaction and flag routes (see the `rate-limit` module). Production database correctness, session security, content policy and consuming-application acceptance remain project responsibilities.
