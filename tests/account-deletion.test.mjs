// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { AccountDeletionError, createAccountDeletion } from "../.build/modules/account-deletion/files/core.js";
import { MemoryAccountDeletionStore } from "../.build/modules/account-deletion/files/memory-store.js";
import { createAccountDeletionHandler } from "../.build/modules/account-deletion/files/http.js";

const DAY = 86_400_000;
const code = (expected) => (error) => error instanceof AccountDeletionError && error.code === expected;
// Owners may act on themselves; "admin" may act on anyone; everyone else is refused.
const authorize = async (actor, _action, { self }) => self || actor.userId === "admin";

/** A small application database the policy handlers work on. */
function appData() {
  return {
    users: new Map([["alice", { email: "alice@example.com" }], ["bob", { email: "bob@example.com" }], ["carol", { email: "carol@example.com" }]]),
    posts: [{ id: 1, author: "alice" }, { id: 2, author: "bob" }, { id: 3, author: "alice" }],
    comments: [{ id: 1, author: "alice", text: "hi" }, { id: 2, author: "bob", text: "yo" }],
    invoices: [{ id: 1, customer: "alice", total: 10 }],
  };
}

function setup(extra = {}) {
  let now = 1_000_000_000;
  let counter = 0;
  const store = extra.store ?? new MemoryAccountDeletionStore();
  const data = extra.data ?? appData();
  const log = [];
  const revoked = [];
  const policy = extra.policy ?? [
    { name: "posts", action: "delete", reason: "User content is removed", run: async ({ userId }) => { log.push(["posts", userId]); data.posts = data.posts.filter((p) => p.author !== userId); } },
    { name: "comments", action: "anonymize", reason: "Threads stay readable", run: async ({ userId }) => { log.push(["comments", userId]); for (const c of data.comments) if (c.author === userId) c.author = "deleted-user"; } },
    { name: "invoices", action: "retain", reason: "Tax law requires 7 years of invoices" },
    { name: "user", action: "delete", reason: "The account itself", run: async ({ userId }) => { log.push(["user", userId]); data.users.delete(userId); } },
  ];
  const deletion = createAccountDeletion({
    store, authorize, policy, graceMs: 14 * DAY, now: () => now, newId: () => `id-${String(++counter).padStart(4, "0")}`,
    revokeSessions: async (userId) => { revoked.push(userId); }, ...extra.options,
  });
  const fresh = (userId) => ({ userId, authenticatedAt: now });
  return { store, data, log, revoked, deletion, fresh, advance: (ms) => { now += ms; }, at: () => now };
}

test("request requires a signed-in, recently re-authenticated owner", async () => {
  const { deletion, at, advance } = setup();
  await assert.rejects(deletion.request({ userId: "alice" }, { userId: "alice" }), code("reauth-required"));
  await assert.rejects(deletion.request({ userId: "alice", authenticatedAt: at() - 300_001 }, { userId: "alice" }), code("reauth-required"));
  await assert.rejects(deletion.request({ userId: "alice", authenticatedAt: at() + 10 }, { userId: "alice" }), code("reauth-required"));
  await assert.rejects(deletion.request({ userId: "alice", authenticatedAt: at() }, { userId: "bad id!" }), code("invalid-user"));
  await assert.rejects(deletion.request({ userId: "alice", authenticatedAt: at() }, { userId: "alice", reason: "x".repeat(501) }), code("invalid-reason"));
  const signedInAt = at();
  advance(299_000);
  const request = await deletion.request({ userId: "alice", authenticatedAt: signedInAt }, { userId: "alice", reason: "leaving" });
  assert.equal(request.status, "pending");
  assert.equal(request.userId, "alice");
  assert.equal(request.requestedBy, "alice");
  assert.equal(request.reason, "leaving");
  await assert.rejects(deletion.request({ userId: "alice", authenticatedAt: at() }, { userId: "alice" }), code("already-pending"));
});

test("grace period: deletion is scheduled graceMs later and the account is disabled meanwhile", async () => {
  const { deletion, fresh, advance, at, log } = setup();
  assert.equal(await deletion.isDisabled("alice"), false);
  const requestedAt = at();
  const request = await deletion.request(fresh("alice"), { userId: "alice" });
  assert.equal(request.scheduledFor, requestedAt + 14 * DAY);
  assert.equal(await deletion.isDisabled("alice"), true);
  assert.equal(await deletion.isDisabled("bob"), false);
  advance(14 * DAY - 1);
  assert.deepEqual(await deletion.runDue(), { claimed: 0, completed: [], failed: [], lost: [] });
  assert.equal(log.length, 0);
  assert.equal(await deletion.isDisabled("alice"), true);
  advance(1);
  assert.equal((await deletion.runDue()).claimed, 1);
  assert.equal(await deletion.isDisabled("alice"), true, "a deleted account stays disabled");
  // A different grace period is honored, including 0 (due at once).
  const quick = setup({ options: { graceMs: 0 } });
  await quick.deletion.request(quick.fresh("bob"), { userId: "bob" });
  assert.deepEqual((await quick.deletion.runDue()).completed, ["id-0001"]);
});

test("cancel during the grace period restores access; after it ends cancel is too late", async () => {
  const { deletion, fresh, advance, store } = setup();
  await assert.rejects(deletion.cancel(fresh("alice"), { userId: "alice" }), code("not-pending"));
  const first = await deletion.request(fresh("alice"), { userId: "alice" });
  advance(DAY);
  // The owner has no session now; the sign-in flow verified credentials and passes a fresh actor.
  await assert.rejects(deletion.cancel({ userId: "alice", authenticatedAt: 0 }, { userId: "alice" }), code("reauth-required"));
  const cancelled = await deletion.cancel(fresh("alice"), { userId: "alice" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledBy, "alice");
  assert.equal(await deletion.isDisabled("alice"), false);
  await assert.rejects(deletion.cancel(fresh("alice"), { userId: "alice" }), code("not-pending"));
  advance(30 * DAY);
  assert.equal((await deletion.runDue()).claimed, 0, "a cancelled request never runs");
  assert.equal((await store.findById(first.id)).status, "cancelled");
  // A new request after cancelling works; once the period ends it can no longer be cancelled.
  await deletion.request(fresh("alice"), { userId: "alice" });
  advance(14 * DAY);
  await assert.rejects(deletion.cancel(fresh("alice"), { userId: "alice" }), code("too-late"));
  await deletion.runDue();
  await assert.rejects(deletion.cancel(fresh("alice"), { userId: "alice" }), code("too-late"));
  await assert.rejects(deletion.request(fresh("alice"), { userId: "alice" }), code("already-deleted"));
});

test("sessions are revoked on request; a failed revocation schedules nothing", async () => {
  const ok = setup();
  await ok.deletion.request(ok.fresh("alice"), { userId: "alice" });
  assert.deepEqual(ok.revoked, ["alice"]);

  let calls = 0;
  const failing = setup({ options: { revokeSessions: async () => { calls++; throw new Error("session store down"); } } });
  await assert.rejects(failing.deletion.request(failing.fresh("alice"), { userId: "alice" }), code("revoke-failed"));
  assert.equal(calls, 1);
  assert.equal(await failing.deletion.status(failing.fresh("alice"), "alice"), null, "the pending request was discarded");
  assert.equal(await failing.deletion.isDisabled("alice"), false);
  failing.advance(30 * DAY);
  assert.equal((await failing.deletion.runDue()).claimed, 0);
});

test("dependent data is deleted, anonymized or retained per the declared policy, in order", async () => {
  const { deletion, fresh, advance, data, log } = setup();
  assert.deepEqual(deletion.describePolicy(), [
    { name: "posts", action: "delete", reason: "User content is removed" },
    { name: "comments", action: "anonymize", reason: "Threads stay readable" },
    { name: "invoices", action: "retain", reason: "Tax law requires 7 years of invoices" },
    { name: "user", action: "delete", reason: "The account itself" },
  ]);
  const request = await deletion.request(fresh("alice"), { userId: "alice" });
  advance(14 * DAY);
  const result = await deletion.runDue();
  assert.deepEqual(result.completed, [request.id]);
  assert.deepEqual(log, [["posts", "alice"], ["comments", "alice"], ["user", "alice"]]);
  assert.deepEqual(data.posts.map((p) => p.id), [2]);
  assert.deepEqual(data.comments.map((c) => c.author), ["deleted-user", "bob"]);
  assert.deepEqual(data.invoices, [{ id: 1, customer: "alice", total: 10 }], "retained data is kept");
  assert.equal(data.users.has("alice"), false);
  assert.equal(data.users.has("bob"), true);
  const done = await deletion.status(fresh("alice"), "alice");
  assert.deepEqual(done.completedSteps, ["posts", "comments", "invoices", "user"]);
  // The policy is validated up front.
  const base = { store: new MemoryAccountDeletionStore(), authorize, revokeSessions: async () => {} };
  assert.throws(() => createAccountDeletion({ ...base, policy: [] }), RangeError);
  assert.throws(() => createAccountDeletion({ ...base, policy: [{ name: "x", action: "purge", reason: "r", run: async () => {} }] }), RangeError);
  assert.throws(() => createAccountDeletion({ ...base, policy: [{ name: "x", action: "delete", reason: " ", run: async () => {} }] }), RangeError);
  assert.throws(() => createAccountDeletion({ ...base, policy: [{ name: "x", action: "delete", reason: "r" }] }), RangeError);
  assert.throws(() => createAccountDeletion({ ...base, policy: [{ name: "x", action: "retain", reason: "r" }, { name: "x", action: "retain", reason: "r" }] }), RangeError);
  assert.throws(() => createAccountDeletion({ ...base, policy: [{ name: "x", action: "retain", reason: "r" }], graceMs: -1 }), RangeError);
});

test("authorization: only the owner or an authorized admin can request, cancel or read", async () => {
  const { deletion, fresh } = setup();
  await assert.rejects(deletion.request(fresh("bob"), { userId: "alice" }), code("forbidden"));
  await assert.rejects(deletion.status(fresh("bob"), "alice"), code("forbidden"));
  const request = await deletion.request(fresh("admin"), { userId: "alice", reason: "support ticket 42" });
  assert.equal(request.requestedBy, "admin");
  await assert.rejects(deletion.cancel(fresh("bob"), { userId: "alice" }), code("forbidden"));
  assert.equal((await deletion.status(fresh("alice"), "alice")).id, request.id);
  const cancelled = await deletion.cancel(fresh("admin"), { userId: "alice" });
  assert.equal(cancelled.cancelledBy, "admin");
  // Admins must also have authenticated recently.
  await assert.rejects(deletion.request({ userId: "admin" }, { userId: "alice" }), code("reauth-required"));
  // authorize receives the action and whether the actor is the owner.
  const seen = [];
  const spy = setup({ options: { authorize: async (actor, action, target) => { seen.push([actor.userId, action, target]); return true; } } });
  await spy.deletion.request(spy.fresh("alice"), { userId: "alice" });
  await spy.deletion.status(spy.fresh("admin"), "alice");
  assert.deepEqual(seen, [["alice", "request", { userId: "alice", self: true }], ["admin", "read", { userId: "alice", self: false }]]);
});

test("idempotent execution: runs once, retries resume after a failed step and completion is recorded", async () => {
  let failPosts = true;
  const runs = [];
  const policy = [
    { name: "files", action: "delete", reason: "Uploads", run: async () => { runs.push("files"); } },
    { name: "posts", action: "delete", reason: "Posts", run: async () => { runs.push("posts"); if (failPosts) throw new Error("db timeout"); } },
    { name: "user", action: "delete", reason: "Account", run: async () => { runs.push("user"); } },
  ];
  const { deletion, fresh, advance, at, store } = setup({ policy, options: { retryDelayMs: 60_000 } });
  const request = await deletion.request(fresh("alice"), { userId: "alice" });
  advance(14 * DAY);
  const first = await deletion.runDue();
  assert.deepEqual(first, { claimed: 1, completed: [], failed: [{ id: request.id, step: "posts", error: "db timeout" }], lost: [] });
  let row = await store.findById(request.id);
  assert.equal(row.status, "executing");
  assert.deepEqual(row.completedSteps, ["files"]);
  assert.equal(row.lastError, "posts: db timeout");
  assert.equal(row.claimToken, null);
  assert.equal(row.claimExpiresAt, at() + 60_000);
  // Before the retry delay nothing is claimed.
  assert.equal((await deletion.runDue()).claimed, 0);
  failPosts = false;
  advance(60_000);
  const second = await deletion.runDue();
  assert.deepEqual(second.completed, [request.id]);
  assert.deepEqual(runs, ["files", "posts", "posts", "user"], "files did not run again");
  row = await store.findById(request.id);
  assert.equal(row.status, "completed");
  assert.equal(row.completedAt, at());
  assert.equal(row.attempts, 2);
  assert.equal(row.lastError, null);
  assert.deepEqual(row.completedSteps, ["files", "posts", "user"]);
  // Running again does nothing.
  advance(DAY);
  assert.equal((await deletion.runDue()).claimed, 0);
  assert.equal(runs.length, 4);
  await assert.rejects(deletion.runDue({ limit: 0 }), code("invalid-limit"));
});

test("a crashed worker's lease expires; the next run resumes and the stale worker cannot record or complete", async () => {
  let release;
  const hang = new Promise((resolve) => { release = resolve; });
  let crashed = true;
  const runs = [];
  const policy = [
    { name: "files", action: "delete", reason: "Uploads", run: async () => { runs.push("files"); } },
    { name: "posts", action: "delete", reason: "Posts", run: async () => { runs.push("posts"); if (crashed) { crashed = false; await hang; } } },
    { name: "user", action: "delete", reason: "Account", run: async () => { runs.push("user"); } },
  ];
  const { deletion, fresh, advance, store } = setup({ policy, options: { leaseMs: 60_000 } });
  const request = await deletion.request(fresh("alice"), { userId: "alice" });
  advance(14 * DAY);
  const stale = deletion.runDue(); // hangs inside "posts", like a worker that died
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await deletion.runDue()).claimed, 0, "the lease is still held");
  advance(60_001);
  const resumed = await deletion.runDue();
  assert.deepEqual(resumed.completed, [request.id]);
  assert.deepEqual(runs, ["files", "posts", "posts", "user"]);
  release();
  const late = await stale;
  assert.deepEqual(late.lost, [request.id]);
  assert.deepEqual(late.completed, []);
  const row = await store.findById(request.id);
  assert.equal(row.status, "completed");
  assert.deepEqual(row.completedSteps, ["files", "posts", "user"]);
});

test("concurrent runDue calls on the memory store execute each account once", async () => {
  const runs = [];
  const policy = [{ name: "user", action: "delete", reason: "Account", run: async ({ userId }) => { await new Promise((r) => setImmediate(r)); runs.push(userId); } }];
  const { deletion, fresh, advance } = setup({ policy });
  for (const user of ["alice", "bob", "carol"]) await deletion.request(fresh(user), { userId: user });
  advance(14 * DAY);
  const results = await Promise.all([deletion.runDue({ limit: 2 }), deletion.runDue({ limit: 2 }), deletion.runDue({ limit: 2 })]);
  assert.equal(results.reduce((sum, r) => sum + r.claimed, 0), 3);
  assert.deepEqual(runs.sort(), ["alice", "bob", "carol"]);
});

test("HTTP handler: request, status, cancel, auth, origin check, no-store and error mapping", async () => {
  const { deletion, at, advance } = setup();
  const sessions = new Map([["a", { userId: "alice", authenticatedAt: at() }], ["b", { userId: "bob", authenticatedAt: at() }], ["old", { userId: "alice", authenticatedAt: 0 }]]);
  const handler = createAccountDeletionHandler({
    deletion, prefix: "/api/account-deletion", allowedOrigins: ["https://app.example"],
    authenticate: async (request) => sessions.get(request.headers.get("x-session") ?? "") ?? null,
  });
  const call = (method, path, { session = "a", origin = "https://app.example", body } = {}) => handler(new Request(`https://app.example/api/account-deletion${path}`, {
    method, headers: { "x-session": session, origin, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body }),
  }));
  let response = await call("GET", "/me");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { deletion: null });
  assert.equal((await call("GET", "/me", { session: "none" })).status, 401);
  assert.equal((await call("POST", "/me", { origin: "https://evil.example" })).status, 403);
  assert.equal((await call("POST", "/me", { session: "old" })).status, 401);
  assert.equal((await call("POST", "/alice", { session: "b" })).status, 403);
  assert.equal((await call("POST", "/me", { body: "{" })).status, 400);
  assert.equal((await call("POST", "/me", { body: JSON.stringify({ reason: "x".repeat(5000) }) })).status, 413);
  response = await call("POST", "/me", { body: JSON.stringify({ reason: "bye" }) });
  assert.equal(response.status, 202);
  const created = (await response.json()).deletion;
  assert.equal(created.status, "pending");
  assert.equal(created.reason, "bye");
  assert.ok(!("claimToken" in created), "lease token is never exposed");
  assert.equal((await call("POST", "/me")).status, 409);
  assert.equal((await call("GET", "/alice")).status, 200);
  assert.equal((await call("PUT", "/me")).status, 405);
  assert.equal((await call("GET", "/a/b")).status, 404);
  response = await call("DELETE", "/me");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deletion.status, "cancelled");
  assert.equal((await call("DELETE", "/me")).status, 409);
  advance(1);
  assert.equal((await call("GET", "/me")).status, 200);
});

test("lease renewal: a queued request whose lease expired is skipped, not run after another worker took it", async () => {
  const trace = [];
  let ctl;
  let nested = false;
  const step = (name) => ({
    name, action: "delete", reason: "Data",
    run: async ({ userId }) => {
      trace.push(`${ctl.worker}:${name}:${userId}`);
      ctl.advance(900);
      if (name === "s2" && userId === "u1" && !nested) {
        // Worker B starts while A is still finishing u1; u2's lease (claimed with u1) has expired.
        nested = true;
        ctl.worker = "B";
        const b = await ctl.deletion.runDue();
        assert.deepEqual(b.completed, ["id-0002"]);
        ctl.worker = "A";
      }
    },
  });
  ctl = setup({ policy: [step("s1"), step("s2")], options: { leaseMs: 1000 } });
  ctl.worker = "A";
  await ctl.deletion.request(ctl.fresh("u1"), { userId: "u1" });
  ctl.advance(1);
  await ctl.deletion.request(ctl.fresh("u2"), { userId: "u2" });
  ctl.advance(14 * DAY);
  const a = await ctl.deletion.runDue({ limit: 2 });
  assert.deepEqual(trace, ["A:s1:u1", "A:s2:u1", "B:s1:u2", "B:s2:u2"], "A never runs a handler on u2");
  assert.deepEqual(a.completed, ["id-0001"]);
  assert.deepEqual(a.lost, ["id-0002"]);
});

test("a request racing completion cannot reopen a deleted account", async () => {
  const ctl = setup({ options: { graceMs: 0 } });
  await ctl.deletion.request(ctl.fresh("alice"), { userId: "alice" });
  await ctl.deletion.runDue();
  // Simulate the race: the request's read happens before complete() is visible.
  const real = ctl.store.findLatest.bind(ctl.store);
  let stale = true;
  ctl.store.findLatest = async (userId) => { if (stale) { stale = false; return null; } return real(userId); };
  await assert.rejects(ctl.deletion.request(ctl.fresh("alice"), { userId: "alice" }), code("already-deleted"));
  assert.equal((await real("alice")).status, "completed");
  assert.equal(ctl.revoked.length, 1, "no second revocation or pending row");
  assert.equal(await ctl.deletion.isDisabled("alice"), true);
});
