// SPDX-License-Identifier: Apache-2.0
// chat on real PostgreSQL semantics (PGlite, Postgres compiled to WASM, one connection): schema.sql applies, the
// SQL store passes the core behaviors, seq allocation is gap-free under concurrent sends, concurrent openDirect
// calls from both sides create one conversation, and concurrent retries of one clientId store one message.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ChatError, createChat } from "../.build/modules/chat/files/core.js";
import { createSqlChatStore } from "../.build/modules/chat/files/sql-store.js";
import { createChatHandler } from "../.build/modules/chat/files/http.js";

const schema = readFileSync(new URL("../modules/chat/files/schema.sql", import.meta.url), "utf8");
const tenants = new Map([["alice", ["acme"]], ["bob", ["acme"]], ["carol", ["acme"]], ["dave", ["acme"]], ["eve", ["globex"]]]);
const inTenant = (userId, tenantId) => tenants.get(userId)?.includes(tenantId) ?? false;
const authorize = async (actor, action, { tenantId, userId }) => inTenant(actor.userId, tenantId) && (action === "use" || inTenant(userId, tenantId));
const executor = (db) => ({ query: (text, params) => db.query(text, params), transaction: (work) => db.transaction((tx) => work({ query: (text, params) => tx.query(text, params) })) });
const alice = { userId: "alice" }, bob = { userId: "bob" }, carol = { userId: "carol" }, dave = { userId: "dave" }, eve = { userId: "eve" };
const code = (expected) => (error) => error instanceof ChatError && error.code === expected;

async function setup(extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  let counter = 0;
  const chat = createChat({ store: createSqlChatStore(executor(db)), authorize, now: () => now, newId: () => `id-${String(++counter).padStart(4, "0")}`, ...extra });
  let client = 0;
  const say = async (actor, id, body) => { now += 1000; return (await chat.send(actor, id, { body, clientId: `c${++client}` })).message; };
  return { db, chat, say, advance: (ms) => { now += ms; } };
}

test("schema applies; the SQL store requires transactions and safe table names", async () => {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(schema); // idempotent
  assert.throws(() => createSqlChatStore({ query: (t, p) => db.query(t, p) }), TypeError);
  assert.throws(() => createSqlChatStore(executor(db), { tables: { messages: "bad; drop" } }), RangeError);
});

test("SQL: direct conversations are idempotent, including concurrent opens from both sides", async () => {
  const { db, chat } = await setup();
  const first = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  assert.equal((await chat.openDirect(bob, { tenantId: "acme", otherUserId: "alice" })).id, first.id);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => chat.openDirect(i % 2 ? carol : dave, { tenantId: "acme", otherUserId: i % 2 ? "dave" : "carol" })));
  assert.equal(new Set(results.map((item) => item.id)).size, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM chat_conversations WHERE kind = 'direct'")).rows[0].n, 2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM chat_members WHERE conversation_id = $1", [results[0].id])).rows[0].n, 2);
});

test("SQL: 20 concurrent sends get seq 1..20; concurrent retries of one clientId store one message", async () => {
  const { db, chat } = await setup();
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob", "carol"] });
  const senders = [alice, bob, carol];
  const sends = await Promise.all(Array.from({ length: 20 }, (_, i) => chat.send(senders[i % 3], group.id, { body: `m${i}`, clientId: `p${i}` })));
  assert.deepEqual(sends.map((s) => s.message.seq).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  const stored = (await db.query("SELECT seq FROM chat_messages WHERE conversation_id = $1 ORDER BY seq", [group.id])).rows.map((r) => Number(r.seq));
  assert.deepEqual(stored, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(Number((await db.query("SELECT last_seq FROM chat_conversations WHERE id = $1", [group.id])).rows[0].last_seq), 20);
  const retries = await Promise.all(Array.from({ length: 8 }, () => chat.send(bob, group.id, { body: "once", clientId: "retry-1" })));
  assert.equal(retries.filter((r) => r.created).length, 1);
  assert.equal(new Set(retries.map((r) => r.message.id)).size, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM chat_messages WHERE client_id = 'retry-1'")).rows[0].n, 1);
  assert.equal(Number((await db.query("SELECT last_seq FROM chat_conversations WHERE id = $1", [group.id])).rows[0].last_seq), 21, "no seq is burned by a retry");
});

test("SQL: group admin rules, last-admin promotion and removed-member history", async () => {
  const { chat, say, advance } = await setup({ maxMembers: 4 });
  const group = await chat.createGroup(alice, { tenantId: "acme", title: "Team", memberIds: ["bob"] });
  advance(1000);
  await chat.addMembers(alice, group.id, ["carol", "dave"]);
  await assert.rejects(chat.addMembers(alice, group.id, ["eve"]), code("forbidden"));
  await assert.rejects(chat.addMembers(bob, group.id, ["eve"]), code("forbidden"));
  await assert.rejects(chat.removeMember(bob, group.id, "carol"), code("forbidden"));
  await say(alice, group.id, "one");
  await chat.removeMember(alice, group.id, "carol");
  await say(bob, group.id, "two");
  assert.deepEqual((await chat.history(carol, group.id)).messages.map((m) => m.body), ["one"]);
  await assert.rejects(chat.send(carol, group.id, { body: "x", clientId: "x" }), code("not-member"));
  await chat.leave(alice, group.id);
  assert.deepEqual((await chat.members(bob, group.id)).map((m) => [m.userId, m.role]), [["bob", "admin"], ["dave", "member"]]);
  const readded = await chat.addMembers(bob, group.id, ["carol"]);
  assert.equal(readded[0].leftAt, null);
  assert.deepEqual((await chat.history(carol, group.id)).messages.map((m) => m.body), ["one", "two"]);
  await chat.addMembers(bob, group.id, ["alice"]);
  await assert.rejects(chat.addMembers(bob, group.id, ["eve"]), code("forbidden"));
  tenants.set("frank", ["acme"]);
  try {
    await assert.rejects(chat.addMembers(bob, group.id, ["frank"]), code("too-many-members"));
  } finally {
    tenants.delete("frank");
  }
});

test("SQL: edit window, soft delete, history paging, markRead and unread counts", async () => {
  const { chat, say, advance } = await setup();
  const dm = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  for (let i = 1; i <= 6; i++) await say(alice, dm.id, `m${i}`);
  const edited = await chat.edit(alice, dm.id, 6, "m6!");
  assert.equal(edited.body, "m6!");
  advance(16 * 60_000);
  await assert.rejects(chat.edit(alice, dm.id, 6, "late"), code("edit-window-closed"));
  await assert.rejects(chat.delete(bob, dm.id, 5), code("forbidden"));
  assert.equal((await chat.delete(alice, dm.id, 5)).body, null);
  await assert.rejects(chat.delete(alice, dm.id, 5), code("deleted"));
  const page = await chat.history(bob, dm.id, { limit: 4 });
  assert.deepEqual(page.messages.map((m) => [m.seq, m.body]), [[3, "m3"], [4, "m4"], [5, null], [6, "m6!"]]);
  assert.equal(page.hasMore, true);
  assert.deepEqual((await chat.history(bob, dm.id, { beforeSeq: 3 })).messages.map((m) => m.seq), [1, 2]);
  assert.deepEqual((await chat.history(bob, dm.id, { afterSeq: 4, limit: 1 })).messages.map((m) => m.seq), [5]);
  assert.deepEqual(await chat.unreadCounts(bob, "acme"), { conversations: [{ conversationId: dm.id, unread: 5 }], total: 5 });
  assert.deepEqual(await chat.markRead(bob, dm.id, 3), { lastReadSeq: 3 });
  assert.deepEqual(await chat.markRead(bob, dm.id, 1), { lastReadSeq: 3 });
  assert.deepEqual(await chat.unreadCounts(bob, "acme"), { conversations: [{ conversationId: dm.id, unread: 2 }], total: 2 });
  assert.deepEqual(await chat.markRead(bob, dm.id, 100), { lastReadSeq: 6 });
  // Concurrent markRead calls end at the highest value.
  await say(alice, dm.id, "m7");
  await say(alice, dm.id, "m8");
  await Promise.all([8, 7, 6, 8, 7].map((seq) => chat.markRead(bob, dm.id, seq)));
  assert.deepEqual(await chat.markRead(bob, dm.id, 0), { lastReadSeq: 8 });
});

test("SQL: inbox order, previews, unread, cursor; blocking; tenant isolation", async () => {
  const { chat, say, advance } = await setup();
  const withBob = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "bob" });
  advance(1000);
  const withCarol = await chat.openDirect(alice, { tenantId: "acme", otherUserId: "carol" });
  advance(1000);
  const group = await chat.createGroup(dave, { tenantId: "acme", title: "Team", memberIds: ["alice"] });
  await say(bob, withBob.id, "from bob");
  await say(carol, withCarol.id, "from carol");
  const inbox = await chat.listConversations(alice, "acme");
  assert.deepEqual(inbox.conversations.map((c) => [c.id, c.unread, c.lastMessage?.body ?? null]),
    [[withCarol.id, 1, "from carol"], [withBob.id, 1, "from bob"], [group.id, 0, null]]);
  const page1 = await chat.listConversations(alice, "acme", { limit: 1 });
  const page2 = await chat.listConversations(alice, "acme", { limit: 1, cursor: page1.nextCursor });
  const page3 = await chat.listConversations(alice, "acme", { limit: 1, cursor: page2.nextCursor });
  assert.deepEqual([page1, page2, page3].map((p) => p.conversations[0].id), [withCarol.id, withBob.id, group.id]);
  assert.equal(page3.nextCursor, null);

  await chat.block(alice, "bob");
  await chat.block(alice, "bob"); // idempotent
  await assert.rejects(chat.send(bob, withBob.id, { body: "hi", clientId: "b1" }), code("blocked"));
  await assert.rejects(chat.send(alice, withBob.id, { body: "hi", clientId: "a1" }), code("blocked"));
  await chat.unblock(alice, "bob");
  await say(bob, withBob.id, "unblocked");

  await assert.rejects(chat.history(eve, withBob.id), code("not-found"));
  await assert.rejects(chat.listConversations(eve, "acme"), code("forbidden"));
  await assert.rejects(chat.openDirect(alice, { tenantId: "acme", otherUserId: "eve" }), code("forbidden"));
  const globex = await chat.createGroup(eve, { tenantId: "globex", title: "G", memberIds: [] });
  await assert.rejects(chat.history(alice, globex.id), code("not-found"));
  assert.deepEqual((await chat.listConversations(eve, "globex")).conversations.map((c) => c.id), [globex.id]);
});

test("SQL: HTTP routes over the PostgreSQL store", async () => {
  const { chat } = await setup();
  const handler = createChatHandler({
    chat, prefix: "/chat", allowedOrigins: ["https://app.test"],
    authenticate: async (request) => { const id = request.headers.get("x-user"); return id ? { userId: id } : null; },
  });
  const call = (method, path, user, body) => handler(new Request("https://app.test" + path, {
    method, headers: { "x-user": user, origin: "https://app.test", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const dm = (await (await call("POST", "/chat/conversations/direct", "alice", { tenantId: "acme", userId: "bob" })).json()).conversation;
  const statuses = await Promise.all(Array.from({ length: 5 }, (_, i) => call("POST", `/chat/conversations/${dm.id}/messages`, i % 2 ? "alice" : "bob", { body: `m${i}`, clientId: `h${i}` }).then((r) => r.status)));
  assert.deepEqual(statuses, [201, 201, 201, 201, 201]);
  const history = await (await call("GET", `/chat/conversations/${dm.id}/messages?afterSeq=0`, "bob")).json();
  assert.deepEqual(history.messages.map((m) => m.seq), [1, 2, 3, 4, 5]);
  assert.equal((await call("PATCH", `/chat/messages/${dm.id}/1`, "bob", { body: "edited" })).status, 200);
  assert.equal((await call("DELETE", `/chat/messages/${dm.id}/1`, "bob")).status, 200);
  assert.equal((await (await call("POST", `/chat/conversations/${dm.id}/read`, "alice", { seq: 5 })).json()).lastReadSeq, 5);
  assert.equal((await (await call("GET", "/chat/unread?tenantId=acme", "alice")).json()).total, 0);
  assert.equal((await call("POST", "/chat/blocks", "alice", { userId: "bob" })).status, 200);
  assert.equal((await call("POST", `/chat/conversations/${dm.id}/messages`, "bob", { body: "x", clientId: "late" })).status, 403);
});
