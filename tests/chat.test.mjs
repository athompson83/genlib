// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { ChatError, createChat, decodeInboxCursor, directKey } from "../.build/modules/chat/files/core.js";
import { MemoryChatStore } from "../.build/modules/chat/files/memory-store.js";
import { createChatHandler } from "../.build/modules/chat/files/http.js";

const MINUTE = 60_000;
// alice, bob, carol and dave belong to acme; eve belongs to globex; frank belongs to both.
const tenants = new Map([
  ["alice", ["acme"]], ["bob", ["acme"]], ["carol", ["acme"]], ["dave", ["acme"]], ["eve", ["globex"]], ["frank", ["acme", "globex"]],
]);
const inTenant = (userId, tenantId) => tenants.get(userId)?.includes(tenantId) ?? false;
async function authorize(actor, action, { tenantId, userId }) {
  if (!inTenant(actor.userId, tenantId)) return false;
  return action === "use" || inTenant(userId, tenantId);
}
const alice = { userId: "alice" }, bob = { userId: "bob" }, carol = { userId: "carol" }, dave = { userId: "dave" };
const eve = { userId: "eve" }, frank = { userId: "frank" };
const code = (expected) => (error) => error instanceof ChatError && error.code === expected;

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const events = [];
  const store = new MemoryChatStore();
  const chat = createChat({
    store, authorize, now: () => now, newId: () => `id-${String(++counter).padStart(4, "0")}`,
    onMessage: (event) => { events.push(event); }, ...extra,
  });
  let client = 0;
  // Each send happens one second after the previous one so ordering is unambiguous.
  const say = async (actor, conversationId, body, clientId = `c${++client}`) => { now += 1000; return (await chat.send(actor, conversationId, { body, clientId })).message; };
  return { store, chat, say, events, advance: (ms) => { now += ms; } };
}

test("openDirect is idempotent: the same pair gets one conversation from either side, per tenant", async () => {
  const { chat } = setup();
  const first = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  assert.equal(first.kind, "direct");
  assert.equal(first.otherUserId, "bob");
  assert.equal(first.title, null);
  const again = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  const reverse = await chat.openDirect(bob, { tenantId: "acme", otherUserId: "alice" });
  assert.equal(again.id, first.id);
  assert.equal(reverse.id, first.id);
  assert.equal(reverse.otherUserId, "alice");
  assert.equal(directKey("acme", "bob", "alice"), directKey("acme", "alice", "bob"));
  // The same users in another tenant have a separate conversation.
  const elsewhere = await chat.openDirect(frank, { tenantId: "globex", otherUserId: "eve" });
  const acmeFrank = await chat.openDirect(frank, { tenantId: "acme", otherUserId: "alice" });
  assert.notEqual(elsewhere.id, acmeFrank.id);
  await assert.rejects(chat.openDirect(alice, { tenantId: "acme", otherUserId: "alice" }), code("invalid-user"));
  await assert.rejects(chat.openDirect(alice, { tenantId: "acme", otherUserId: "bad|id" }), code("invalid-user"));
  await assert.rejects(chat.openDirect(alice, { tenantId: "../x", otherUserId: "bob" }), code("invalid-tenant"));
  // Concurrent opens from both sides end with one conversation.
  const results = await Promise.all([1, 2, 3, 4].map((i) => chat.openDirect(i % 2 ? carol : dave, { tenantId: "acme", otherUserId: i % 2 ? "dave" : "carol" })));
  assert.equal(new Set(results.map((item) => item.id)).size, 1);
});

test("groups: admin-only add and remove, members leave, and the last admin leaving promotes the oldest member", async () => {
  const { chat, advance } = setup({ maxMembers: 4 });
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "  Launch  ", memberIds: ["bob", "bob", "alice"] });
  assert.equal(group.kind, "group");
  assert.equal(group.title, "Launch");
  let members = await chat.members(bob, group.id);
  assert.deepEqual(members.map((m) => [m.userId, m.role]), [["alice", "admin"], ["bob", "member"]]);
  await assert.rejects(chat.addMembers(bob, group.id, ["carol"]), code("forbidden"));
  advance(1000);
  assert.deepEqual((await chat.addMembers(alice, group.id, ["carol", "bob"])).map((m) => m.userId), ["carol"]);
  advance(1000);
  await chat.addMembers(alice, group.id, ["dave"]);
  await assert.rejects(chat.addMembers(alice, group.id, ["frank"]), code("too-many-members"));
  await assert.rejects(chat.removeMember(bob, group.id, "carol"), code("forbidden"));
  await assert.rejects(chat.createGroup(alice, { tenantId: "acme", title: "", memberIds: [] }), code("invalid-title"));
  await assert.rejects(chat.createGroup(alice, { tenantId: "acme", title: "x", memberIds: "bob" }), code("invalid-members"));
  await assert.rejects(chat.createGroup(alice, { tenantId: "acme", title: "x", memberIds: ["bob", "carol", "dave", "frank"] }), code("too-many-members"));
  // An admin removes dave; dave can no longer act but the slot is free again.
  const removed = await chat.removeMember(alice, group.id, "dave");
  assert.equal(typeof removed.leftAt, "number");
  await assert.rejects(chat.removeMember(alice, group.id, "dave"), code("not-member"));
  // The only admin leaves: bob (oldest remaining) becomes admin.
  await chat.leave(alice, group.id);
  members = await chat.members(bob, group.id);
  assert.deepEqual(members.map((m) => [m.userId, m.role]), [["bob", "admin"], ["carol", "member"]]);
  assert.equal((await chat.addMembers(bob, group.id, ["alice"]))[0].role, "member");
  // Direct conversations have no membership changes.
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  await assert.rejects(chat.leave(alice, dm.id), code("not-group"));
  await assert.rejects(chat.addMembers(alice, dm.id, ["carol"]), code("not-group"));
});

test("membership: non-members get not-found and removed members see history only up to their removal", async () => {
  const { chat, say } = setup();
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob", "carol"] });
  await say(alice, group.id, "one");
  await say(bob, group.id, "two");
  await assert.rejects(chat.send(dave, group.id, { body: "hi", clientId: "x" }), code("not-found"));
  await assert.rejects(chat.history(dave, group.id), code("not-found"));
  await assert.rejects(chat.history(alice, "no-such-id"), code("not-found"));
  await chat.removeMember(alice, group.id, "carol");
  await say(alice, group.id, "three, after carol left");
  const seen = await chat.history(carol, group.id);
  assert.deepEqual(seen.messages.map((m) => m.body), ["one", "two"]);
  assert.deepEqual((await chat.history(carol, group.id, { afterSeq: 2 })).messages, []);
  await assert.rejects(chat.send(carol, group.id, { body: "let me back", clientId: "c" }), code("not-member"));
  await assert.rejects(chat.edit(carol, group.id, 3, "x"), code("not-member"));
  assert.deepEqual((await chat.history(bob, group.id)).messages.map((m) => m.seq), [1, 2, 3]);
});

test("send: trimmed plain text, idempotent on clientId, gap-free seq under concurrency, and onMessage fan-out", async () => {
  const { chat, events } = setup({ maxBody: 10 });
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob"] });
  const first = await chat.send(alice, group.id, { body: "  hello  ", clientId: "k1" });
  assert.equal(first.created, true);
  assert.equal(first.message.body, "hello");
  assert.equal(first.message.seq, 1);
  const retry = await chat.send(alice, group.id, { body: "hello", clientId: "k1" });
  assert.equal(retry.created, false);
  assert.equal(retry.message.id, first.message.id);
  // The same clientId from another sender is a different message.
  assert.equal((await chat.send(bob, group.id, { body: "hi", clientId: "k1" })).message.seq, 2);
  await assert.rejects(chat.send(alice, group.id, { body: "   ", clientId: "k2" }), code("invalid-body"));
  await assert.rejects(chat.send(alice, group.id, { body: "x".repeat(11), clientId: "k2" }), code("invalid-body"));
  await assert.rejects(chat.send(alice, group.id, { body: 42, clientId: "k2" }), code("invalid-body"));
  await assert.rejects(chat.send(alice, group.id, { body: "x", clientId: "has space" }), code("invalid-client-id"));
  const sends = await Promise.all(Array.from({ length: 20 }, (_, i) => chat.send(i % 2 ? alice : bob, group.id, { body: `m${i}`, clientId: `p${i}` })));
  const seqs = sends.map((s) => s.message.seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 3));
  const retries = await Promise.all([1, 2, 3, 4].map(() => chat.send(alice, group.id, { body: "same", clientId: "r1" })));
  assert.equal(new Set(retries.map((r) => r.message.seq)).size, 1);
  assert.equal(retries.filter((r) => r.created).length, 1);
  assert.equal(events.filter((e) => e.type === "message").length, 23, "replays do not fan out");
  assert.deepEqual(events[0].recipientIds, ["alice", "bob"]);
  assert.equal(events[0].tenantId, "acme");
});

test("onMessage errors go to onError and never fail a stored send", async () => {
  const errors = [];
  const { chat } = setup({ onMessage: () => { throw new Error("socket down"); }, onError: (error) => errors.push(error.message) });
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  assert.equal((await chat.send(alice, dm.id, { body: "hi", clientId: "a" })).created, true);
  assert.deepEqual(errors, ["socket down"]);
});

test("edit within the window by the sender; soft delete by the sender or a group admin", async () => {
  const { chat, say, advance, events } = setup();
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob", "carol"] });
  const mine = await say(bob, group.id, "typo");
  advance(MINUTE);
  const edited = await chat.edit(bob, group.id, mine.seq, "fixed");
  assert.equal(edited.body, "fixed");
  assert.equal(typeof edited.editedAt, "number");
  await assert.rejects(chat.edit(alice, group.id, mine.seq, "not mine"), code("forbidden"));
  await assert.rejects(chat.edit(bob, group.id, 99, "x"), code("not-found"));
  await assert.rejects(chat.edit(bob, group.id, 0, "x"), code("invalid-seq"));
  advance(15 * MINUTE);
  await assert.rejects(chat.edit(bob, group.id, mine.seq, "too late"), code("edit-window-closed"));
  await assert.rejects(chat.delete(carol, group.id, mine.seq), code("forbidden"));
  const removed = await chat.delete(alice, group.id, mine.seq);
  assert.equal(removed.body, null);
  assert.equal(typeof removed.deletedAt, "number");
  assert.equal(removed.seq, mine.seq);
  await assert.rejects(chat.delete(bob, group.id, mine.seq), code("deleted"));
  const other = await say(carol, group.id, "mine");
  assert.equal((await chat.delete(carol, group.id, other.seq)).body, null);
  await assert.rejects(chat.edit(carol, group.id, other.seq, "revive"), code("deleted"));
  assert.deepEqual(events.map((e) => e.type), ["message", "edited", "deleted", "message", "deleted"]);
  // In a direct conversation nobody is admin: only the sender deletes.
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  const hers = await say(alice, dm.id, "dm");
  await assert.rejects(chat.delete(bob, dm.id, hers.seq), code("forbidden"));
  assert.deepEqual((await chat.history(bob, dm.id)).messages.map((m) => m.body), ["dm"]);
});

test("history pages by beforeSeq and afterSeq in ascending order with hasMore", async () => {
  const { chat, say } = setup();
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  for (let i = 1; i <= 7; i++) await say(i % 2 ? alice : bob, dm.id, `m${i}`);
  const latest = await chat.history(bob, dm.id, { limit: 3 });
  assert.deepEqual(latest.messages.map((m) => m.seq), [5, 6, 7]);
  assert.equal(latest.hasMore, true);
  const older = await chat.history(bob, dm.id, { beforeSeq: 5, limit: 3 });
  assert.deepEqual(older.messages.map((m) => m.seq), [2, 3, 4]);
  const oldest = await chat.history(bob, dm.id, { beforeSeq: 2, limit: 3 });
  assert.deepEqual(oldest.messages.map((m) => m.seq), [1]);
  assert.equal(oldest.hasMore, false);
  const newer = await chat.history(bob, dm.id, { afterSeq: 2, limit: 2 });
  assert.deepEqual(newer.messages.map((m) => m.seq), [3, 4]);
  assert.equal(newer.hasMore, true);
  assert.deepEqual((await chat.history(bob, dm.id, { afterSeq: 2, beforeSeq: 5 })).messages.map((m) => m.seq), [3, 4]);
  await assert.rejects(chat.history(bob, dm.id, { limit: 101 }), code("invalid-limit"));
  await assert.rejects(chat.history(bob, dm.id, { limit: 0 }), code("invalid-limit"));
  await assert.rejects(chat.history(bob, dm.id, { beforeSeq: -1 }), code("invalid-seq"));
});

test("markRead is monotonic and clamped; unread counts skip own and deleted messages", async () => {
  const { chat, say } = setup();
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  const group = await chat.createGroup(carol, { tenantId: "acme", title: "Team", memberIds: ["bob"] });
  await say(bob, dm.id, "mine");
  for (let i = 0; i < 4; i++) await say(alice, dm.id, `a${i}`);
  await say(carol, group.id, "g1");
  const g2 = await say(carol, group.id, "g2");
  assert.deepEqual(await chat.unreadCounts(bob, "acme"), { conversations: [{ conversationId: dm.id, unread: 4 }, { conversationId: group.id, unread: 2 }], total: 6 });
  assert.equal((await chat.unreadCounts(alice, "acme")).total, 0, "own messages are read");
  assert.deepEqual(await chat.markRead(bob, dm.id, 2), { lastReadSeq: 2 });
  assert.deepEqual(await chat.markRead(bob, dm.id, 1), { lastReadSeq: 2 }, "never moves backward");
  assert.deepEqual(await chat.markRead(bob, dm.id, 999), { lastReadSeq: 5 }, "clamped to the latest message");
  await chat.delete(carol, group.id, g2.seq);
  assert.deepEqual(await chat.unreadCounts(bob, "acme"), { conversations: [{ conversationId: group.id, unread: 1 }], total: 1 });
  await assert.rejects(chat.markRead(bob, dm.id, -1), code("invalid-seq"));
  await assert.rejects(chat.markRead(bob, dm.id, "3"), code("invalid-seq"));
  assert.equal((await chat.unreadCounts(bob, "globex").catch((e) => e.code)), "forbidden");
});

test("listConversations: newest activity first, previews, unread, and an opaque cursor", async () => {
  const { chat, say, advance } = setup();
  const withBob = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  advance(1000);
  const withCarol = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "carol" });
  advance(1000);
  const group = await chat.createGroup(dave, { tenantId: "acme", title: "Team", memberIds: ["alice"] });
  await say(bob, withBob.id, "x".repeat(200));
  await say(carol, withCarol.id, "from carol");
  let inbox = await chat.listConversations(alice, "acme");
  // withCarol has the newest message, withBob next, the empty group sorts by its creation time.
  assert.deepEqual(inbox.conversations.map((c) => c.id), [withCarol.id, withBob.id, group.id]);
  assert.equal(inbox.conversations[0].lastMessage.body, "from carol");
  assert.equal(inbox.conversations[0].unread, 1);
  assert.equal(inbox.conversations[0].otherUserId, "carol");
  assert.equal(inbox.conversations[1].lastMessage.body.length, 140);
  assert.equal(inbox.conversations[2].lastMessage, null);
  assert.equal(inbox.conversations[2].role, "member");
  assert.equal(inbox.nextCursor, null);
  await say(dave, group.id, "now the group is newest");
  const page1 = await chat.listConversations(alice, "acme", { limit: 2 });
  assert.deepEqual(page1.conversations.map((c) => c.id), [group.id, withCarol.id]);
  assert.ok(page1.nextCursor && !page1.nextCursor.includes(group.id));
  const page2 = await chat.listConversations(alice, "acme", { limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.conversations.map((c) => c.id), [withBob.id]);
  assert.equal(page2.nextCursor, null);
  await assert.rejects(chat.listConversations(alice, "acme", { cursor: "zz!" }), code("invalid-cursor"));
  assert.throws(() => decodeInboxCursor("e30"), code("invalid-cursor"));
  // A conversation the user left drops out of the inbox.
  await chat.leave(alice, group.id);
  inbox = await chat.listConversations(alice, "acme");
  assert.deepEqual(inbox.conversations.map((c) => c.id), [withCarol.id, withBob.id]);
});

test("blocking prevents direct messages in both directions; groups are unaffected", async () => {
  const { chat, say } = setup();
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob"] });
  assert.deepEqual(await chat.block(bob, "alice"), { blocked: true });
  await assert.rejects(chat.send(alice, dm.id, { body: "hi", clientId: "a" }), code("blocked"));
  await assert.rejects(chat.send(bob, dm.id, { body: "hi", clientId: "b" }), code("blocked"));
  await assert.rejects(chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" }), code("blocked"));
  await say(alice, group.id, "group still works");
  await assert.rejects(chat.block(bob, "bob"), code("invalid-user"));
  assert.deepEqual(await chat.unblock(alice, "bob"), { blocked: true }, "alice cannot lift bob's block");
  assert.deepEqual(await chat.unblock(bob, "alice"), { blocked: false });
  await say(alice, dm.id, "hello again");
});

test("tenant isolation: outside users cannot use, reach or read another tenant's chat", async () => {
  const { chat, say } = setup();
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob"] });
  await say(alice, group.id, "acme only");
  await assert.rejects(chat.openDirect(eve, { tenantId: "acme", otherUserId: "alice" }), code("forbidden"));
  await assert.rejects(chat.openDirect(alice, { tenantId: "acme", otherUserId: "eve" }), code("forbidden"));
  await assert.rejects(chat.createGroup(alice, { tenantId: "acme", title: "x", memberIds: ["eve"] }), code("forbidden"));
  await assert.rejects(chat.addMembers(alice, group.id, ["eve"]), code("forbidden"));
  await assert.rejects(chat.history(eve, group.id), code("not-found"));
  await assert.rejects(chat.listConversations(eve, "acme"), code("forbidden"));
  assert.deepEqual((await chat.listConversations(frank, "globex")).conversations, []);
  // Frank's acme conversation is not listed in globex.
  await chat.openDirect(frank, { tenantId: "acme", otherUserId: "alice" });
  assert.deepEqual((await chat.listConversations(frank, "globex")).conversations, []);
  // A member who loses tenant access loses the conversation too.
  tenants.set("bob", []);
  try {
    await assert.rejects(chat.history(bob, group.id), code("not-found"));
  } finally {
    tenants.set("bob", ["acme"]);
  }
  assert.throws(() => setup({ maxBody: 0 }), RangeError);
  assert.throws(() => setup({ maxMembers: 1 }), RangeError);
});

function http(extra = {}) {
  let clock = 2_000_000;
  // Every call to now() moves the clock one second so inbox order follows the order of calls.
  const { chat, say } = setup({ now: () => (clock += 1000), ...extra });
  const handler = createChatHandler({
    chat, prefix: "/api/chat/", allowedOrigins: ["https://app.test"], maxRequestBytes: 2048,
    authenticate: async (request) => { const id = request.headers.get("x-test-user"); return id ? { userId: id } : null; },
  });
  const call = (method, path, { user = "alice", body, origin = "https://app.test", raw } = {}) => handler(new Request("https://app.test" + path, {
    method, headers: { ...(user ? { "x-test-user": user } : {}), ...(origin ? { origin } : {}), ...(body !== undefined || raw ? { "content-type": "application/json" } : {}) },
    ...(raw ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  }));
  return { call, chat, say };
}

test("HTTP adapter: every route with its status code", async () => {
  const { call } = http();
  const direct = await call("POST", "/api/chat/conversations/direct", { body: { tenantId: "acme", userId: "bob" } });
  assert.equal(direct.status, 200);
  assert.equal(direct.headers.get("cache-control"), "no-store");
  const dm = (await direct.json()).conversation;
  const created = await call("POST", "/api/chat/conversations", { body: { tenantId: "acme", title: "Team", memberIds: ["bob", "carol"] } });
  assert.equal(created.status, 201);
  const group = (await created.json()).conversation;

  const sent = await call("POST", `/api/chat/conversations/${dm.id}/messages`, { body: { body: "hello", clientId: "k1" } });
  assert.equal(sent.status, 201);
  assert.equal((await sent.json()).message.seq, 1);
  const replay = await call("POST", `/api/chat/conversations/${dm.id}/messages`, { body: { body: "hello", clientId: "k1" } });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).created, false);
  await call("POST", `/api/chat/conversations/${dm.id}/messages`, { body: { body: "second", clientId: "k2" } });

  const history = await call("GET", `/api/chat/conversations/${dm.id}/messages?limit=1&beforeSeq=3`, { user: "bob", origin: null });
  assert.deepEqual((await history.json()).messages.map((m) => m.body), ["second"]);
  const after = await call("GET", `/api/chat/conversations/${dm.id}/messages?afterSeq=0`, { user: "bob", origin: null });
  assert.equal((await after.json()).messages.length, 2);

  const inbox = await (await call("GET", "/api/chat/conversations?tenantId=acme&limit=10", { user: "bob", origin: null })).json();
  assert.deepEqual(inbox.conversations.map((c) => [c.id, c.unread]), [[dm.id, 2], [group.id, 0]]);
  assert.deepEqual(await (await call("GET", "/api/chat/unread?tenantId=acme", { user: "bob", origin: null })).json(),
    { conversations: [{ conversationId: dm.id, unread: 2 }], total: 2 });
  assert.deepEqual(await (await call("POST", `/api/chat/conversations/${dm.id}/read`, { user: "bob", body: { seq: 2 } })).json(), { lastReadSeq: 2 });

  const edited = await call("PATCH", `/api/chat/messages/${dm.id}/1`, { body: { body: "hello!" } });
  assert.equal((await edited.json()).message.body, "hello!");
  const deleted = await call("DELETE", `/api/chat/messages/${dm.id}/1`);
  assert.equal((await deleted.json()).message.body, null);
  assert.equal((await call("DELETE", `/api/chat/messages/${dm.id}/1`)).status, 410);

  assert.equal((await (await call("GET", `/api/chat/conversations/${group.id}/members`, { origin: null })).json()).members.length, 3);
  assert.equal((await (await call("POST", `/api/chat/conversations/${group.id}/members`, { body: { userIds: ["dave"] } })).json()).added[0].userId, "dave");
  assert.equal((await call("DELETE", `/api/chat/conversations/${group.id}/members/dave`)).status, 200);
  assert.equal((await call("DELETE", `/api/chat/conversations/${group.id}/members/carol`, { user: "bob" })).status, 403);

  assert.deepEqual(await (await call("POST", "/api/chat/blocks", { user: "bob", body: { userId: "alice" } })).json(), { blocked: true });
  const blocked = await call("POST", `/api/chat/conversations/${dm.id}/messages`, { body: { body: "hi", clientId: "k3" } });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error, "blocked");
  assert.deepEqual(await (await call("DELETE", "/api/chat/blocks/alice", { user: "bob" })).json(), { blocked: false });
});

test("HTTP adapter: origin check, 401, 403, 404, 400, 405 and 413", async () => {
  const { call, chat, say } = http();
  const dm = await chat.openDirect({ userId: "alice" }, { tenantId: "acme", otherUserId: "bob" });
  await say({ userId: "alice" }, dm.id, "x");
  const post = (opts) => call("POST", `/api/chat/conversations/${dm.id}/messages`, { body: { body: "x", clientId: "z" }, ...opts });
  assert.equal((await post({ origin: "https://evil.test" })).status, 403);
  assert.equal((await post({ origin: null })).status, 403);
  assert.equal((await call("DELETE", `/api/chat/messages/${dm.id}/1`, { origin: "https://evil.test" })).status, 403);
  assert.equal((await call("GET", "/api/chat/conversations?tenantId=acme", { user: null })).status, 401);
  assert.equal((await post({ user: null })).status, 401);
  assert.equal((await call("GET", "/api/chat/conversations?tenantId=acme", { user: "eve" })).status, 403);
  assert.equal((await post({ user: "carol" })).status, 404);
  assert.equal((await call("PATCH", `/api/chat/messages/${dm.id}/1`, { user: "bob", body: { body: "mine" } })).status, 403);
  assert.equal((await call("POST", "/api/chat/conversations", { body: [1] })).status, 400);
  assert.equal((await call("POST", "/api/chat/conversations", { raw: "{nope" })).status, 400);
  assert.equal((await call("POST", "/api/chat/conversations", { body: { tenantId: "acme", title: "big", memberIds: [], pad: "x".repeat(3000) } })).status, 413);
  assert.equal((await call("POST", `/api/chat/conversations/${dm.id}/read`, { body: { seq: "1" } })).status, 400);
  assert.equal((await call("GET", `/api/chat/conversations/${dm.id}/messages?limit=abc`, { origin: null })).status, 400);
  assert.equal((await call("GET", `/api/chat/conversations/${dm.id}/messages?limit=500`, { origin: null })).status, 400);
  assert.equal((await call("GET", "/api/chat/conversations?tenantId=acme&cursor=zz!", { origin: null })).status, 400);
  assert.equal((await call("PUT", "/api/chat/conversations")).status, 405);
  assert.equal((await call("GET", "/api/chat/conversations/direct", { origin: null })).status, 405);
  assert.equal((await call("GET", `/api/chat/messages/${dm.id}/1`, { origin: null })).status, 405);
  assert.equal((await call("GET", `/api/chat/messages/${dm.id}/abc`, { origin: null })).status, 404);
  assert.equal((await call("GET", `/api/chat/conversations/${dm.id}/unknown`, { origin: null })).status, 404);
  assert.equal((await call("GET", "/elsewhere")).status, 404);
  const group = await chat.createGroup({ userId: "alice" }, { tenantId: "acme", title: "T", memberIds: [] });
  assert.equal((await call("POST", `/api/chat/conversations/${group.id}/messages`, { body: { body: "solo", clientId: "e1" } })).status, 201);
  assert.equal((await call("POST", `/api/chat/conversations/${group.id}/members`, { body: { userIds: [] } })).status, 400);
});
