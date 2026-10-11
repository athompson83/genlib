# Real-time presence · 0.1.0

## What installs

Three original Apache-2.0 files under `presence/`:

- `core.ts`: `createPresence` (join, heartbeat, leave, list, sweep, subscribe, close), `PresenceError`, `validateState`, `groupMembers` and the `PresenceStore` interface.
- `memory-store.ts`: `MemoryPresenceStore`, a per-process store. Presence is ephemeral, so it also serves a single production instance.
- `http.ts`: `createPresenceHandler`, a server-only Fetch `Request`/`Response` adapter with a Server-Sent Events stream and POST heartbeat/leave routes.

There is no SQL schema: presence is short-lived state, not records. There is no Redis client, WebSocket server or user system. The receiving application supplies those through the integration points below.

## When to use it

Use it to show who is online in a workspace, who is viewing a document or board, live cursors and "is typing" indicators in a multi-tenant app. Do not use it as an audit log of who read what, for chat message delivery, or for anonymous visitor counts (every call needs a signed-in actor).

## Integration points

| Point | What the application supplies |
| --- | --- |
| `PresenceStore` | One instance: `new MemoryPresenceStore()`. Several instances: implement the interface on Redis (shape below). |
| `authorize(actor, action, {tenantId, room})` | Your membership and access check for `join` (also heartbeat) and `read` (list, stream). Return `false` to deny. |
| `authenticate(request)` | The signed-in user from your session or verified token. Never from the body or query string. |
| `presence.sweep()` | Call on an interval (for example every 15 s) so expired tabs emit `leave` even when nobody lists the room. |
| Cross-instance events | `subscribe` is in-process. With several instances, publish each event to your pub/sub and deliver it to local streams. |

Optional: `ttlMs` (30 s), `maxPerRoom` (500 connections), `maxStateBytes` (1024), `minUpdateMs` (100 ms), `now` and `schedule` (for tests). The handler takes `prefix`, `allowedOrigins`, `maxRequestBytes` (8 KiB), `pingMs` (15 s) and `interval`.

```ts
import { createPresence } from "./genlib/presence/core.js";
import { MemoryPresenceStore } from "./genlib/presence/memory-store.js";
import { createPresenceHandler } from "./genlib/presence/http.js";

const presence = createPresence({ store: new MemoryPresenceStore(), authorize });
setInterval(() => void presence.sweep(), 15_000);
export const handler = createPresenceHandler({
  presence, prefix: "/api/presence", allowedOrigins: [APP_ORIGIN], authenticate,
});

// Browser
const connectionId = crypto.randomUUID();
const source = new EventSource(`/api/presence/stream?tenantId=acme&room=doc:42&connectionId=${connectionId}`);
source.addEventListener("snapshot", (e) => render(JSON.parse(e.data).members));
for (const type of ["join", "update", "leave"]) source.addEventListener(type, (e) => apply(JSON.parse(e.data)));
```

### Redis shape (documented, not implemented)

- `presence:{tenantId}:{room}` sorted set: member = connectionId, score = `expiresAt` (ms).
- `presence:{tenantId}:{room}:conn` hash: connectionId → JSON of the `PresenceConnection`.
- `presence:rooms` sorted set: member = `{tenantId}:{room}`, score = the earliest expiry in that room, for `expiredRooms`.
- `add`: one Lua script that returns `exists` when `HEXISTS`, `full` when `ZCOUNT key (now +inf >= maxPerRoom`, else `ZADD` + `HSET` + update `presence:rooms`.
- `list`: `ZRANGEBYSCORE key (now +inf` then `HMGET`. `removeExpired`: `ZRANGEBYSCORE key -inf now`, then `ZREM` + `HDEL` in the same script, returning the removed JSON.
- Set a key TTL a little beyond the newest `expiresAt` so abandoned rooms disappear.

## Behavior

- A connection is one tab, device or socket, identified by a client-generated `connectionId` (`[\w-]{1,64}`). It expires `ttlMs` after its last join or heartbeat.
- `join` adds a connection. The user's first live connection in the room emits `join`; further tabs emit `update` with the new connection count. Re-joining an own existing connection refreshes it. A connection id held by another user is `not-owner`.
- `heartbeat` extends expiry and, when `state` is given, replaces the connection's state (`null` clears it). An unchanged state emits nothing. An expired or unknown connection is `not-found`; the client joins again.
- `leave` removes a connection. Unknown ids return `{left: false}`. The last connection emits `leave`; otherwise `update`. Only the joining actor may heartbeat, leave or re-join a connection (`not-owner`).
- `list` returns `{members, seq}`: one member per user with `connections`, the most recently changed `state` across the user's connections, the earliest `joinedAt` and the latest `lastSeenAt`, ordered by `joinedAt`. Events with a greater `seq` follow the snapshot. Expired connections are excluded; `list`, `join`, `heartbeat` and `leave` expire the room lazily and emit the resulting events.
- `sweep` removes expired connections in every room and returns `[{tenantId, room, left}]` with the `leave` events. A user who keeps another tab gets an `update` instead.
- State must be plain JSON: null, booleans, finite numbers, strings, arrays and plain objects, at most 8 levels deep and `maxStateBytes` UTF-8 bytes once serialized. Otherwise `invalid-state` or `state-too-large`. State is copied on the way in.
- Events are `{type: "join" | "update" | "leave", userId, state?, connections?, seq}`. `seq` increases by one per event within a room and process. Operations on one room are serialized so join/leave decisions and `seq` stay ordered.
- `update` events are coalesced per user to at most one per `minUpdateMs` on the injected clock; the latest state is emitted when the window ends (through `schedule`) or at the next operation in the room. A pending update is dropped when the user leaves.
- Rooms are scoped by `tenantId`. `join` and `heartbeat` need `authorize(..., "join")`; `list` and the stream need `"read"`; `leave` needs only ownership, so revoked users can still leave. `maxPerRoom` counts live connections and refuses with `room-full`.
- In-process room state (seq, throttle) is dropped when a room is empty and unwatched, so `seq` restarts there; clients always start from the snapshot.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `GET {prefix}/stream?tenantId&room&connectionId` | none | `200 text/event-stream` |
| `POST {prefix}/heartbeat` | `{tenantId, room, connectionId, state?}` | `200 {expiresAt}` |
| `POST {prefix}/leave` | `{tenantId, room, connectionId}` | `200 {left}` |

The stream subscribes, joins, then sends `event: snapshot` (`{members, seq}`, `id` = seq), followed by `join`, `update` and `leave` events with `id: seq` and the event JSON as `data`. Every `pingMs` it sends a `: ping` comment and heartbeats the connection, so an open stream keeps the user present. When the request's `AbortSignal` fires or the client cancels the body, it unsubscribes, stops the timer and leaves. Clients that also send state (cursor, typing) POST `heartbeat` with the same `connectionId`.

| Code | Status |
| --- | --- |
| `forbidden`, `not-owner` | 403 |
| `not-found` | 404 |
| `room-full` | 409 |
| `state-too-large`, request body over `maxRequestBytes` | 413 |
| `invalid-*`, `bad-request`, invalid JSON | 400 |

Signed-out callers get 401. POSTs without an allowed `Origin` get 403; a stream request that sends an `Origin` header must also match. Wrong methods get 405. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/presence.test.mjs` covers these cases:

- multi-tab grouping, join/leave semantics, re-join and idempotent leave
- TTL expiry through `sweep` (leave per room) and through `list`
- state JSON validation, nesting and byte limits
- `seq` ordering per room, including concurrent joins
- update throttling with a fake clock and fake scheduler
- tenant isolation and authorization for outsiders and read-only users
- the actor binding of connections
- `room-full` and space freed by expiry
- the SSE stream: the body is read, the snapshot precedes ordered events, ping comments, and an `AbortController` abort leaves the room
- HTTP statuses: 200, 400, 401, 403, 404, 405, 409, 413 and `no-store`

In the receiving app, add the same cases against your real store, your `authorize` with an ordinary member and an outside user, and a browser check that closing a tab removes the user within `ttlMs`.

## If something fails

- Users linger after closing a tab → the abort was not delivered (proxy buffering or a serverless runtime). Run `sweep` on an interval and keep `ttlMs` short; disable proxy buffering for the stream (the adapter sends `x-accel-buffering: no`).
- A user flickers between join and leave → the client heartbeat or stream ping is slower than `ttlMs`; keep it under half of `ttlMs`.
- Events missing on some clients → several server instances without shared pub/sub; each instance only delivers its own events.
- Users of one tenant see another's presence → your `authorize` ignores `tenantId`; check membership in the target tenant for every action.
- `room-full` in a large meeting → raise `maxPerRoom` deliberately or show a count instead of a full member list.

## Limits

This package does not include a Redis client, a WebSocket server, cross-instance pub/sub, presence history or rate limits. Add request rate limits to heartbeat and stream routes (see the `rate-limit` module). Session security, production load behavior and consuming-application acceptance remain project responsibilities.
