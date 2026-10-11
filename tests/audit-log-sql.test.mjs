// SPDX-License-Identifier: Apache-2.0
// audit-log on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies; an entry commits or
// rolls back with the business change in the caller's transaction; triggers make audit_log append-only; tampering by
// someone who bypasses the triggers is detected by verifyChain; and the retention purge keeps the chain verifiable.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { AuditLogError, createAuditLog } from "../.build/modules/audit-log/files/core.js";
import { createSqlAuditStore } from "../.build/modules/audit-log/files/sql-store.js";

const schema = readFileSync(new URL("../modules/audit-log/files/schema.sql", import.meta.url), "utf8");
const authorize = async (actor, _action, { tenantId }) => (actor.userId === "alice" && tenantId === "acme") || (actor.userId === "eve" && tenantId === "globex");
const executor = (db) => ({
  query: (text, params) => db.query(text, params),
  transaction: (work) => db.transaction((tx) => work(executor(tx))),
});
const alice = { userId: "alice" }, eve = { userId: "eve" };
const DAY = 86_400_000;
const entry = (over = {}) => ({ tenantId: "acme", actor: { id: "alice" }, action: "project.rename", target: { type: "project", id: "p-1" }, outcome: "success", requestId: "req-1", ...over });

async function setup(extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec("CREATE TABLE projects (id text PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL)");
  let now = Date.UTC(2026, 0, 1);
  let counter = 0;
  const store = createSqlAuditStore(executor(db));
  const audit = createAuditLog({ store, authorize, retentionMs: 30 * DAY, now: () => now, newId: () => `e-${String(++counter).padStart(4, "0")}`, ...extra });
  return { db, store, audit, advance: (ms) => { now += ms; }, at: () => now };
}

/** Simulates a database owner editing rows directly, bypassing the append-only triggers. */
async function asOwner(db, sql, params = []) {
  await db.exec("ALTER TABLE audit_log DISABLE TRIGGER USER; ALTER TABLE audit_log_heads DISABLE TRIGGER USER");
  try { if (params.length) await db.query(sql, params); else await db.exec(sql); } finally {
    await db.exec("ALTER TABLE audit_log ENABLE TRIGGER USER; ALTER TABLE audit_log_heads ENABLE TRIGGER USER");
  }
}

test("schema applies and the SQL store records, queries, exports and verifies", async () => {
  const { db, audit, advance } = await setup();
  for (let i = 0; i < 4; i++) { await audit.record(null, entry({ requestId: `req-${i}`, actor: { id: i % 2 ? "bob" : "alice" }, details: { i, password: "pw" } })); advance(1000); }
  await audit.record(null, entry({ tenantId: "globex", actor: { id: "eve" } }));
  const row = (await db.query("SELECT seq, actor_id, outcome, request_id, details FROM audit_log WHERE tenant_id = 'acme' AND seq = 1")).rows[0];
  assert.deepEqual(row, { seq: 1, actor_id: "alice", outcome: "success", request_id: "req-0", details: { i: 0, password: "[REDACTED]" } });
  const page1 = await audit.query(alice, { tenantId: "acme", limit: 3 });
  assert.deepEqual(page1.entries.map((e) => e.seq), [4, 3, 2]);
  const page2 = await audit.query(alice, { tenantId: "acme", limit: 3, cursor: page1.nextCursor });
  assert.deepEqual(page2.entries.map((e) => e.seq), [1]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", actorId: "bob" })).entries.map((e) => e.seq), [4, 2]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", actionPrefix: "project." })).entries.length, 4);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", action: "project.delete" })).entries.length, 0);
  const start = Date.UTC(2026, 0, 1);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", from: start + 1000, to: start + 3000 })).entries.map((e) => e.seq), [3, 2]);
  await assert.rejects(audit.query(eve, { tenantId: "acme" }), (error) => error instanceof AuditLogError && error.code === "forbidden");
  assert.deepEqual((await audit.query(eve, { tenantId: "globex" })).entries.map((e) => e.tenantId), ["globex"]);
  let ndjson = "";
  for await (const chunk of await audit.export(alice, { tenantId: "acme", format: "ndjson", pageSize: 2 })) ndjson += chunk;
  assert.deepEqual(ndjson.trim().split("\n").map((line) => JSON.parse(line).seq), [4, 3, 2, 1]);
  assert.equal((await audit.verifyChain("acme")).ok, true);
  assert.equal((await audit.verifyChain("globex")).ok, true);
});

test("atomic with the change: an entry commits and rolls back with the business row in one transaction", async () => {
  const { db, audit } = await setup();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO projects (id, tenant_id, name) VALUES ('p-1', 'acme', 'Apollo')");
    await audit.record(executor(tx), entry({ action: "project.create", details: { name: "Apollo" } }));
  });
  await assert.rejects(db.transaction(async (tx) => {
    await tx.query("UPDATE projects SET name = 'Hermes' WHERE id = 'p-1'");
    await audit.record(executor(tx), entry({ details: { from: "Apollo", to: "Hermes" } }));
    throw new Error("business rule failed after the audit entry was written");
  }), /business rule failed/);
  // An invalid audit entry also rolls the change back.
  await assert.rejects(db.transaction(async (tx) => {
    await tx.query("UPDATE projects SET name = 'Zeus' WHERE id = 'p-1'");
    await audit.record(executor(tx), entry({ outcome: "maybe" }));
  }), (error) => error instanceof AuditLogError && error.code === "invalid-outcome");
  assert.equal((await db.query("SELECT name FROM projects WHERE id = 'p-1'")).rows[0].name, "Apollo");
  const rows = (await db.query("SELECT seq, action FROM audit_log ORDER BY seq")).rows;
  assert.deepEqual(rows, [{ seq: 1, action: "project.create" }]);
  assert.equal((await db.query("SELECT seq FROM audit_log_heads WHERE tenant_id = 'acme'")).rows[0].seq, 1, "the head rolled back too");
  const next = await audit.record(null, entry());
  assert.equal(next.seq, 2);
  assert.equal((await audit.verifyChain("acme")).ok, true);
});

test("append-only: UPDATE, DELETE and TRUNCATE are refused, and the head and anchor cannot be moved directly", async () => {
  const { db, audit } = await setup();
  await audit.record(null, entry());
  await audit.record(null, entry({ requestId: "req-2" }));
  await assert.rejects(db.query("UPDATE audit_log SET outcome = 'failure' WHERE seq = 1"), /append-only/);
  await assert.rejects(db.query("DELETE FROM audit_log WHERE seq = 2"), /append-only/);
  await assert.rejects(db.query("TRUNCATE audit_log"), /append-only/);
  await assert.rejects(db.query("UPDATE audit_log_heads SET seq = 1, hash = 'x' WHERE tenant_id = 'acme'"), /head changes only by appending/);
  await assert.rejects(db.query("UPDATE audit_log_heads SET anchor_seq = 1, anchor_hash = 'x' WHERE tenant_id = 'acme'"), /anchor changes only through audit_log_purge/);
  await assert.rejects(db.query("DELETE FROM audit_log_heads"), /DELETE refused/);
  await assert.rejects(db.query("INSERT INTO audit_log_heads (tenant_id, seq, hash, anchor_seq, anchor_hash) VALUES ('new', 5, 'x', 0, 'x')"), /genesis/);
  const head = (await db.query("SELECT hash FROM audit_log_heads WHERE tenant_id = 'acme'")).rows[0].hash;
  await assert.rejects(db.query(
    "INSERT INTO audit_log (tenant_id, seq, id, at, actor_type, actor_id, action, outcome, prev_hash, hash) VALUES ('acme', 5, 'x', 0, 'user', 'a', 'x', 'success', $1, 'h')", [head],
  ), /does not extend the chain/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n, 2);
  assert.equal((await audit.verifyChain("acme")).ok, true);
});

test("tampering that bypasses the triggers is detected: edited, deleted, reordered rows and a rewritten tail", async () => {
  const { db, audit } = await setup();
  for (let i = 0; i < 5; i++) await audit.record(null, entry({ requestId: `req-${i}` }));
  const checkpoint = await audit.checkpoint("acme");
  const fresh = async () => { const s = await setup(); for (let i = 0; i < 5; i++) await s.audit.record(null, entry({ requestId: `req-${i}` })); return s; };

  await asOwner(db, "UPDATE audit_log SET details = '{\"note\":\"edited\"}' WHERE seq = 2");
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "hash-mismatch", seq: 2 });

  const deleted = await fresh();
  await asOwner(deleted.db, "DELETE FROM audit_log WHERE seq = 3");
  assert.deepEqual(await deleted.audit.verifyChain("acme"), { ok: false, reason: "sequence-gap", seq: 3 });

  const reordered = await fresh();
  await asOwner(reordered.db, "UPDATE audit_log SET seq = 100 WHERE seq = 2; UPDATE audit_log SET seq = 2 WHERE seq = 3; UPDATE audit_log SET seq = 3 WHERE seq = 100");
  assert.deepEqual(await reordered.audit.verifyChain("acme"), { ok: false, reason: "broken-link", seq: 2 });

  const tail = await fresh();
  await asOwner(tail.db, "DELETE FROM audit_log WHERE seq = 5");
  assert.deepEqual(await tail.audit.verifyChain("acme"), { ok: false, reason: "sequence-gap", seq: 5 });

  // Deleting the tail and rolling the head back looks consistent, but an externally stored checkpoint exposes it.
  const rolled = await fresh();
  const saved = await rolled.audit.checkpoint("acme");
  const prior = (await rolled.db.query("SELECT hash FROM audit_log WHERE seq = 4")).rows[0].hash;
  await asOwner(rolled.db, "DELETE FROM audit_log WHERE seq = 5");
  await asOwner(rolled.db, "UPDATE audit_log_heads SET seq = 4, hash = $1", [prior]);
  assert.equal((await rolled.audit.verifyChain("acme")).ok, true);
  assert.deepEqual(await rolled.audit.verifyChain("acme", saved), { ok: false, reason: "checkpoint-mismatch", seq: 5 });
  assert.equal(checkpoint.seq, 5);
});

test("retention purge through audit_log_purge keeps the chain verifiable and still detects tampering", async () => {
  const { db, audit, store, advance } = await setup();
  for (let i = 0; i < 4; i++) await audit.record(null, entry({ requestId: `old-${i}` }));
  advance(10 * DAY);
  for (let i = 0; i < 2; i++) await audit.record(null, entry({ requestId: `new-${i}` }));
  const checkpoint = await audit.checkpoint("acme");
  advance(25 * DAY);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme" })).entries.map((e) => e.requestId), ["new-1", "new-0"], "expired entries are hidden before the purge");
  assert.deepEqual(await audit.purgeExpired(), { purged: 4, cutoff: Date.UTC(2026, 0, 1) + 35 * DAY - 30 * DAY });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n, 2);
  const head = await store.head("acme");
  assert.equal(head.anchorSeq, 4);
  assert.deepEqual(await audit.verifyChain("acme", checkpoint), { ok: true, count: 2, head });
  await audit.record(null, entry({ requestId: "after" }));
  assert.equal((await audit.verifyChain("acme")).ok, true);
  // The purge flag is transaction-local: it does not leak to later statements.
  await assert.rejects(db.query("DELETE FROM audit_log WHERE seq = 5"), /append-only/);
  // Deleting the oldest remaining row without the purge function breaks the link to the anchor.
  await asOwner(db, "DELETE FROM audit_log WHERE seq = 5");
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "sequence-gap", seq: 5 });
  // Nothing old enough: no-op.
  assert.equal(Number((await db.query("SELECT audit_log_purge('acme', 0) AS n")).rows[0].n), 0);
  assert.equal(Number((await db.query("SELECT audit_log_purge('nobody', 9e15::bigint) AS n")).rows[0].n), 0);
});

test("concurrent transactions for one tenant serialize on the head lock and form one chain", async () => {
  const { db, audit } = await setup();
  await Promise.all(Array.from({ length: 12 }, (_, i) => db.transaction(async (tx) => {
    await tx.query("INSERT INTO projects (id, tenant_id, name) VALUES ($1, 'acme', $2)", [`p-${i}`, `P${i}`]);
    await audit.record(executor(tx), entry({ action: "project.create", target: { type: "project", id: `p-${i}` } }));
  })));
  const result = await audit.verifyChain("acme");
  assert.equal(result.ok, true);
  assert.equal(result.count, 12);
});

test("roles: the app role appends but cannot move the anchor or delete rows, even after setting the purge flag", async () => {
  const { db, audit, advance } = await setup();
  await db.exec(`
    CREATE ROLE app_role NOLOGIN;
    CREATE ROLE sloppy_role NOLOGIN;
    CREATE ROLE retention_role NOLOGIN;
    GRANT USAGE ON SCHEMA public TO app_role, sloppy_role, retention_role;
    GRANT SELECT, INSERT ON audit_log TO app_role;
    GRANT SELECT ON audit_log_heads TO app_role;
    GRANT EXECUTE ON FUNCTION audit_log_lock_head(text) TO app_role;
    GRANT ALL ON projects TO app_role;
    -- A misconfigured role with direct write grants: the triggers must still refuse it.
    GRANT SELECT, INSERT, UPDATE, DELETE ON audit_log, audit_log_heads TO sloppy_role;
    GRANT EXECUTE ON FUNCTION audit_log_purge(text, bigint) TO retention_role;
  `);
  await db.exec("SET ROLE app_role");
  for (let i = 0; i < 3; i++) await audit.record(null, entry({ requestId: `req-${i}` }));
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO projects (id, tenant_id, name) VALUES ('p-9', 'acme', 'Nine')");
    await audit.record(executor(tx), entry({ action: "project.create" }));
  });
  const hash1 = (await db.query("SELECT hash FROM audit_log WHERE seq = 1")).rows[0].hash;
  await db.query("SELECT set_config('audit_log.purging', 'on', false)");
  await assert.rejects(db.query("UPDATE audit_log_heads SET anchor_seq = 1, anchor_hash = $1", [hash1]), /permission denied/);
  await assert.rejects(db.query("DELETE FROM audit_log WHERE seq = 1"), /permission denied/);
  await assert.rejects(db.query("SELECT audit_log_purge('acme', 9000000000000000)"), /permission denied/);
  await db.exec("RESET ROLE; SET ROLE sloppy_role");
  await db.query("SELECT set_config('audit_log.purging', 'on', false)");
  await assert.rejects(db.query("UPDATE audit_log_heads SET anchor_seq = 1, anchor_hash = $1", [hash1]), /anchor changes only through audit_log_purge/);
  await assert.rejects(db.query("UPDATE audit_log_heads SET seq = seq + 1, hash = 'x'"), /head changes only by appending/);
  await assert.rejects(db.query("DELETE FROM audit_log WHERE seq = 1"), /append-only/);
  await assert.rejects(db.query("UPDATE audit_log SET outcome = 'failure'"), /append-only/);
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n, 4);
  assert.equal((await audit.verifyChain("acme")).ok, true);
  advance(31 * DAY);
  await db.exec("SET ROLE retention_role");
  assert.equal((await audit.purgeExpired("acme")).purged, 4);
  await db.exec("RESET ROLE");
  const head = (await db.query("SELECT seq, anchor_seq FROM audit_log_heads WHERE tenant_id = 'acme'")).rows[0];
  assert.deepEqual(head, { seq: 4, anchor_seq: 4 });
  assert.equal((await audit.verifyChain("acme")).ok, true);
});

test("anchor tampering by a database owner is detected: a purged checkpoint and a faked purge", async () => {
  const { db, audit } = await setup();
  for (let i = 0; i < 8; i++) await audit.record(null, entry({ requestId: `req-${i}` }));
  const hashes = (await db.query("SELECT seq, hash FROM audit_log ORDER BY seq")).rows.map((r) => r.hash);
  const cp5 = { seq: 5, hash: hashes[4] };
  await asOwner(db, "UPDATE audit_log_heads SET anchor_seq = 3, anchor_hash = $1", [hashes[2]]);
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "purged-rows-present", seq: 1 });
  await asOwner(db, "DELETE FROM audit_log WHERE seq <= 6");
  await asOwner(db, "UPDATE audit_log_heads SET anchor_seq = 6, anchor_hash = $1", [hashes[5]]);
  assert.equal((await audit.verifyChain("acme")).ok, true, "without a checkpoint the forged anchor looks like a purge");
  assert.deepEqual(await audit.verifyChain("acme", cp5), { ok: false, reason: "checkpoint-purged", seq: 5 });
});

test("lone surrogates in details are stored as U+FFFD and the jsonb insert does not roll back the change", async () => {
  const { db, audit } = await setup();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO projects (id, tenant_id, name) VALUES ('p-s', 'acme', 'S')");
    await audit.record(executor(tx), entry({ details: { "k\uDC00": "v\uD800" } }));
  });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM projects")).rows[0].n, 1);
  assert.deepEqual((await db.query("SELECT details FROM audit_log")).rows[0].details, { "k�": "v�" });
  assert.equal((await audit.verifyChain("acme")).ok, true);
});
