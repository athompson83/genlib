# In-app chat · 0.1.0

## What installs

Five original Apache-2.0 files under `chat/`:

- `core.ts`: `createChat` (openDirect, createGroup, members, addMembers, removeMember, leave, send, edit, delete, history, markRead, unreadCounts, listConversations, block, unblock), `ChatError`, `directKey` and the `ChatStore` interface.
- `memory-store.ts`: `MemoryChatStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createChatHandler`, a server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: four PostgreSQL tables (`chat_conversations`, `chat_members`, `chat_messages`, `chat_blocks`) and `createSqlChatStore(executor, { tables? })`, for any `query(text, params)` executor with `$1` placeholders **and a `transaction(work)` method** (node-postgres, Neon, PGlite, or postgres.js through a small wrapper).

There is no realtime server, user system or notification service. The receiving application supplies those through the integration points below.

## When to use it

Use it for direct messages and small-to-medium group chats between signed-in users of a multi-tenant app (support threads between staff, team chat, buyer–seller messages). Do not use it for comments on a record (see the `comments` module), public chat rooms with anonymous users, very large broadcast channels, or end-to-end encrypted messaging.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `ChatStore` | On PostgreSQL: apply `schema.sql` and call `createSqlChatStore(db)` with an executor that has `transaction`. Elsewhere: implement the interface with a unique `direct_key`, a unique `(conversation_id, sender_id, client_id)` and a `last_seq` counter incremented in the same transaction as the message insert. |
| `authorize(actor, action, {tenantId, userId?})` | Your tenant membership check. `use`: the actor may chat in the tenant (checked on every call). `reach`: `userId` may be messaged or added there. Return `false` to deny. Optional, but without it any signed-in user may use any tenant id. |
| `authenticate(request)` | The signed-in user from your session or verified token. Never from the request body. |
| `onMessage(event)` | Realtime fan-out of `message`, `edited` and `deleted` events to `event.recipientIds`. Errors go to `onError` and never fail the stored send. |

Optional: `maxBody` (4000), `maxMembers` (256), `editWindowMs` (15 minutes), `now`, `newId`. The handler takes `prefix`, `allowedOrigins` and `maxRequestBytes` (32 KiB).

```ts
import { createChat } from "./genlib/chat/core.js";
import { createSqlChatStore } from "./genlib/chat/sql-store.js";
import { createChatHandler } from "./genlib/chat/http.js";

// One SSE stream per signed-in user; replace with your WebSocket or pub/sub layer when running several instances.
const streams = new Map<string, Set<(data: string) => void>>();
const chat = createChat({
  store: createSqlChatStore({ query: (t, p) => pool.query(t, p), transaction: withTransaction }),
  authorize: async (actor, action, { tenantId, userId }) =>
    (await isMember(actor.userId, tenantId)) && (action === "use" || (await isMember(userId!, tenantId))),
  onMessage: (event) => {
    for (const userId of event.recipientIds) for (const send of streams.get(userId) ?? []) send(JSON.stringify(event));
  },
});
export const handler = createChatHandler({ chat, prefix: "/api/chat", allowedOrigins: [APP_ORIGIN], authenticate });
```

For typing indicators and "who is viewing", install the `presence` module and join a room named after the conversation id (`room: "chat:" + conversationId`) with state such as `{ typing: true }`. This module does not import it.

## Behavior

- `openDirect` returns the one direct conversation between the actor and another user in a tenant; the key is `tenantId|userA|userB` with the ids sorted, so either side gets the same conversation, and concurrent opens create one row (`INSERT ... ON CONFLICT (direct_key) DO NOTHING`). The same pair in another tenant has another conversation. You cannot open one with yourself.
- `createGroup` makes the actor `admin` and the listed users `member` (deduplicated; total at most `maxMembers`). Only admins add or remove other members; any member may `leave`. When the last admin leaves, the oldest remaining member (by join time) becomes admin in the same transaction. Re-adding a removed member reactivates them. Direct conversations have no membership changes (`not-group`).
- `send` requires an active member, trims the body (1 to `maxBody` characters, plain text) and needs a `clientId` (`[\w.:-]{1,64}`). A repeat of `(conversation, sender, clientId)` returns the stored message with `created: false` and no event. New messages get `seq = last_seq + 1`, allocated with `UPDATE chat_conversations SET last_seq = last_seq + 1 ... RETURNING last_seq` in the same transaction as the insert, after locking the conversation row and checking membership and the clientId, so seq is gap-free and unique and retries never burn a number. Sending also moves the sender's read position to the new seq.
- `edit` is for the sender within `editWindowMs` (sets `editedAt`). `delete` is for the sender, or a group admin, and is a soft delete: `body` becomes null, `deletedAt` is set and the seq stays.
- `history` returns messages in ascending seq. Without `afterSeq` it returns the newest page below `beforeSeq`; with `afterSeq` it returns the oldest page above it. `limit` is 1 to 100 (default 50); `hasMore` says whether more exist in that direction. Members who left or were removed still read history, but only up to the seq at which they left.
- `markRead` sets `lastReadSeq = max(lastReadSeq, seq)`, clamped to the latest message, so it never moves backward. `unreadCounts` counts other senders' not-deleted messages after `lastReadSeq` in the actor's active conversations and returns those above zero plus the total.
- `listConversations` returns the actor's active conversations in a tenant, newest activity first (last message time, or creation time when empty), with `role`, `unread`, `otherUserId` for direct conversations and a 140-character `lastMessage` preview, paged by an opaque cursor (`limit` 1 to 100, default 20).
- `block(actor, userId)` stops direct messages in both directions: opening or sending in a direct conversation between the two fails with `blocked`. Blocks are per user (all tenants) and do not affect groups. `unblock` removes only the actor's own block.
- Ids of conversations the actor never belonged to, and of other tenants, are `not-found`. Every call checks `use` on the conversation's tenant, so a user removed from the tenant loses access to its conversations.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}/conversations?tenantId&cursor&limit` | none | `200 {conversations, nextCursor}` |
| `POST {prefix}/conversations/direct` | `{tenantId, userId}` | `200 {conversation}` |
| `POST {prefix}/conversations` | `{tenantId, title, memberIds}` | `201 {conversation}` |
| `GET {prefix}/conversations/{id}/messages?beforeSeq&afterSeq&limit` | none | `200 {messages, hasMore}` |
| `POST {prefix}/conversations/{id}/messages` | `{body, clientId}` | `201 {message, created}`, or `200` for a retry |
| `POST {prefix}/conversations/{id}/read` | `{seq}` | `200 {lastReadSeq}` |
| `GET {prefix}/conversations/{id}/members` | none | `200 {members}` |
| `POST {prefix}/conversations/{id}/members` | `{userIds}` | `200 {added}` |
| `DELETE {prefix}/conversations/{id}/members/{userId}` | none | `200 {member}` |
| `PATCH {prefix}/messages/{conversationId}/{seq}` | `{body}` | `200 {message}` |
| `DELETE {prefix}/messages/{conversationId}/{seq}` | none | `200 {message}` |
| `GET {prefix}/unread?tenantId` | none | `200 {conversations, total}` |
| `POST {prefix}/blocks` | `{userId}` | `200 {blocked: true}` |
| `DELETE {prefix}/blocks/{userId}` | none | `200 {blocked}` |

Error codes map to HTTP statuses:

| Code | Status |
| --- | --- |
| `forbidden`, `blocked`, `not-member` | 403 |
| `not-found` | 404 |
| `deleted` | 410 |
| `edit-window-closed`, `too-many-members` | 409 |
| `too-large` | 413 |
| `invalid-*`, `not-group`, `bad-request` | 400 |

Signed-out callers get 401. State-changing requests without an allowed `Origin` get 403. Request bodies must be JSON and at most `maxRequestBytes` (read with a cap, not buffered whole). Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/chat.test.mjs tests/chat-sql.test.mjs` covers these cases:

- idempotent direct conversations (both sides, concurrent, per tenant)
- group admin rules, the member cap and last-admin promotion
- membership checks and removed-member history
- idempotent send, validation and gap-free seq under 20 concurrent sends
- the edit window and soft delete by sender or admin
- history paging in both directions
- markRead monotonic and clamped, and unread counts
- the inbox order, previews and cursor
- blocking in both directions and unblocking
- tenant isolation
- onMessage events and error isolation
- HTTP routes, status codes, the origin check, 401 and 413

`tests/chat-sql.test.mjs` runs the SQL store on PostgreSQL semantics through PGlite: the schema, the core behaviors, 20 concurrent sends ending with seq 1 to 20 and `last_seq` 20, 10 concurrent `openDirect` calls from both sides creating one conversation, 8 concurrent retries of one clientId storing one message without burning a seq, concurrent `markRead` ending at the highest value, and the HTTP routes over the SQL store.

In the receiving app, add the same cases against your real store and database (PGlite is one connection), and an authorization test for an ordinary member and an outside user.

## If something fails

- Duplicate or skipped seq numbers → the counter update and the insert are not in one transaction, or the executor's `transaction` does not pass the same client to `work`; keep the `FOR UPDATE` lock and both statements on `tx`.
- `createSqlChatStore requires an executor with transaction(work)` → wrap your client: run `BEGIN`, call `work` with an executor bound to that client, then `COMMIT` or `ROLLBACK`.
- Two direct conversations for one pair → `direct_key` is not unique, or ids contain `|`; keep the unique constraint and the id patterns in `core.ts`.
- Unread counts never drop → the client is not calling `markRead` with the newest seq it displayed.
- Users of one tenant see another's conversations → your `authorize` ignores `tenantId`, or is missing.
- `invalid-cursor` after a deploy → cursors are positions, not tokens; clients should restart from the first page.

## Limits

This package does not deliver messages in realtime, send push or email notifications, show typing indicators, store attachments, react to or thread messages, search, moderate content or encrypt end to end. Blocks are per user across tenants and affect direct conversations only. Every send locks its conversation row, so very busy groups serialize their sends. Add rate limits to send routes (see the `rate-limit` module) and a retention job for old messages. Production database correctness, session security, content policy and consuming-application acceptance remain project responsibilities.
