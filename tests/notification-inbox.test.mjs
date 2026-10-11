// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createInbox, InboxError, isSafeLink } from "../.build/modules/notification-inbox/files/core.js";
import { MemoryInboxStore } from "../.build/modules/notification-inbox/files/memory-store.js";
import { createInboxHandler } from "../.build/modules/notification-inbox/files/http.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const alice = { tenantId: "acme", userId: "alice" };
const bob = { tenantId: "acme", userId: "bob" };
const aliceElsewhere = { tenantId: "globex", userId: "alice" };

function setup(extra = {}) {
  let now = 1_000_000_000;
  let counter = 0;
  const store = new MemoryInboxStore();
  const inbox = createInbox({ store, now: () => now, newId: () => `n${String(++counter).padStart(4, "0")}`, ...extra });
  return { store, inbox, advance: (ms) => { now += ms; }, at: () => now };
}
const code = (expected) => (error) => error instanceof InboxError && error.code === expected;

test("publish and list: newest first, opaque cursor pages without gaps or repeats", async () => {
  const { inbox, advance } = setup();
  for (let i = 1; i <= 7; i += 1) {
    await inbox.publish(alice, { kind: "comment.mention", title: `Item ${i}`, link: `/items/${i}` });
    if (i !== 4) advance(1000); // items 4 and 5 share a timestamp: the id breaks the tie
  }
  const first = await inbox.list(alice, { limit: 3 });
  assert.deepEqual(first.items.map((item) => item.title), ["Item 7", "Item 6", "Item 5"]);
  assert.equal(typeof first.nextCursor, "string");
  assert.equal(first.items[0].dedupeKey, undefined);
  assert.equal(first.items[0].userId, undefined, "public items omit recipient fields");
  const second = await inbox.list(alice, { limit: 3, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.title), ["Item 4", "Item 3", "Item 2"]);
  const third = await inbox.list(alice, { limit: 3, cursor: second.nextCursor });
  assert.deepEqual(third.items.map((item) => item.title), ["Item 1"]);
  assert.equal(third.nextCursor, null);
  assert.equal((await inbox.list(alice, { limit: 7 })).nextCursor, null, "an exact final page has no cursor");
  await assert.rejects(inbox.list(alice, { limit: 51 }), code("invalid-limit"));
  await assert.rejects(inbox.list(alice, { limit: 0 }), code("invalid-limit"));
  await assert.rejects(inbox.list(alice, { cursor: "not a cursor" }), code("invalid-cursor"));
  await assert.rejects(inbox.list(alice, { cursor: Buffer.from("[1,\"../x\"]").toString("base64url") }), code("invalid-cursor"));
});

test("a repeated dedupeKey returns the existing item; it is reusable after retention", async () => {
  const { inbox, advance } = setup({ retentionMs: DAY });
  const first = await inbox.publish(alice, { kind: "invoice.paid", title: "Invoice paid", dedupeKey: "invoice:42" });
  advance(HOUR);
  const again = await inbox.publish(alice, { kind: "invoice.paid", title: "Invoice paid (retry)", dedupeKey: "invoice:42" });
  assert.equal(again.id, first.id);
  assert.equal(again.title, "Invoice paid");
  // The same key for another user is independent.
  const forBob = await inbox.publish(bob, { kind: "invoice.paid", title: "Invoice paid", dedupeKey: "invoice:42" });
  assert.notEqual(forBob.id, first.id);
  // Concurrent publishes of the same key produce one item.
  const raced = await Promise.all([1, 2, 3].map(() => inbox.publish(alice, { kind: "x", title: "Race", dedupeKey: "race" })));
  assert.equal(new Set(raced.map((item) => item.id)).size, 1);
  assert.equal((await inbox.list(alice)).items.length, 2);
  advance(DAY);
  const fresh = await inbox.publish(alice, { kind: "invoice.paid", title: "Invoice paid again", dedupeKey: "invoice:42" });
  assert.notEqual(fresh.id, first.id, "a key past retention is released");
});

test("unread counts, markRead, markAllRead with before, and archive", async () => {
  const { inbox, advance, at } = setup();
  const a = await inbox.publish(alice, { kind: "k", title: "A" });
  advance(1000);
  const b = await inbox.publish(alice, { kind: "k", title: "B" });
  const cutoff = at();
  advance(1000);
  const c = await inbox.publish(alice, { kind: "k", title: "C" });
  assert.equal(await inbox.unreadCount(alice), 3);
  assert.deepEqual(await inbox.markRead(alice, [a.id, a.id, "missing"]), { updated: 1 });
  assert.deepEqual(await inbox.markRead(alice, [a.id]), { updated: 0 }, "already read: first read time kept");
  assert.equal(await inbox.unreadCount(alice), 2);
  assert.deepEqual((await inbox.list(alice, { unreadOnly: true })).items.map((item) => item.id), [c.id, b.id]);
  assert.deepEqual(await inbox.markAllRead(alice, { before: cutoff }), { updated: 1 });
  assert.deepEqual((await inbox.list(alice, { unreadOnly: true })).items.map((item) => item.id), [c.id]);
  assert.deepEqual(await inbox.archive(alice, [c.id]), { updated: 1 });
  assert.equal(await inbox.unreadCount(alice), 0, "archived items leave the unread count");
  assert.deepEqual((await inbox.list(alice)).items.map((item) => item.id), [b.id, a.id]);
  assert.deepEqual(await inbox.markAllRead(alice), { updated: 0 });
  await assert.rejects(inbox.markRead(alice, []), code("invalid-ids"));
  await assert.rejects(inbox.markRead(alice, "n0001"), code("invalid-ids"));
  await assert.rejects(inbox.archive(alice, Array.from({ length: 101 }, (_, i) => `x${i}`)), code("invalid-ids"));
  await assert.rejects(inbox.markAllRead(alice, { before: -1 }), code("invalid-before"));
});

test("isolation: another user's or tenant's ids are never read, marked or archived", async () => {
  const { inbox, store } = setup();
  const mine = await inbox.publish(alice, { kind: "k", title: "Alice in Acme" });
  const theirs = await inbox.publish(bob, { kind: "k", title: "Bob in Acme" });
  const otherTenant = await inbox.publish(aliceElsewhere, { kind: "k", title: "Alice in Globex" });
  assert.deepEqual(await inbox.markRead(alice, [theirs.id, otherTenant.id]), { updated: 0 });
  assert.deepEqual(await inbox.archive(alice, [theirs.id, otherTenant.id]), { updated: 0 });
  assert.deepEqual(await inbox.markAllRead(alice), { updated: 1 });
  assert.equal(await inbox.unreadCount(bob), 1);
  assert.equal(await inbox.unreadCount(aliceElsewhere), 1);
  assert.deepEqual((await inbox.list(alice)).items.map((item) => item.id), [mine.id]);
  assert.deepEqual((await inbox.list(aliceElsewhere)).items.map((item) => item.id), [otherTenant.id]);
  const untouched = await store.page(bob, { limit: 10, unreadOnly: false });
  assert.equal(untouched[0].readAt, undefined);
  assert.equal(untouched[0].archivedAt, undefined);
  // A cursor built from another user's item only positions within the actor's own items.
  const bobPage = await inbox.list(bob, { limit: 1 });
  assert.equal(bobPage.nextCursor, null);
  await assert.rejects(inbox.list({ tenantId: "acme", userId: "" }), code("invalid-recipient"));
  await assert.rejects(inbox.publish({ tenantId: "../x", userId: "u" }, { kind: "k", title: "t" }), code("invalid-recipient"));
  // The optional authorize hook can refuse an actor (for example, a removed member).
  const guarded = setup({ authorize: async (actor) => actor.userId !== "bob" });
  await assert.rejects(guarded.inbox.list(bob), code("forbidden"));
  assert.equal(await guarded.inbox.unreadCount(alice), 0);
});

test("publish validation: unsafe links, titles and data are rejected", async () => {
  const { inbox } = setup({ maxDataBytes: 64 });
  for (const link of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "http://example.com", "//evil.test/x",
    "/\\evil.test", " /x", "/x\ny", "https://user:pw@example.com/", "vbscript:x", "relative/path", "https://"]) {
    assert.equal(isSafeLink(link), false, link);
    await assert.rejects(inbox.publish(alice, { kind: "k", title: "t", link }), code("invalid-link"), link);
  }
  for (const link of ["/projects/42?tab=activity#c9", "https://docs.example.com/a"]) assert.equal(isSafeLink(link), true, link);
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "" }), code("invalid-title"));
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "x".repeat(201) }), code("invalid-title"));
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "two\nlines" }), code("invalid-title"));
  await assert.rejects(inbox.publish(alice, { kind: "bad kind", title: "t" }), code("invalid-kind"));
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "t", body: "x".repeat(2001) }), code("invalid-body"));
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "t", data: { blob: "x".repeat(100) } }), code("invalid-data"));
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "t", data: [1] }), code("invalid-data"));
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "t", data: cyclic }), code("invalid-data"));
  await assert.rejects(inbox.publish(alice, { kind: "k", title: "t", dedupeKey: "" }), code("invalid-dedupe-key"));
  const data = { projectId: 42 };
  const item = await inbox.publish(alice, { kind: "k", title: "  Trimmed  ", data });
  data.projectId = 99;
  assert.equal(item.title, "Trimmed");
  assert.equal((await inbox.list(alice)).items[0].data.projectId, 42, "stored data is a detached copy");
  assert.throws(() => setup({ maxPerUser: 0 }), RangeError);
  assert.throws(() => setup({ retentionMs: 1000 }), RangeError);
});

test("prune drops items past retention and the oldest beyond maxPerUser", async () => {
  const { inbox, store, advance } = setup({ retentionMs: DAY, maxPerUser: 3 });
  await inbox.publish(alice, { kind: "k", title: "old" });
  advance(DAY + 1);
  for (let i = 1; i <= 5; i += 1) { await inbox.publish(alice, { kind: "k", title: `a${i}` }); advance(10); }
  await inbox.publish(bob, { kind: "k", title: "b1" });
  assert.deepEqual(await inbox.prune(), { expired: 1, overflow: 2 });
  assert.deepEqual((await inbox.list(alice)).items.map((item) => item.title), ["a5", "a4", "a3"]);
  assert.equal(await inbox.unreadCount(bob), 1);
  assert.equal((await store.page(alice, { limit: 50, unreadOnly: false })).length, 3);
  assert.deepEqual(await inbox.prune(), { expired: 0, overflow: 0 });
});

function http() {
  const { inbox } = setup();
  const users = { alice, bob };
  const handler = createInboxHandler({
    inbox, prefix: "/api/inbox", allowedOrigins: ["https://app.test"],
    authenticate: async (request) => users[request.headers.get("x-test-user")] ?? null,
  });
  const call = (method, path, { user = "alice", body, origin = "https://app.test", raw } = {}) => handler(new Request("https://app.test" + path, {
    method, headers: { ...(user ? { "x-test-user": user } : {}), ...(origin ? { origin } : {}), ...(body || raw ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : raw ? { body: raw } : {}),
  }));
  return { call, inbox };
}

test("HTTP adapter: list, count, read, read-all and archive with the right status codes", async () => {
  const { call, inbox } = http();
  const ids = [];
  for (let i = 1; i <= 3; i += 1) ids.push((await inbox.publish(alice, { kind: "k", title: `T${i}` })).id);
  const bobs = await inbox.publish(bob, { kind: "k", title: "Bob's" });
  const listed = await call("GET", "/api/inbox?limit=2", { origin: null });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("cache-control"), "no-store");
  const page = await listed.json();
  assert.deepEqual(page.items.map((item) => item.title), ["T3", "T2"]);
  const next = await (await call("GET", `/api/inbox?limit=2&cursor=${page.nextCursor}`, { origin: null })).json();
  assert.deepEqual(next.items.map((item) => item.title), ["T1"]);
  assert.deepEqual(await (await call("GET", "/api/inbox/count", { origin: null })).json(), { unread: 3 });
  assert.deepEqual(await (await call("POST", "/api/inbox/read", { body: { ids: [ids[0], bobs.id] } })).json(), { updated: 1 });
  assert.deepEqual((await (await call("GET", "/api/inbox?unread=1", { origin: null })).json()).items.map((item) => item.title), ["T3", "T2"]);
  assert.deepEqual(await (await call("POST", "/api/inbox/archive", { body: { ids: [ids[2], bobs.id] } })).json(), { updated: 1 });
  const readAll = await call("POST", "/api/inbox/read-all");
  assert.equal(readAll.status, 200);
  assert.deepEqual(await readAll.json(), { updated: 1 });
  assert.deepEqual(await (await call("GET", "/api/inbox/count", { user: "bob", origin: null })).json(), { unread: 1 }, "Bob's item untouched");
});

test("HTTP adapter: 401, origin check, publish not exposed and bad input", async () => {
  const { call } = http();
  assert.equal((await call("GET", "/api/inbox", { user: null })).status, 401);
  assert.equal((await call("POST", "/api/inbox/read-all", { user: null })).status, 401);
  assert.equal((await call("POST", "/api/inbox/read-all", { origin: "https://evil.test" })).status, 403);
  assert.equal((await call("POST", "/api/inbox/read", { origin: null, body: { ids: ["n0001"] } })).status, 403);
  assert.equal((await call("POST", "/api/inbox", { body: { kind: "k", title: "spoofed" } })).status, 405, "no publish route");
  assert.equal((await call("DELETE", "/api/inbox/count")).status, 405);
  assert.equal((await call("GET", "/api/inbox/elsewhere", { origin: null })).status, 404);
  assert.equal((await call("GET", "/other", { origin: null })).status, 404);
  assert.equal((await call("GET", "/api/inbox?limit=abc", { origin: null })).status, 400);
  assert.equal((await call("GET", "/api/inbox?limit=99", { origin: null })).status, 400);
  assert.equal((await call("GET", "/api/inbox?cursor=zzz", { origin: null })).status, 400);
  assert.equal((await call("POST", "/api/inbox/read", { body: { ids: "n0001" } })).status, 400);
  assert.equal((await call("POST", "/api/inbox/read", { raw: "{not json" })).status, 400);
  assert.equal((await call("POST", "/api/inbox/archive", { body: [1] })).status, 400);
  assert.equal((await call("POST", "/api/inbox/read-all", { body: { before: "yesterday" } })).status, 400);
});
