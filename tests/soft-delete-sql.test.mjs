// SPDX-License-Identifier: Apache-2.0
// soft-delete on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies next to app tables
// that follow the documented pattern (deleted_at/deleted_by/delete_batch, partial unique indexes WHERE deleted_at IS
// NULL, a live view, plain foreign keys). It proves hidden-by-default counts and search, cascade by batch id, the
// restore conflict on a partial unique index (declared and undeclared), tenant scoping and purge idempotency.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SoftDeleteError, createSoftDelete } from "../.build/modules/soft-delete/files/core.js";
import { createSqlSoftDeleteStore, liveCondition, liveViewSql } from "../.build/modules/soft-delete/files/sql-store.js";

const schema = readFileSync(new URL("../modules/soft-delete/files/schema.sql", import.meta.url), "utf8");
const appTables = `
  CREATE TABLE projects (
    id text PRIMARY KEY, tenant_id text NOT NULL, slug text NOT NULL, name text NOT NULL,
    deleted_at bigint, deleted_by text, delete_batch text,
    CHECK ((deleted_at IS NULL) = (deleted_by IS NULL) AND (deleted_at IS NULL) = (delete_batch IS NULL))
  );
  CREATE UNIQUE INDEX projects_live_slug ON projects (tenant_id, slug) WHERE deleted_at IS NULL;
  CREATE TABLE tasks (
    id text PRIMARY KEY, tenant_id text NOT NULL, project_id text NOT NULL REFERENCES projects (id), title text NOT NULL,
    deleted_at bigint, deleted_by text, delete_batch text
  );
  -- Deliberately not declared in the entity configuration: the store must still report the conflict.
  CREATE UNIQUE INDEX tasks_live_title ON tasks (tenant_id, project_id, title) WHERE deleted_at IS NULL;
  CREATE TABLE comments (
    id text PRIMARY KEY, tenant_id text NOT NULL, task_id text NOT NULL REFERENCES tasks (id), body text NOT NULL,
    deleted_at bigint, deleted_by text, delete_batch text
  );
`;
const entities = {
  projects: { unique: [["slug"]], children: [{ entity: "tasks", foreignKey: "project_id" }] },
  tasks: { children: [{ entity: "comments", foreignKey: "task_id" }] },
  comments: {},
};
const authorize = async (actor, action, { tenantId }) => (actor.userId === "alice" && tenantId === "acme") || (actor.userId === "eve" && tenantId === "globex");
const executor = (db) => ({
  query: (text, params) => db.query(text, params),
  transaction: (work) => db.transaction((tx) => work(executor(tx))),
});
const code = (expected) => (error) => error instanceof SoftDeleteError && error.code === expected;
const alice = { userId: "alice" }, eve = { userId: "eve" };
const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(appTables);
  for (const table of ["projects", "tasks", "comments"]) await db.exec(liveViewSql(table));
  await db.exec(`
    INSERT INTO projects (id, tenant_id, slug, name) VALUES ('p1', 'acme', 'launch', 'Launch'), ('g1', 'globex', 'launch', 'Globex');
    INSERT INTO tasks (id, tenant_id, project_id, title) VALUES ('t1', 'acme', 'p1', 'Plan'), ('t2', 'acme', 'p1', 'Ship'), ('gt1', 'globex', 'g1', 'Plan');
    INSERT INTO comments (id, tenant_id, task_id, body) VALUES ('c1', 'acme', 't1', 'first'), ('c2', 'acme', 't1', 'second');
  `);
  let now = 1_000_000;
  let counter = 0;
  const trash = createSoftDelete({
    store: createSqlSoftDeleteStore(executor(db)), entities, authorize, retentionMs: 7 * DAY,
    now: () => now, newId: () => `b-${String(++counter).padStart(4, "0")}`,
  });
  const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);
  return { db, trash, count, advance: (ms) => { now += ms; }, at: () => now };
}

test("schema applies; delete marks rows and the live view hides them from counts and search", async () => {
  const { db, trash, count, at } = await setup();
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "tasks", id: "t2" });
  const row = (await db.query("SELECT deleted_at, deleted_by, delete_batch, title FROM tasks WHERE id = 't2'")).rows[0];
  assert.deepEqual({ ...row, deleted_at: Number(row.deleted_at) }, { deleted_at: at(), deleted_by: "alice", delete_batch: entry.id, title: "Ship" });
  assert.equal(await count("SELECT count(*) AS n FROM tasks WHERE tenant_id = 'acme'"), 2, "the row is kept");
  assert.equal(await count("SELECT count(*) AS n FROM tasks_live WHERE tenant_id = 'acme'"), 1, "count via the view");
  assert.equal(await count(`SELECT count(*) AS n FROM tasks WHERE tenant_id = 'acme' AND ${liveCondition()}`), 1, "count via the condition");
  assert.equal(await count("SELECT count(*) AS n FROM tasks_live WHERE title ILIKE '%ship%'"), 0, "search");
  assert.equal(liveCondition("t"), "t.deleted_at IS NULL");
  assert.throws(() => liveCondition("t; drop"), RangeError);
  const trashRow = (await db.query("SELECT entity, record_id, count FROM soft_delete_batches")).rows;
  assert.deepEqual(trashRow, [{ entity: "tasks", record_id: "t2", count: 1 }]);
  await assert.rejects(trash.remove(eve, { tenantId: "globex", entity: "tasks", id: "t1" }), code("not-found"), "acme id is invisible to globex");
  await assert.rejects(trash.get(alice, { tenantId: "acme", entity: "tasks", id: "t2" }), code("not-found"));
});

test("cascade by batch: restore brings back exactly the children deleted with the parent", async () => {
  const { db, trash, count } = await setup();
  const earlier = await trash.remove(alice, { tenantId: "acme", entity: "comments", id: "c2" });
  const parent = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  assert.equal(parent.entry.count, 4);
  assert.equal(await count("SELECT count(*) AS n FROM tasks_live WHERE tenant_id = 'acme'"), 0);
  assert.equal(await count("SELECT count(*) AS n FROM comments WHERE delete_batch = $1", [parent.entry.id]), 1);
  assert.equal(await count("SELECT count(*) AS n FROM projects_live WHERE tenant_id = 'globex'"), 1, "other tenant untouched");
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: earlier.entry.id }), code("parent-deleted"));
  const restored = await trash.restore(alice, { tenantId: "acme", trashId: parent.entry.id });
  assert.deepEqual(restored.records.map((r) => `${r.entity}:${r.id}`).sort(), ["comments:c1", "projects:p1", "tasks:t1", "tasks:t2"]);
  assert.deepEqual((await db.query("SELECT id FROM comments_live ORDER BY id")).rows, [{ id: "c1" }]);
  assert.deepEqual((await db.query("SELECT task_id, body FROM comments WHERE id = 'c1'")).rows, [{ task_id: "t1", body: "first" }]);
  await assert.rejects(trash.restore(eve, { tenantId: "globex", trashId: earlier.entry.id }), code("not-found"));
  await trash.restore(alice, { tenantId: "acme", trashId: earlier.entry.id });
  assert.equal(await count("SELECT count(*) AS n FROM comments_live"), 2);
});

test("partial unique index: a restore reports the conflict and changes nothing, then succeeds", async () => {
  const { db, trash, count } = await setup();
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  await db.query("INSERT INTO projects (id, tenant_id, slug, name) VALUES ('p2', 'acme', 'launch', 'Relaunch')");
  await assert.rejects(db.query("INSERT INTO projects (id, tenant_id, slug, name) VALUES ('p3', 'acme', 'launch', 'x')"), /duplicate key/);
  const error = await trash.restore(alice, { tenantId: "acme", trashId: entry.id }).catch((e) => e);
  assert.ok(code("conflict")(error));
  assert.deepEqual(error.conflicts, [{ entity: "projects", id: "p1", columns: ["slug"] }]);
  assert.equal(await count("SELECT count(*) AS n FROM tasks_live WHERE tenant_id = 'acme'"), 0, "children stay deleted");
  assert.equal(await count("SELECT count(*) AS n FROM soft_delete_batches"), 1, "entry kept");
  await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p2" });
  assert.equal((await trash.restore(alice, { tenantId: "acme", trashId: entry.id })).records.length, 5);
});

test("an undeclared unique index violation on restore rolls back and reports conflict", async () => {
  const { db, trash, count } = await setup();
  const { entry } = await trash.remove(alice, { tenantId: "acme", entity: "tasks", id: "t2" });
  await db.query("INSERT INTO tasks (id, tenant_id, project_id, title) VALUES ('t3', 'acme', 'p1', 'Ship')");
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: entry.id }), code("conflict"));
  assert.equal(await count("SELECT count(*) AS n FROM tasks WHERE id = 't2' AND deleted_at IS NOT NULL"), 1, "rolled back");
  assert.equal(await count("SELECT count(*) AS n FROM soft_delete_batches WHERE id = $1", [entry.id]), 1, "entry restored by rollback");
});

test("purge removes expired rows children first under foreign keys, and a second run deletes 0", async () => {
  const { db, trash, count, advance } = await setup();
  await trash.remove(alice, { tenantId: "acme", entity: "comments", id: "c2" });
  await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  advance(DAY);
  await trash.remove(eve, { tenantId: "globex", entity: "tasks", id: "gt1" });
  advance(6 * DAY);
  assert.deepEqual(await trash.purgeExpired({ batchSize: 1 }), { entries: 2, records: 5, failed: [] });
  assert.equal(await count("SELECT count(*) AS n FROM projects WHERE tenant_id = 'acme'"), 0);
  assert.equal(await count("SELECT count(*) AS n FROM comments"), 0);
  assert.equal(await count("SELECT count(*) AS n FROM tasks WHERE tenant_id = 'globex'"), 1, "not yet expired");
  assert.deepEqual(await trash.purgeExpired(), { entries: 0, records: 0, failed: [] });
  advance(DAY);
  assert.deepEqual(await trash.purgeExpired(), { entries: 1, records: 1, failed: [] });
  assert.deepEqual(await trash.purgeExpired(), { entries: 0, records: 0, failed: [] });
  assert.equal(await count("SELECT count(*) AS n FROM soft_delete_batches"), 0);
  assert.equal(await count("SELECT count(*) AS n FROM projects_live"), 1, "live globex project kept");
  assert.throws(() => createSqlSoftDeleteStore(executor(db), { batchTable: "bad; drop table x" }), RangeError);
  assert.throws(() => createSqlSoftDeleteStore({ query: () => {} }), TypeError);
});

test("purge of a parent entry that expires first also removes descendants deleted earlier on their own", async () => {
  const { db, trash, count, advance } = await setup();
  const child = await trash.remove(alice, { tenantId: "acme", entity: "comments", id: "c2" });
  advance(1000);
  // Retention was shortened after the child was deleted, so the parent's entry is due first.
  const short = createSoftDelete({ store: createSqlSoftDeleteStore(executor(db)), entities, authorize, retentionMs: DAY, now: () => 1_001_000, newId: () => "b-short" });
  await short.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  advance(DAY);
  assert.deepEqual(await trash.purgeExpired(), { entries: 1, records: 5, failed: [] }, "the plain foreign keys hold");
  assert.equal(await count("SELECT count(*) AS n FROM comments"), 0);
  await assert.rejects(trash.restore(alice, { tenantId: "acme", trashId: child.entry.id }), code("not-found"));
  advance(6 * DAY);
  assert.deepEqual(await trash.purgeExpired(), { entries: 1, records: 0, failed: [] }, "the dangling entry is cleared");
  assert.equal(await count("SELECT count(*) AS n FROM soft_delete_batches"), 0);
});

test("purge keeps and reports an entry blocked by a live child under the real foreign key and purges the rest", async () => {
  const { db, trash, count, advance } = await setup();
  const stuck = await trash.remove(alice, { tenantId: "acme", entity: "projects", id: "p1" });
  // The app adds a live task under the soft-deleted project; the parent row exists, so the FK accepts it.
  await db.query("INSERT INTO tasks (id, tenant_id, project_id, title) VALUES ('t9', 'acme', 'p1', 'Late')");
  advance(10);
  await trash.remove(eve, { tenantId: "globex", entity: "projects", id: "g1" });
  advance(7 * DAY);
  const failed = [{ id: stuck.entry.id, tenantId: "acme", entity: "projects", code: "23503" }];
  assert.deepEqual(await trash.purgeExpired({ batchSize: 1 }), { entries: 1, records: 2, failed });
  assert.equal(await count("SELECT count(*) AS n FROM projects WHERE tenant_id = 'globex'"), 0, "the other tenant's entry is purged");
  assert.equal(await count("SELECT count(*) AS n FROM tasks WHERE tenant_id = 'acme'"), 3, "rolled back: no acme row lost");
  assert.equal(await count("SELECT count(*) AS n FROM soft_delete_batches WHERE id = $1", [stuck.entry.id]), 1, "entry kept");
  assert.deepEqual(await trash.purgeExpired(), { entries: 0, records: 0, failed });
  await db.query("DELETE FROM tasks WHERE id = 't9'");
  assert.deepEqual(await trash.purgeExpired(), { entries: 1, records: 5, failed: [] });
});
