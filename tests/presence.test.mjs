// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { PresenceError, createPresence, validateState } from "../.build/modules/presence/files/core.js";
import { MemoryPresenceStore } from "../.build/modules/presence/files/memory-store.js";
import { createPresenceHandler } from "../.build/modules/presence/files/http.js";

// alice and bob belong to acme, viewer may only read acme rooms, eve belongs to globex.
const members = new Map([
  ["alice", { acme: "member" }], ["bob", { acme: "member" }], ["carol", { acme: "member" }],
  ["viewer", { acme: "viewer" }], ["eve", { globex: "member" }],
]);
async function authorize(actor, action, { tenantId }) {
  const role = members.get(actor.userId)?.[tenantId];
  if (!role) return false;
  return action === "read" || role === "member";
}
const alice = { userId: "alice" }, bob = { userId: "bob" }, carol = { userId: "carol" }, viewer = { userId: "viewer" }, eve = { userId: "eve" };
const doc = { tenantId: "acme", room: "doc:42" };
const code = (expected) => (error) => error instanceof PresenceError && error.code === expected;

function setup(extra = {}) {
  let now = 1_000_000;
  const timers = [];
  const schedule = (fn, delayMs) => {
    const timer = { fn, at: now + delayMs, done: false };
    timers.push(timer);
    return () => { timer.done = true; };
  };
  const store = new MemoryPresenceStore();
  const presence = createPresence({ store, authorize, now: () => now, schedule, minUpdateMs: 0, ...extra });
  const events = [];
  presence.subscribe(doc.tenantId, doc.room, (event) => events.push(event));
  const tick = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
  return {
    store, presence, events,
    advance: (ms) => { now += ms; },
    now: () => now,
    async runTimers() {
      for (const timer of timers) if (!timer.done && timer.at <= now) { timer.done = true; timer.fn(); }
      await tick();
    },
  };
}
const kinds = (events) => events.map((event) => `${event.type}:${event.userId}`);

test("several tabs of one user appear once; only the first join and last leave emit join and leave", async () => {
  const { presence, events, advance, now } = setup();
  await presence.join(alice, { ...doc, connectionId: "tab-1", state: { typing: false } });
  advance(1000);
  await presence.join(alice, { ...doc, connectionId: "tab-2" });
  advance(1000);
  await presence.join(bob, { ...doc, connectionId: "bob-1" });
  let { members: list } = await presence.list(alice, doc);
  assert.deepEqual(list.map((m) => [m.userId, m.connections, m.joinedAt]), [["alice", 2, 1_000_000], ["bob", 1, 1_002_000]]);
  assert.deepEqual(list[0].state, { typing: false });
  advance(1000);
  await presence.heartbeat(alice, { ...doc, connectionId: "tab-2", state: { typing: true } });
  ({ members: list } = await presence.list(alice, doc));
  assert.deepEqual(list[0].state, { typing: true }, "latest state across tabs wins");
  assert.deepEqual(await presence.leave(alice, { ...doc, connectionId: "tab-1" }), { left: true });
  assert.deepEqual(await presence.leave(alice, { ...doc, connectionId: "tab-1" }), { left: false }, "leave is idempotent");
  await presence.leave(alice, { ...doc, connectionId: "tab-2" });
  assert.deepEqual(kinds(events), ["join:alice", "update:alice", "join:bob", "update:alice", "update:alice", "leave:alice"]);
  assert.deepEqual(events[1], { type: "update", userId: "alice", state: { typing: false }, connections: 2, seq: 2 });
  assert.deepEqual(events.at(-1), { type: "leave", userId: "alice", seq: 6 });
  ({ members: list } = await presence.list(bob, doc));
  assert.deepEqual(list.map((m) => m.userId), ["bob"]);
  // Re-joining an own connection refreshes it instead of adding a second one.
  const first = (await presence.list(bob, doc)).members[0];
  advance(5000);
  await presence.join(bob, { ...doc, connectionId: "bob-1" });
  const again = (await presence.list(bob, doc)).members[0];
  assert.equal(again.connections, 1);
  assert.equal(again.joinedAt, first.joinedAt);
  assert.ok(again.lastSeenAt > first.lastSeenAt);
  assert.equal(again.lastSeenAt, now());
});

test("connections expire after the TTL: list hides them and sweep emits leave per room", async () => {
  const { presence, events, advance, store } = setup({ ttlMs: 30_000 });
  const other = { tenantId: "acme", room: "board/7" };
  await presence.join(alice, { ...doc, connectionId: "a-1" });
  await presence.join(alice, { ...doc, connectionId: "a-2" });
  await presence.join(bob, { ...doc, connectionId: "b-1" });
  await presence.join(carol, { ...other, connectionId: "c-1" });
  advance(20_000);
  await presence.heartbeat(alice, { ...doc, connectionId: "a-2" });
  advance(10_000); // a-1, b-1 and c-1 reach their expiry; a-2 lives until +50 s.
  assert.equal((await store.list(doc, 1_030_000)).length, 1);
  const results = await presence.sweep();
  assert.deepEqual(results.map((r) => [r.room, kinds(r.left)]).sort(), [["board/7", ["leave:carol"]], ["doc:42", ["leave:bob"]]]);
  assert.deepEqual(kinds(events).slice(-2), ["update:alice", "leave:bob"], "alice keeps one tab, so only an update");
  assert.deepEqual((await presence.sweep()), [], "nothing left to sweep");
  advance(20_000);
  const before = events.length;
  const { members: list } = await presence.list(bob, doc); // list also expires lazily
  assert.deepEqual(list, []);
  assert.deepEqual(kinds(events.slice(before)), ["leave:alice"]);
  await assert.rejects(presence.heartbeat(alice, { ...doc, connectionId: "a-2" }), code("not-found"));
});

test("state must be JSON within maxStateBytes", async () => {
  const { presence } = setup({ maxStateBytes: 64 });
  const join = (state) => presence.join(alice, { ...doc, connectionId: "s-1", state });
  await assert.rejects(join({ big: "x".repeat(80) }), code("state-too-large"));
  await assert.rejects(join({ emoji: "é".repeat(30) }), code("state-too-large"), "bytes, not characters");
  await assert.rejects(join({ n: Number.NaN }), code("invalid-state"));
  await assert.rejects(join({ n: Infinity }), code("invalid-state"));
  await assert.rejects(join({ when: new Date(0) }), code("invalid-state"));
  await assert.rejects(join({ f: () => 1 }), code("invalid-state"));
  await assert.rejects(join({ u: undefined }), code("invalid-state"));
  await assert.rejects(join(new Map()), code("invalid-state"));
  let deep = 1;
  for (let i = 0; i < 10; i++) deep = [deep];
  await assert.rejects(join(deep), code("invalid-state"));
  const cursor = { x: 10, y: 20 };
  await join(cursor);
  cursor.x = 999;
  assert.deepEqual((await presence.list(alice, doc)).members[0].state, { x: 10, y: 20 }, "state is copied");
  await presence.heartbeat(alice, { ...doc, connectionId: "s-1", state: null });
  assert.equal((await presence.list(alice, doc)).members[0].state, null);
  assert.deepEqual(validateState([1, "a", true, null, { b: [] }], 100), [1, "a", true, null, { b: [] }]);
  await assert.rejects(presence.join(alice, { ...doc, connectionId: "bad id!" }), code("invalid-connection"));
  await assert.rejects(presence.join(alice, { tenantId: "acme", room: "a b", connectionId: "x" }), code("invalid-room"));
  await assert.rejects(presence.join(alice, { tenantId: "../x", room: "r", connectionId: "x" }), code("invalid-tenant"));
  assert.throws(() => createPresence({ store: new MemoryPresenceStore(), authorize, ttlMs: 0 }), RangeError);
});

test("seq is strictly increasing per room and rooms count independently", async () => {
  const { presence, events, advance } = setup();
  const other = { tenantId: "acme", room: "doc:43" };
  const otherEvents = [];
  presence.subscribe(other.tenantId, other.room, (event) => otherEvents.push(event));
  await Promise.all([
    presence.join(alice, { ...doc, connectionId: "a-1" }),
    presence.join(bob, { ...doc, connectionId: "b-1" }),
    presence.join(carol, { ...doc, connectionId: "c-1" }),
    presence.join(alice, { ...other, connectionId: "a-9" }),
  ]);
  for (let i = 0; i < 5; i++) {
    advance(10);
    await presence.heartbeat(alice, { ...doc, connectionId: "a-1", state: { i } });
  }
  await presence.leave(bob, { ...doc, connectionId: "b-1" });
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(otherEvents.map((e) => e.seq), [1]);
  const snapshot = await presence.list(alice, doc);
  assert.equal(snapshot.seq, 9, "the snapshot carries the room's current seq");
});

test("update events are coalesced per user to one per minUpdateMs with the latest state", async () => {
  const { presence, events, advance, runTimers } = setup({ minUpdateMs: 100 });
  await presence.join(alice, { ...doc, connectionId: "a-1" });
  await presence.join(bob, { ...doc, connectionId: "b-1" });
  advance(100);
  await presence.heartbeat(alice, { ...doc, connectionId: "a-1", state: { x: 1 } }); // window open: emitted now
  advance(10);
  await presence.heartbeat(alice, { ...doc, connectionId: "a-1", state: { x: 2 } }); // coalesced
  advance(10);
  await presence.heartbeat(alice, { ...doc, connectionId: "a-1", state: { x: 3 } }); // coalesced
  await presence.heartbeat(bob, { ...doc, connectionId: "b-1", state: { y: 1 } }); // bob has his own window
  await presence.heartbeat(alice, { ...doc, connectionId: "a-1", state: { x: 3 } }); // unchanged: no event
  assert.deepEqual(events.slice(2).map((e) => [e.type, e.userId, e.state]), [["update", "alice", { x: 1 }], ["update", "bob", { y: 1 }]]);
  advance(50);
  await runTimers();
  assert.equal(events.length, 4, "the timer fires only after the window");
  advance(30); // 100 ms after alice's last update
  await runTimers();
  assert.deepEqual(events.slice(4).map((e) => [e.type, e.userId, e.state]), [["update", "alice", { x: 3 }]]);
  // A pending update is dropped when the user leaves before the window ends.
  advance(10);
  await presence.heartbeat(alice, { ...doc, connectionId: "a-1", state: { x: 4 } });
  await presence.leave(alice, { ...doc, connectionId: "a-1" });
  advance(200);
  await runTimers();
  assert.deepEqual(kinds(events.slice(5)), ["leave:alice"]);
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3, 4, 5, 6]);
  presence.close();
});

test("rooms are tenant scoped and authorization is enforced", async () => {
  const { presence, events } = setup();
  const globexDoc = { tenantId: "globex", room: "doc:42" };
  await presence.join(eve, { ...globexDoc, connectionId: "e-1" });
  await presence.join(alice, { ...doc, connectionId: "a-1" });
  assert.deepEqual((await presence.list(alice, doc)).members.map((m) => m.userId), ["alice"]);
  assert.deepEqual((await presence.list(eve, globexDoc)).members.map((m) => m.userId), ["eve"]);
  assert.deepEqual(kinds(events), ["join:alice"], "same room name in another tenant is another room");
  await assert.rejects(presence.list(eve, doc), code("forbidden"));
  await assert.rejects(presence.join(eve, { ...doc, connectionId: "e-2" }), code("forbidden"));
  await assert.rejects(presence.join(viewer, { ...doc, connectionId: "v-1" }), code("forbidden"), "read-only users cannot join");
  assert.equal((await presence.list(viewer, doc)).members.length, 1, "but can see who is present");
  await assert.rejects(presence.join({ userId: "" }, { ...doc, connectionId: "x-1" }), code("forbidden"));
});

test("a connection can be heartbeated or left only by the actor who joined it", async () => {
  const { presence } = setup();
  await presence.join(alice, { ...doc, connectionId: "shared-id" });
  await assert.rejects(presence.heartbeat(bob, { ...doc, connectionId: "shared-id", state: { hijack: true } }), code("not-owner"));
  await assert.rejects(presence.leave(bob, { ...doc, connectionId: "shared-id" }), code("not-owner"));
  await assert.rejects(presence.join(bob, { ...doc, connectionId: "shared-id" }), code("not-owner"));
  const { members: list } = await presence.list(alice, doc);
  assert.deepEqual(list.map((m) => [m.userId, m.state]), [["alice", null]]);
  assert.deepEqual(await presence.leave(alice, { ...doc, connectionId: "shared-id" }), { left: true });
});

test("maxPerRoom refuses new connections with room-full and frees space after expiry", async () => {
  const { presence, advance } = setup({ maxPerRoom: 2, ttlMs: 1000 });
  await presence.join(alice, { ...doc, connectionId: "a-1" });
  advance(500);
  await presence.join(bob, { ...doc, connectionId: "b-1" });
  await assert.rejects(presence.join(carol, { ...doc, connectionId: "c-1" }), code("room-full"));
  await assert.rejects(presence.join(alice, { ...doc, connectionId: "a-2" }), code("room-full"), "connections count, not users");
  advance(400);
  await presence.join(alice, { ...doc, connectionId: "a-1" }); // re-join of an existing connection still works
  advance(600); // b-1 expires at +1500; a-1 was refreshed at +900
  await presence.join(carol, { ...doc, connectionId: "c-1" });
  assert.deepEqual((await presence.list(alice, doc)).members.map((m) => m.userId), ["alice", "carol"]);
});

// ---------- HTTP ----------

const ORIGIN = "https://app.example";
function httpSetup(extra = {}) {
  const env = setup();
  let ping = null;
  let stopped = 0;
  const handler = createPresenceHandler({
    presence: env.presence, prefix: "/api/presence", allowedOrigins: [ORIGIN],
    authenticate: async (request) => {
      const user = request.headers.get("x-user");
      return user ? { userId: user } : null;
    },
    interval: (fn) => { ping = fn; return () => { stopped++; ping = null; }; },
    ...extra,
  });
  return { ...env, handler, ping: () => ping?.(), stopped: () => stopped };
}
const url = (path) => `http://localhost/api/presence${path}`;
const post = (path, body, { user = "alice", origin = ORIGIN, raw } = {}) => new Request(url(path), {
  method: "POST",
  headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(user ? { "x-user": user } : {}) },
  body: raw ?? JSON.stringify(body),
});

function sseReader(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async until(predicate) {
      while (!predicate(buffer)) {
        const { done, value } = await reader.read();
        if (done) return { buffer, done: true };
        buffer += decoder.decode(value, { stream: true });
      }
      return { buffer, done: false };
    },
    async end() {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return buffer;
        buffer += decoder.decode(value, { stream: true });
      }
    },
    frames: () => buffer.split("\n\n").filter((frame) => frame.includes("event:")).map((frame) => {
      const fields = Object.fromEntries(frame.split("\n").filter((line) => /^(id|event|data):/.test(line)).map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
      return { id: fields.id, event: fields.event, data: JSON.parse(fields.data) };
    }),
  };
}

test("SSE stream: joins, sends a snapshot then ordered events, pings, and leaves on abort", async () => {
  const { handler, presence, ping, stopped, events } = httpSetup();
  await presence.join(bob, { ...doc, connectionId: "b-1", state: { cursor: 3 } });
  const controller = new AbortController();
  const response = await handler(new Request(url("/stream?tenantId=acme&room=doc%3A42&connectionId=tab-1"), {
    headers: { "x-user": "alice", origin: ORIGIN }, signal: controller.signal,
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/event-stream/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const sse = sseReader(response);
  await sse.until((b) => b.includes("event: snapshot"));
  const [snapshot] = sse.frames();
  assert.equal(snapshot.event, "snapshot");
  assert.deepEqual(snapshot.data.members.map((m) => [m.userId, m.connections, m.state]), [["alice", 1, null], ["bob", 1, { cursor: 3 }]]);
  assert.equal(snapshot.data.seq, 2, "bob's join and alice's own join precede the snapshot");

  await presence.heartbeat(bob, { ...doc, connectionId: "b-1", state: { cursor: 4 } });
  await presence.join(carol, { ...doc, connectionId: "c-1" });
  await presence.leave(carol, { ...doc, connectionId: "c-1" });
  await sse.until((b) => b.includes("event: leave"));
  const live = sse.frames().slice(1);
  assert.deepEqual(live.map((f) => [f.id, f.event, f.data.userId]), [["3", "update", "bob"], ["4", "join", "carol"], ["5", "leave", "carol"]]);
  assert.deepEqual(live[0].data.state, { cursor: 4 });

  ping();
  await sse.until((b) => b.includes(": ping"));

  controller.abort();
  await sse.end();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped(), 1, "keep-alive timer stopped");
  assert.deepEqual(kinds(events).slice(-1), ["leave:alice"], "abort leaves the room");
  assert.deepEqual((await presence.list(bob, doc)).members.map((m) => m.userId), ["bob"]);
});

test("SSE stream refuses signed-out, unauthorized, foreign-origin and full-room requests", async () => {
  const { handler, presence } = httpSetup();
  const open = (headers, query = "tenantId=acme&room=doc:42&connectionId=t-1") => handler(new Request(url(`/stream?${query}`), { headers }));
  assert.equal((await open({})).status, 401);
  assert.equal((await open({ "x-user": "eve" })).status, 403);
  assert.equal((await open({ "x-user": "viewer" })).status, 403);
  assert.equal((await open({ "x-user": "alice", origin: "https://evil.example" })).status, 403);
  assert.equal((await open({ "x-user": "alice" }, "tenantId=acme&room=bad room&connectionId=t-1")).status, 400);
  assert.equal((await presence.list(alice, doc)).members.length, 0, "failed opens leave nothing behind");
  const full = createPresenceHandler({
    presence: createPresence({ store: new MemoryPresenceStore(), authorize, maxPerRoom: 1 }), prefix: "/api/presence", allowedOrigins: [ORIGIN],
    authenticate: async (request) => ({ userId: request.headers.get("x-user") }), interval: () => () => {},
  });
  const first = await full(new Request(url("/stream?tenantId=acme&room=doc:42&connectionId=t-1"), { headers: { "x-user": "alice" } }));
  assert.equal(first.status, 200);
  const second = await full(new Request(url("/stream?tenantId=acme&room=doc:42&connectionId=t-2"), { headers: { "x-user": "bob" } }));
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "room-full");
  await first.body.cancel();
});

test("HTTP heartbeat and leave: statuses, origin check, body limits and no-store", async () => {
  const { handler, presence, events } = httpSetup({ maxRequestBytes: 2048 });
  await presence.join(alice, { ...doc, connectionId: "tab-1" });
  const ok = await handler(post("/heartbeat", { ...doc, connectionId: "tab-1", state: { typing: true } }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(typeof (await ok.json()).expiresAt, "number");
  assert.deepEqual(events.at(-1).state, { typing: true });

  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "tab-1" }, { user: null }))).status, 401);
  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "tab-1" }, { origin: null }))).status, 403);
  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "tab-1" }, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "tab-1" }, { user: "bob" }))).status, 403, "not-owner");
  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "tab-1" }, { user: "eve" }))).status, 403);
  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "nope" }))).status, 404);
  const tooBigState = await handler(post("/heartbeat", { ...doc, connectionId: "tab-1", state: { t: "x".repeat(1100) } }));
  assert.equal(tooBigState.status, 413);
  assert.equal((await tooBigState.json()).error, "state-too-large");
  const tooBigBody = await handler(post("/heartbeat", null, { raw: JSON.stringify({ ...doc, connectionId: "tab-1", pad: "x".repeat(3000) }) }));
  assert.equal(tooBigBody.status, 413);
  assert.equal((await handler(post("/heartbeat", null, { raw: "{not json" }))).status, 400);
  assert.equal((await handler(post("/heartbeat", null, { raw: "[1]" }))).status, 400);
  assert.equal((await handler(post("/heartbeat", { ...doc, connectionId: "tab-1", state: 1 }))).status, 200);
  assert.equal((await handler(new Request(url("/heartbeat"), { method: "GET", headers: { "x-user": "alice" } }))).status, 405);
  assert.equal((await handler(new Request(url("/other"), { headers: { "x-user": "alice" } }))).status, 404);
  assert.equal((await handler(new Request("http://localhost/elsewhere"))).status, 404);

  const left = await handler(post("/leave", { ...doc, connectionId: "tab-1" }));
  assert.equal(left.status, 200);
  assert.deepEqual(await left.json(), { left: true });
  assert.deepEqual(kinds(events).slice(-1), ["leave:alice"]);
  assert.deepEqual(await (await handler(post("/leave", { ...doc, connectionId: "tab-1" }))).json(), { left: false });
});
