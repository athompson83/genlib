// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { CommentError, createComments, extractMentions } from "../.build/modules/comments/files/core.js";
import { MemoryCommentStore } from "../.build/modules/comments/files/memory-store.js";
import { createCommentHandler } from "../.build/modules/comments/files/http.js";

const MINUTE = 60_000;
// alice and bob are acme members, mod moderates acme, viewer may only read acme, eve belongs to globex.
const members = new Map([
  ["alice", { acme: "member" }], ["bob", { acme: "member" }], ["carol", { acme: "member" }], ["dave", { acme: "member" }],
  ["mod", { acme: "moderator" }], ["viewer", { acme: "viewer" }], ["eve", { globex: "member" }],
]);
async function authorize(actor, action, { tenantId }) {
  const role = members.get(actor.userId)?.[tenantId];
  if (!role) return false;
  if (action === "read") return true;
  if (action === "post") return role === "member" || role === "moderator";
  return role === "moderator";
}

const alice = { userId: "alice" }, bob = { userId: "bob" }, carol = { userId: "carol" }, dave = { userId: "dave" };
const mod = { userId: "mod" }, viewer = { userId: "viewer" }, eve = { userId: "eve" };
const task = { tenantId: "acme", resourceType: "task", resourceId: "t-1" };

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const store = new MemoryCommentStore();
  const comments = createComments({
    store, authorize, now: () => now, newId: () => `c-${String(++counter).padStart(4, "0")}`, ...extra,
  });
  // Each post happens one second after the previous one so ordering is unambiguous.
  const post = async (actor, input) => { now += 1000; return comments.post(actor, { ...task, ...input }); };
  return { store, comments, post, advance: (ms) => { now += ms; } };
}
const code = (expected) => (error) => error instanceof CommentError && error.code === expected;

test("posting and threading: replies nest up to maxDepth and inherit the resource", async () => {
  const { comments, post } = setup({ maxDepth: 2 });
  const top = await post(alice, { body: "  First!  " });
  assert.equal(top.body, "First!");
  assert.equal(top.depth, 0);
  assert.equal(top.parentId, null);
  assert.equal(top.authorId, "alice");
  assert.equal(top.status, "visible");
  assert.equal(top.flagCount, undefined, "only moderators see flag counts");
  const reply = await post(bob, { body: "reply", parentId: top.id });
  assert.equal(reply.depth, 1);
  const deeper = await post(alice, { body: "deeper", parentId: reply.id });
  assert.equal(deeper.depth, 2);
  await assert.rejects(post(bob, { body: "too deep", parentId: deeper.id }), code("too-deep"));
  await assert.rejects(post(alice, { body: "   " }), code("invalid-body"));
  await assert.rejects(post(alice, { body: "x".repeat(10_001) }), code("invalid-body"));
  await assert.rejects(post(alice, { body: 42 }), code("invalid-body"));
  await assert.rejects(comments.post(alice, { ...task, resourceType: "bad type!", body: "x" }), code("invalid-resource"));
  await assert.rejects(comments.post(alice, { ...task, tenantId: "../x", body: "x" }), code("invalid-tenant"));
  assert.throws(() => setup({ maxDepth: -1 }), RangeError);
  assert.throws(() => setup({ reactions: [] }), RangeError);
});

test("a parent on another resource, another tenant or unknown is refused with one code", async () => {
  const { comments, post } = setup();
  const onOther = await post(alice, { resourceId: "t-2", body: "other task" });
  await assert.rejects(post(bob, { body: "cross-resource", parentId: onOther.id }), code("invalid-parent"));
  await assert.rejects(post(bob, { body: "unknown", parentId: "c-9999" }), code("invalid-parent"));
  const foreign = await comments.post(eve, { tenantId: "globex", resourceType: "task", resourceId: "t-1", body: "globex" });
  await assert.rejects(post(bob, { body: "cross-tenant", parentId: foreign.id }), code("invalid-parent"));
  const top = await post(alice, { body: "to delete" });
  await comments.remove(alice, top.id);
  await assert.rejects(post(bob, { body: "reply to deleted", parentId: top.id }), code("invalid-parent"));
});

test("mentions are extracted, deduplicated and not taken from email addresses", async () => {
  const { post } = setup();
  const comment = await post(alice, { body: "Hi @bob and @Carol.Smith, cc @bob @BOB. Mail me at me@example.com @x-y." });
  assert.deepEqual(comment.mentions, ["bob", "Carol.Smith", "x-y"]);
  assert.deepEqual(extractMentions("@" + "a".repeat(65)), []);
  assert.deepEqual(extractMentions("no mentions here"), []);
});

test("edit window: the author edits within it, then only a moderator may edit", async () => {
  const { comments, post, advance } = setup();
  const comment = await post(alice, { body: "typo" });
  advance(MINUTE);
  const edited = await comments.edit(alice, comment.id, "fixed @bob");
  assert.equal(edited.body, "fixed @bob");
  assert.deepEqual(edited.mentions, ["bob"]);
  assert.equal(typeof edited.editedAt, "number");
  await assert.rejects(comments.edit(bob, comment.id, "not mine"), code("forbidden"));
  advance(15 * MINUTE);
  await assert.rejects(comments.edit(alice, comment.id, "too late"), code("edit-window-closed"));
  const moderated = await comments.edit(mod, comment.id, "moderator edit");
  assert.equal(moderated.body, "moderator edit");
  assert.equal(moderated.flagCount, 0, "moderators see the flag count");
  await assert.rejects(comments.edit(alice, comment.id, ""), code("invalid-body"));
});

test("sanitize transforms stored rich text and empties are refused", async () => {
  const { post } = setup({ sanitize: (body) => body.replace(/<script[\s\S]*?<\/script>/gi, "") });
  assert.equal((await post(alice, { body: "<b>hi</b><script>x()</script>" })).body, "<b>hi</b>");
  await assert.rejects(post(alice, { body: "<script>x()</script>" }), code("invalid-body"));
});

test("soft delete clears the body, keeps replies and the thread readable", async () => {
  const { comments, post } = setup();
  const top = await post(alice, { body: "parent @bob" });
  const reply = await post(bob, { body: "child", parentId: top.id });
  await assert.rejects(comments.remove(bob, top.id), code("forbidden"));
  const removed = await comments.remove(alice, top.id);
  assert.equal(removed.body, null);
  assert.deepEqual(removed.mentions, []);
  assert.equal(typeof removed.deletedAt, "number");
  assert.equal(removed.replyCount, 1);
  await assert.rejects(comments.remove(alice, top.id), code("deleted"));
  await assert.rejects(comments.edit(alice, top.id, "revive"), code("deleted"));
  const { comments: listed } = await comments.list(bob, task);
  assert.equal(listed[0].id, top.id);
  assert.equal(listed[0].body, null);
  assert.equal(listed[0].replies[0].id, reply.id);
  assert.equal(listed[0].replies[0].body, "child");
  // A moderator can remove anyone's comment.
  assert.equal((await comments.remove(mod, reply.id)).body, null);
});

test("list: newest first, opaque cursor, reply previews oldest first and reply counts", async () => {
  const { comments, post } = setup({ previewReplies: 2 });
  const tops = [];
  for (let i = 1; i <= 5; i++) tops.push(await post(alice, { body: `top ${i}` }));
  const replies = [];
  for (let i = 1; i <= 3; i++) replies.push(await post(bob, { body: `reply ${i}`, parentId: tops[4].id }));
  await post(alice, { body: "nested", parentId: replies[0].id });
  await post(alice, { resourceId: "t-2", body: "elsewhere" });

  const first = await comments.list(alice, { ...task, limit: 2 });
  assert.deepEqual(first.comments.map((c) => c.body), ["top 5", "top 4"]);
  assert.equal(first.comments[0].replyCount, 3);
  assert.deepEqual(first.comments[0].replies.map((c) => c.body), ["reply 1", "reply 2"]);
  assert.equal(first.comments[0].replies[0].replyCount, 1);
  assert.equal(first.comments[1].replyCount, 0);
  assert.deepEqual(first.comments[1].replies, []);
  assert.equal(typeof first.nextCursor, "string");
  assert.ok(!first.nextCursor.includes("c-"), "the cursor is opaque");
  const second = await comments.list(alice, { ...task, limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.comments.map((c) => c.body), ["top 3", "top 2"]);
  const third = await comments.list(alice, { ...task, limit: 2, cursor: second.nextCursor });
  assert.deepEqual(third.comments.map((c) => c.body), ["top 1"]);
  assert.equal(third.nextCursor, null);

  const page1 = await comments.listReplies(alice, tops[4].id, { limit: 2 });
  assert.deepEqual(page1.replies.map((c) => c.body), ["reply 1", "reply 2"]);
  assert.equal(page1.replies[0].replyCount, 1);
  const page2 = await comments.listReplies(alice, tops[4].id, { limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.replies.map((c) => c.body), ["reply 3"]);
  assert.equal(page2.nextCursor, null);

  await assert.rejects(comments.list(alice, { ...task, cursor: "not-a-cursor!" }), code("invalid-cursor"));
  await assert.rejects(comments.list(alice, { ...task, cursor: "abc" }), code("invalid-cursor"));
  await assert.rejects(comments.list(alice, { ...task, limit: 51 }), code("invalid-limit"));
  await assert.rejects(comments.list(alice, { ...task, limit: 0 }), code("invalid-limit"));
});

test("reactions toggle, count per emoji, report the actor's own and follow the allow-list", async () => {
  const { comments, post } = setup();
  const comment = await post(alice, { body: "react to me" });
  assert.deepEqual(await comments.react(bob, comment.id, "👍"), { reacted: true, reactions: [{ emoji: "👍", count: 1, reacted: true }] });
  await comments.react(carol, comment.id, "👍");
  const mixed = await comments.react(carol, comment.id, "🎉");
  assert.deepEqual(mixed.reactions, [{ emoji: "👍", count: 2, reacted: true }, { emoji: "🎉", count: 1, reacted: true }]);
  const toggled = await comments.react(bob, comment.id, "👍");
  assert.equal(toggled.reacted, false);
  assert.deepEqual(toggled.reactions, [{ emoji: "👍", count: 1, reacted: false }, { emoji: "🎉", count: 1, reacted: false }]);
  await assert.rejects(comments.react(bob, comment.id, "💩"), code("invalid-emoji"));
  await assert.rejects(comments.react(viewer, comment.id, "👍"), code("forbidden"));
  const listed = await comments.list(carol, task);
  assert.deepEqual(listed.comments[0].reactions, [{ emoji: "👍", count: 1, reacted: true }, { emoji: "🎉", count: 1, reacted: true }]);
  const custom = setup({ reactions: ["+1"] });
  const other = await custom.post(alice, { body: "x" });
  await assert.rejects(custom.comments.react(bob, other.id, "👍"), code("invalid-emoji"));
  assert.equal((await custom.comments.react(bob, other.id, "+1")).reacted, true);
});

test("flags: once per user, hidden at the threshold, then moderated", async () => {
  const { comments, post } = setup();
  const comment = await post(alice, { body: "questionable" });
  assert.deepEqual(await comments.flag(bob, comment.id, "spam"), { flagged: true, hidden: false });
  await assert.rejects(comments.flag(bob, comment.id, "spam again"), code("already-flagged"));
  await assert.rejects(comments.flag(carol, comment.id, "  "), code("invalid-reason"));
  assert.equal((await comments.flag(carol, comment.id, "rude")).hidden, false);
  assert.equal((await comments.flag(viewer, comment.id, "off-topic")).hidden, true);

  // Ordinary readers no longer see the body; the author and moderators do.
  assert.equal((await comments.list(bob, task)).comments[0].body, null);
  assert.equal((await comments.list(bob, task)).comments[0].status, "hidden");
  assert.equal((await comments.list(alice, task)).comments[0].body, "questionable");
  const modView = (await comments.list(mod, task)).comments[0];
  assert.equal(modView.body, "questionable");
  assert.equal(modView.flagCount, 3);

  await assert.rejects(comments.moderate(bob, comment.id, "approve"), code("forbidden"));
  await assert.rejects(comments.moderate(mod, comment.id, "delete"), code("invalid-action"));
  const approved = await comments.moderate(mod, comment.id, "approve");
  assert.equal(approved.status, "approved");
  assert.equal((await comments.list(bob, task)).comments[0].body, "questionable");
  // An approved comment is not auto-hidden by further flags; a moderator can still hide it.
  assert.equal((await comments.flag(dave, comment.id, "still bad")).hidden, false);
  assert.equal((await comments.moderate(mod, comment.id, "hide")).status, "hidden");
  assert.equal((await comments.list(bob, task)).comments[0].body, null);
});

test("tenant isolation and authorization: other tenants see not-found, denied actions are forbidden", async () => {
  const { comments, post } = setup();
  const comment = await post(alice, { body: "acme only" });
  await assert.rejects(comments.list(eve, task), code("forbidden"));
  await assert.rejects(comments.post(viewer, { ...task, body: "read-only" }), code("forbidden"));
  await assert.rejects(comments.post(eve, { ...task, body: "intruder" }), code("forbidden"));
  for (const attempt of [
    comments.edit(eve, comment.id, "x"), comments.remove(eve, comment.id), comments.react(eve, comment.id, "👍"),
    comments.flag(eve, comment.id, "x"), comments.moderate(eve, comment.id, "hide"), comments.listReplies(eve, comment.id),
  ]) await assert.rejects(attempt, code("not-found"));
  await assert.rejects(comments.edit(alice, "../etc", "x"), code("not-found"));
  // Globex's own list of the same resource id is empty: tenants never share threads.
  assert.deepEqual((await comments.list(eve, { ...task, tenantId: "globex" })).comments, []);
  assert.equal((await comments.list(viewer, task)).comments.length, 1);
});

function http() {
  const { comments } = setup();
  const users = { alice, bob, carol, dave, mod, viewer, eve };
  const handler = createCommentHandler({
    comments, prefix: "/api/comments/", allowedOrigins: ["https://app.test"],
    authenticate: async (request) => users[request.headers.get("x-test-user")] ?? null,
  });
  const call = (method, path, { user = "alice", body, origin = "https://app.test", raw } = {}) => handler(new Request("https://app.test" + path, {
    method, headers: { ...(user ? { "x-test-user": user } : {}), ...(origin ? { origin } : {}), ...(body !== undefined || raw ? { "content-type": "application/json" } : {}) },
    ...(raw ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  }));
  return { call };
}

test("HTTP adapter: every route with its status code", async () => {
  const { call } = http();
  const created = await call("POST", "/api/comments", { body: { ...task, body: "hello @bob" } });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  const { comment } = await created.json();
  assert.deepEqual(comment.mentions, ["bob"]);
  const reply = await call("POST", "/api/comments", { user: "bob", body: { ...task, body: "hi", parentId: comment.id } });
  assert.equal(reply.status, 201);
  const replyId = (await reply.json()).comment.id;

  const listed = await call("GET", "/api/comments?tenantId=acme&resourceType=task&resourceId=t-1&limit=10", { origin: null });
  assert.equal(listed.status, 200);
  const page = await listed.json();
  assert.equal(page.comments[0].replyCount, 1);
  assert.equal(page.nextCursor, null);
  const replies = await call("GET", `/api/comments/${comment.id}/replies?limit=5`, { origin: null });
  assert.deepEqual((await replies.json()).replies.map((r) => r.id), [replyId]);

  assert.equal((await call("PATCH", `/api/comments/${comment.id}`, { body: { body: "edited" } })).status, 200);
  const reacted = await call("POST", `/api/comments/${comment.id}/reactions`, { user: "bob", body: { emoji: "❤️" } });
  assert.deepEqual(await reacted.json(), { reacted: true, reactions: [{ emoji: "❤️", count: 1, reacted: true }] });
  assert.equal((await call("POST", `/api/comments/${comment.id}/flag`, { user: "bob", body: { reason: "spam" } })).status, 200);
  assert.equal((await call("POST", `/api/comments/${comment.id}/flag`, { user: "bob", body: { reason: "spam" } })).status, 409);
  const moderated = await call("POST", `/api/comments/${comment.id}/moderate`, { user: "mod", body: { action: "hide" } });
  assert.equal((await moderated.json()).comment.status, "hidden");
  const removed = await call("DELETE", `/api/comments/${replyId}`, { user: "bob" });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).comment.body, null);
  assert.equal((await call("DELETE", `/api/comments/${replyId}`, { user: "bob" })).status, 410);
});

test("HTTP adapter: origin check, 401, 403, 404, 400 and 405", async () => {
  const { call } = http();
  const { comment } = await (await call("POST", "/api/comments", { body: { ...task, body: "x" } })).json();
  assert.equal((await call("POST", "/api/comments", { origin: "https://evil.test", body: { ...task, body: "x" } })).status, 403);
  assert.equal((await call("POST", "/api/comments", { origin: null, body: { ...task, body: "x" } })).status, 403);
  assert.equal((await call("DELETE", `/api/comments/${comment.id}`, { origin: "https://evil.test" })).status, 403);
  assert.equal((await call("GET", "/api/comments?tenantId=acme&resourceType=task&resourceId=t-1", { user: null })).status, 401);
  assert.equal((await call("POST", "/api/comments", { user: null, body: { ...task, body: "x" } })).status, 401);
  assert.equal((await call("GET", "/api/comments?tenantId=acme&resourceType=task&resourceId=t-1", { user: "eve" })).status, 403);
  assert.equal((await call("PATCH", `/api/comments/${comment.id}`, { user: "bob", body: { body: "mine now" } })).status, 403);
  assert.equal((await call("PATCH", `/api/comments/${comment.id}`, { user: "eve", body: { body: "x" } })).status, 404);
  assert.equal((await call("POST", `/api/comments/${comment.id}/moderate`, { user: "bob", body: { action: "hide" } })).status, 403);
  assert.equal((await call("POST", `/api/comments/${comment.id}/moderate`, { user: "mod", body: { action: "nuke" } })).status, 400);
  assert.equal((await call("POST", `/api/comments/${comment.id}/reactions`, { body: { emoji: "🤡" } })).status, 400);
  assert.equal((await call("POST", "/api/comments", { body: [1] })).status, 400);
  assert.equal((await call("POST", "/api/comments", { raw: "{nope" })).status, 400);
  assert.equal((await call("GET", "/api/comments?tenantId=acme&resourceType=task&resourceId=t-1&limit=abc", { origin: null })).status, 400);
  assert.equal((await call("GET", "/api/comments?tenantId=acme&resourceType=task&resourceId=t-1&cursor=zz!", { origin: null })).status, 400);
  assert.equal((await call("PUT", "/api/comments")).status, 405);
  assert.equal((await call("GET", `/api/comments/${comment.id}`, { origin: null })).status, 405);
  assert.equal((await call("GET", `/api/comments/${comment.id}/unknown`, { origin: null })).status, 404);
  assert.equal((await call("GET", "/elsewhere")).status, 404);
});
