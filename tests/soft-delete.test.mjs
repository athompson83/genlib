// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RETENTION_MS, SoftDeleteError, createSoftDelete } from "../.build/modules/soft-delete/files/core.js";
import { MemorySoftDeleteStore } from "../.build/modules/soft-delete/files/memory-store.js";
import { createTrashHandler } from "../.build/modules/soft-delete/files/http.js";

// alice is an editor of acme, viewer may only read acme, eve is an editor of globex.
const members = new Map([["alice", { acme: "editor" }], ["viewer", { acme: "viewer" }], ["eve", { globex: "editor" }]]);
async function authorize(actor, action, { tenantId }) {
  const role = members.get(actor.userId)?.[tenantId];
  if (!role) return false;
  return action === "read" || role === "editor";
}
const alice = { userId: "alice" }, viewer = { userId: "viewer" }, eve = { userId: "eve" };
const code = (expected) => (error) => error instanceof SoftDeleteError && error.code === expected;
const DAY = 24 * 60 * 60 * 1000;

const entities = {
  projects: { unique: [["slug"]], children: [{ entity: "tasks", foreignKey: "project_id" }] },
  tasks: { children: [{ entity: "comments", foreignKey: "task_id" }] },
  comments: {},
  folders: { unique: [["parent_id", "name"]], children: [{ entity: "folders", foreignKey: "parent_id" }] },
};

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const store = new MemorySoftDeleteStore({ unique: { projects: [["slug"]], folders: [["parent_id", "name"]] } });
  const trash = createSoftDelete({
    store, entities, authorize, retentionMs: 7 * DAY, now: () => now, newId: () => `b-${String(++counter).padStart(4, "0")}`, ...extra,
  });
  // acme: project p1 (slug launch) with tasks t1, t2; t1 has comments c1, c2. globex: project g1 with the same slug.
  store.insert("projects", "acme", "p1", { slug: "launch", name: "Launch" });
  store.insert("tasks", "acme", "t1", { project_id: "p1", title: "Plan" });
  store.insert("tasks", "acme", "t2", { project_id: "p1", title: "Ship" });
  store.insert("comments", "acme", "c1", { task_id: "t1", body: "first" });
  store.insert("comments", "acme", "c2", { task_id: "t1", body: "second" });
  store.insert("projects", "globex", "g1", { slug: "launch", name: "Globex launch" });
  store.insert("tasks", "globex", "t1", { project_id: "g1", title: "Same id, other tenant" });
  return { store, trash, advance: (ms) => { now += ms; }, at: () => now };
}

test("soft delete marks deleted_at, deleted_by and delete_batch instead of removing the row", async () => {
  const { store, trash, at } = setup();
  const { entry, records } = await trash.remove(alice, { tenantId: "acme", entity: "comments", id: "c2" });
  assert.deepEqual(records, [{ entity: "comments", id: "c2" }]);
  assert.deepEqual(entry, { id: "b-0001", tenantId: "acme", entity: "comments", recordId: "c2", deletedAt: at(), deletedBy: "alice", count: 1, purgeAfter: at() + 7 * DAY });
  const row = store.all("comments").find((r) => r.id === "c2");
  assert.deepEqual(row, { id: "c2", tenantId: "acme", deletedAt: at(), deletedBy: "alice", batchId: "b-0001", data: { task_id: "t1", body: "second" } });
  assert.equal(store.all("comments").length, 2, "the row is kept");
  await assert.rejects(trash.remove(alice, { tenantId: "acme", entity: "comments", id: "c2" }), code("already-deleted"));
  await assert.rejects(trash.remove(alice, { tenantId: "acme", entity: "comments", id: "nope" }), code("not-found"));
  await assert.rejects(trash.remove(alice, { tenantId: "acme", entity: "users", id: "c1" }), code("invalid-entity"));
  await assert.rejects(trash.remove(alice, { tenantId: "acme", entity: "comments", id: "bad id!" }), code("invalid-id"));
  await assert.rejects(trash.remove(alice, { tenantId: "", entity: "comments", id: "c1" }), code("invalid-tenant"));
});

test("hidden by default: get, live lists, search and counts exclude soft-deleted records", async () => {
  const { store, trash } = setup();
  await trash.remove(alice, { tenantId: "acme", entity: "tasks", id: "t2" });
  await assert.rejects(trash.get(alice, { tenantId: "acme", entity: "tasks", id: "t2" }), code("not-found"));
  assert.equal((await trash.get(viewer, { tenantId: "acme", entity: "tasks", id: "t1" })).data.title, "Plan");
  const live = store.live("tasks", "acme");
  assert.deepEqual(live.map((r) => r.id), ["t1"]);
  assert.equal(live.length, 1, "count");
  assert.deepEqual(live.filter((r) => /ship/i.test(String(r.data.title))), [], "search");
  assert.equal(JSON.stringify(live).includes("Ship"), false, "export");
});

test("restore within the retention window brings the record back intact with its children", async () => {
  const { store, trash, advance } = setup();
  const before = store.all("comments").concat(store.all("tasks"));
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  advance(7 * DAY - 1);
  const restored = await trash.restore(alice, { tenantId: "acme", trashId: entry.id });
  assert.deepEqual(restored.records.map((r) => `${r.entity}:${r.id}`).sort(), ["comments:c1", "comments:c2", "projects:p1", "tasks:t1", "tasks:t2"]);
  assert.deepEqual(store.all("comments").concat(store.all("tasks")), before, "rows, data and foreign keys are unchanged");
  assert.equal((await trash.listTrash(alice, { tenantId: "acme" })).entries.length, 0);
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: entry.id }), code("not-found"));
});

test("restore after the retention window is refused with retention-expired", async () => {
  const { trash, advance } = setup();
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "tasks", id: "t2" });
  advance(7 * DAY);
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: entry.id }), code("retention-expired"));
  assert.equal((await trash.listTrash(alice, { tenantId: "acme" })).entries.length, 1, "still in the trash until purged");
});

test("authorization: delete, restore and the trash are authorized and never cross tenants", async () => {
  const { store, trash } = setup();
  await assert.rejects(trash.remove(viewer, { tenantId: "acme", entity: "tasks", id: "t1" }), code("forbidden"));
  await assert.rejects(trash.remove(eve, { tenantId: "acme", entity: "tasks", id: "t1" }), code("forbidden"));
  // eve may delete in globex, but an acme id there is simply not found; globex's own t1 is a different row.
  await assert.rejects(trash.remove(eve, { tenantId: "globex", entity: "comments", id: "c1" }), code("not-found"));
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "tasks", id: "t1" });
  assert.equal(store.live("tasks", "globex").length, 1, "globex t1 untouched");
  await assert.rejects(trash.listTrash(viewer, { tenantId: "acme" }), code("forbidden"));
  await assert.rejects(trash.listTrash(eve, { tenantId: "acme" }), code("forbidden"));
  assert.deepEqual((await trash.listTrash(eve, { tenantId: "globex" })).entries, []);
  await assert.rejects(trash.restore(viewer, { tenantId: "acme", trashId: entry.id }), code("forbidden"));
  await assert.rejects(trash.restore(eve, { tenantId: "globex", trashId: entry.id }), code("not-found"));
  await assert.rejects(trash.get(eve, { tenantId: "acme", entity: "tasks", id: "t2" }), code("forbidden"));
  assert.equal((await trash.restore(alice, { tenantId: "acme", trashId: entry.id })).records.length, 3);
});

test("uniqueness: restore reports the conflict while a live row holds the unique value, then succeeds", async () => {
  const { store, trash } = setup();
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  // The deleted row does not block a new project with the same slug.
  store.insert("projects", "acme", "p2", { slug: "launch", name: "Relaunch" });
  assert.throws(() => store.insert("projects", "acme", "p3", { slug: "launch" }), code("conflict"));
  const error = await trash.restore(alice, { tenantId: "acme", trashId: entry.id }).catch((e) => e);
  assert.ok(code("conflict")(error));
  assert.deepEqual(error.conflicts, [{ entity: "projects", id: "p1", columns: ["slug"] }]);
  assert.equal(store.live("tasks", "acme").length, 0, "nothing restored on conflict");
  assert.equal((await trash.listTrash(alice, { tenantId: "acme" })).entries.length, 1, "entry kept");
  await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p2" });
  assert.equal((await trash.restore(alice, { tenantId: "acme", trashId: entry.id })).records.length, 5);
  assert.equal(store.live("projects", "acme")[0].data.name, "Launch");
});

test("cascade: children follow the parent's delete and restore; children deleted earlier stay in the trash", async () => {
  const { store, trash } = setup();
  const earlier = await trash.remove(alice, { tenantId: "acme", entity: "comments", id: "c2" });
  const parent = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  assert.deepEqual(parent.records, [
    { entity: "projects", id: "p1" }, { entity: "tasks", id: "t1" }, { entity: "tasks", id: "t2" }, { entity: "comments", id: "c1" },
  ]);
  assert.equal(parent.entry.count, 4);
  for (const table of ["projects", "tasks", "comments"]) assert.equal(store.live(table, "acme").length, 0, table);
  assert.equal(store.all("comments").find((r) => r.id === "c2").batchId, earlier.entry.id, "earlier delete keeps its own batch");
  // A cascaded child cannot be restored on its own while the parent is in the trash.
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: earlier.entry.id }), code("parent-deleted"));
  await trash.restore(alice, { tenantId: "acme", trashId: parent.entry.id });
  assert.deepEqual(store.live("comments", "acme").map((r) => r.id), ["c1"], "c2 was deleted on its own and stays deleted");
  await trash.restore(alice, { tenantId: "acme", trashId: earlier.entry.id });
  assert.equal(store.live("comments", "acme").length, 2);
});

test("cascade follows a self-referencing tree and the relation graph is validated", async () => {
  const { store, trash } = setup();
  store.insert("folders", "acme", "root", { parent_id: null, name: "root" });
  store.insert("folders", "acme", "a", { parent_id: "root", name: "a" });
  store.insert("folders", "acme", "b", { parent_id: "a", name: "b" });
  const { entry, records } = await trash.remove(alice, { tenantId: "acme", entity: "folders", id: "root" });
  assert.deepEqual(records.map((r) => r.id), ["root", "a", "b"]);
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: "missing" }), code("not-found"));
  await trash.restore(alice, { tenantId: "acme", trashId: entry.id });
  assert.equal(store.live("folders", "acme").length, 3);
  const make = (e) => createSoftDelete({ store, authorize, entities: e });
  assert.throws(() => make({ "Bad-Name": {} }), RangeError);
  assert.throws(() => make({ a: { children: [{ entity: "missing", foreignKey: "a_id" }] } }), RangeError);
  assert.throws(() => make({ a: { children: [{ entity: "a", foreignKey: "x; drop" }] } }), RangeError);
  assert.throws(() => make({ a: { unique: [[]] } }), RangeError);
  assert.throws(() => createSoftDelete({ store, authorize, entities, retentionMs: 0 }), RangeError);
  assert.equal(DEFAULT_RETENTION_MS, 30 * DAY);
});

test("purge: entries past retention are purged children first, and a second run purges nothing", async () => {
  const { store, trash, advance } = setup();
  const old = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  advance(DAY);
  const recent = await trash.remove(eve, { tenantId: "globex", entity: "tasks", id: "t1" });
  advance(6 * DAY);
  assert.deepEqual(await trash.purgeExpired({ batchSize: 1 }), { entries: 1, records: 5, failed: [] });
  assert.equal(store.all("tasks").filter((r) => r.tenantId === "acme").length, 0, "acme rows are gone");
  assert.equal(store.all("tasks").filter((r) => r.tenantId === "globex").length, 1, "the newer entry waits for its retention");
  assert.deepEqual(await trash.purgeExpired(), { entries: 0, records: 0, failed: [] }, "idempotent");
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: old.entry.id }), code("not-found"));
  advance(DAY);
  assert.deepEqual(await trash.purgeExpired(), { entries: 1, records: 1, failed: [] });
  assert.deepEqual(await trash.purgeExpired(), { entries: 0, records: 0, failed: [] });
  assert.equal(store.all("tasks").length, 0);
  assert.equal(recent.entry.purgeAfter, recent.entry.deletedAt + 7 * DAY);
  await assert.rejects(trash.purgeExpired({ batchSize: 0 }), RangeError);
});

test("purge: a failing entry is kept and reported while later entries are still purged", async () => {
  // A store whose permanent delete fails for acme, like a foreign key held by a live row added later.
  class FaultyStore extends MemorySoftDeleteStore {
    broken = true;
    async purgeIds(tenantId, table, ids) {
      if (this.broken && tenantId === "acme") throw Object.assign(new Error("violates foreign key constraint with row (secret)"), { code: "23503" });
      return super.purgeIds(tenantId, table, ids);
    }
  }
  let now = 1_000_000;
  const store = new FaultyStore({ unique: { projects: [["slug"]] } });
  store.insert("projects", "acme", "p1", { slug: "launch" });
  store.insert("tasks", "acme", "t1", { project_id: "p1" });
  store.insert("projects", "globex", "g1", { slug: "launch" });
  let counter = 0;
  const trash = createSoftDelete({ store, entities, authorize, retentionMs: DAY, now: () => now, newId: () => `b-${++counter}` });
  const stuck = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  now += 10;
  await trash.remove(eve, { tenantId: "globex", entity: "projects", id: "g1" });
  now += DAY;
  const failed = [{ id: stuck.entry.id, tenantId: "acme", entity: "projects", code: "23503" }];
  assert.deepEqual(await trash.purgeExpired({ batchSize: 1 }), { entries: 1, records: 1, failed }, "globex is purged past the stuck entry");
  assert.equal(store.all("projects").filter((r) => r.tenantId === "globex").length, 0);
  assert.equal(store.all("tasks").length, 1, "the failed entry's rows are rolled back, not lost");
  assert.deepEqual((await trash.listTrash(alice, { tenantId: "acme" })).entries.map((e) => e.id), [stuck.entry.id], "entry kept");
  assert.equal(JSON.stringify(failed).includes("secret"), false);
  assert.deepEqual(await trash.purgeExpired(), { entries: 0, records: 0, failed }, "retried on the next run");
  store.broken = false;
  assert.deepEqual(await trash.purgeExpired(), { entries: 1, records: 2, failed: [] });
});

test("trash lists newest first with keyset cursors and an entity filter", async () => {
  const { trash, advance } = setup();
  for (const id of ["c1", "c2"]) { await trash.remove(alice, { tenantId: "acme", entity: "comments", id }); advance(10); }
  await trash.remove(alice, { tenantId: "acme", entity: "tasks", id: "t2" });
  const page1 = await trash.listTrash(alice, { tenantId: "acme", limit: 2 });
  assert.deepEqual(page1.entries.map((e) => e.recordId), ["t2", "c2"]);
  const page2 = await trash.listTrash(alice, { tenantId: "acme", limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.entries.map((e) => e.recordId), ["c1"]);
  assert.equal(page2.nextCursor, null);
  assert.deepEqual((await trash.listTrash(alice, { tenantId: "acme", entity: "tasks" })).entries.map((e) => e.recordId), ["t2"]);
  await assert.rejects(trash.listTrash(alice, { tenantId: "acme", cursor: "!!" }), code("invalid-cursor"));
  await assert.rejects(trash.listTrash(alice, { tenantId: "acme", limit: 101 }), code("invalid-limit"));
});

test("trash handler: list, restore, conflict body, auth, origin check and no-store", async () => {
  const { store, trash } = setup();
  const users = { "token-alice": alice, "token-eve": eve };
  const handler = createTrashHandler({
    softDelete: trash, prefix: "/api/trash", allowedOrigins: ["https://app.test"],
    authenticate: async (request) => users[request.headers.get("authorization") ?? ""] ?? null,
  });
  const call = (method, path, { token = "token-alice", origin = "https://app.test" } = {}) =>
    handler(new Request(`https://app.test/api/trash${path}`, { method, headers: { authorization: token, origin } }));
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  const list = await call("GET", "?tenantId=acme&limit=10");
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.deepEqual((await list.json()).entries.map((e) => e.id), [entry.id]);
  assert.equal((await call("GET", "?tenantId=acme", { token: "nobody" })).status, 401);
  assert.equal((await call("GET", "?tenantId=acme", { token: "token-eve" })).status, 403);
  assert.equal((await call("GET", "?tenantId=acme&limit=abc")).status, 400);
  assert.equal((await call("POST", `/${entry.id}/restore?tenantId=acme`, { origin: "https://evil.test" })).status, 403);
  store.insert("projects", "acme", "p2", { slug: "launch" });
  const conflict = await call("POST", `/${entry.id}/restore?tenantId=acme`);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {
    error: "conflict", message: "A live record now holds a unique value of a record being restored", conflicts: [{ entity: "projects", id: "p1", columns: ["slug"] }],
  });
  await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p2" });
  const restored = await call("POST", `/${entry.id}/restore?tenantId=acme`);
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).records.length, 5);
  assert.equal((await call("POST", `/${entry.id}/restore?tenantId=acme`)).status, 404);
  assert.equal((await call("GET", `/${entry.id}/restore?tenantId=acme`)).status, 405);
  assert.equal((await call("POST", `/${entry.id}/other?tenantId=acme`)).status, 404);
  assert.equal((await call("GET", "/a/b/c")).status, 404);
});
