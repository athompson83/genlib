// SPDX-License-Identifier: Apache-2.0
// rbac on PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL store passes the
// core behaviors, grants are idempotent through the COALESCE unique index, and concurrent revokes of the last two
// owners cannot both succeed. PGlite is one connection, so concurrent calls are interleaved, not truly parallel.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createRbac } from "../.build/modules/rbac/files/core.js";
import { createSqlRbacStore } from "../.build/modules/rbac/files/sql-store.js";

const schema = readFileSync(new URL("../modules/rbac/files/schema.sql", import.meta.url), "utf8");
const ROLES = {
  viewer: { permissions: ["*:read"] },
  editor: { permissions: ["invoice:create", "!invoice:delete"], inherits: ["viewer"] },
  admin: { permissions: ["rbac:manage", "invoice:*"], inherits: ["viewer"] },
  owner: { permissions: ["*"], protected: true },
};
const executor = (db) => ({ query: (text, params) => db.query(text, params) });
const acme = { tenantId: "acme" };

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  const store = createSqlRbacStore(executor(db));
  const rbac = createRbac({ store, roles: ROLES, now: () => now });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "own", role: "owner" });
  return { db, store, rbac, advance: (ms) => { now += ms; }, at: () => now };
}
const count = async (db) => (await db.query("SELECT count(*)::int AS n FROM rbac_assignments")).rows[0].n;

test("schema applies; checks, scope, expiry and idempotent grants on PostgreSQL", async () => {
  const { db, rbac, advance, at } = await setup();
  const first = await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "editor", resourceId: "p1" });
  const again = await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "editor", resourceId: "p1" });
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.deepEqual(again.assignment, first.assignment);
  await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "viewer" });
  await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "viewer" });
  assert.equal(await count(db), 3, "one owner, one scoped editor, one tenant-wide viewer");
  // The unique index treats NULL resource_id as one tenant-wide value even for raw inserts.
  await assert.rejects(db.query("INSERT INTO rbac_assignments (tenant_id, subject_id, role, resource_id, created_at, granted_by) VALUES ('acme', 'u', 'viewer', NULL, 1, 'x')"));
  await assert.rejects(db.query("INSERT INTO rbac_assignments (tenant_id, subject_id, role, resource_id, created_at, granted_by) VALUES ('acme', 'u', 'viewer', '', 1, 'x')"));

  assert.equal((await rbac.can("u", "invoice:create", { tenantId: "acme", resourceId: "p1" })).via, "editor");
  assert.equal((await rbac.can("u", "invoice:create", { tenantId: "acme", resourceId: "p2" })).allowed, false);
  assert.equal((await rbac.can("u", "invoice:delete", { tenantId: "acme", resourceId: "p1" })).reason, "denied-by-rule");
  assert.equal((await rbac.can("u", "report:read", { tenantId: "globex" })).allowed, false);
  await assert.rejects(rbac.grant("u", { tenantId: "acme", subjectId: "v", role: "viewer" }), { code: "forbidden" });

  await rbac.grant("own", { tenantId: "acme", subjectId: "temp", role: "admin", expiresAt: at() + 1000 });
  assert.equal((await rbac.can("temp", "rbac:manage", acme)).allowed, true);
  await assert.rejects(rbac.grant("temp", { tenantId: "acme", subjectId: "x", role: "owner" }), { code: "escalation" });
  advance(1000);
  assert.equal((await rbac.can("temp", "rbac:manage", acme)).allowed, false, "expired");

  const page1 = await rbac.listAssignments("own", "acme", { limit: 2 });
  const page2 = await rbac.listAssignments("own", "acme", { limit: 2, cursor: page1.nextCursor });
  const ids = [...page1.assignments, ...page2.assignments].map((a) => `${a.subjectId}/${a.role}/${a.resourceId ?? ""}`);
  assert.deepEqual(ids, ["own/owner/", "temp/admin/", "u/editor/p1", "u/viewer/"]);
  assert.equal(page2.nextCursor, null);
  assert.deepEqual((await rbac.listAssignments("own", "acme", { subjectId: "u" })).assignments.map((a) => a.role), ["editor", "viewer"]);

  assert.deepEqual(await rbac.revoke("own", { tenantId: "acme", subjectId: "u", role: "editor", resourceId: "p1" }), { removed: true });
  assert.deepEqual(await rbac.revoke("own", { tenantId: "acme", subjectId: "u", role: "editor", resourceId: "p1" }), { removed: false });
  assert.throws(() => createSqlRbacStore(executor(db), { table: "bad; drop table x" }), RangeError);
});

test("last-owner protection on PostgreSQL, including concurrent revokes", async () => {
  const { db, rbac, store, at } = await setup();
  await assert.rejects(rbac.revoke("own", { tenantId: "acme", subjectId: "own", role: "owner" }), { code: "last-owner" });
  await rbac.grant("own", { tenantId: "acme", subjectId: "b", role: "owner" });
  for (let round = 0; round < 5; round += 1) {
    const results = await Promise.allSettled([
      rbac.revoke("own", { tenantId: "acme", subjectId: "b", role: "owner" }),
      rbac.revoke("b", { tenantId: "acme", subjectId: "own", role: "owner" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, `round ${round}`);
    const left = (await db.query("SELECT subject_id FROM rbac_assignments WHERE role = 'owner' AND resource_id IS NULL")).rows;
    assert.equal(left.length, 1);
    const survivor = left[0].subject_id;
    await rbac.grant(survivor, { tenantId: "acme", subjectId: survivor === "own" ? "b" : "own", role: "owner" });
  }
  // Store-level: four concurrent guarded removals of four holders leave at least one.
  for (const id of ["c", "d"]) await rbac.grantAsSystem({ tenantId: "acme", subjectId: id, role: "owner" });
  const removals = await Promise.all(["own", "b", "c", "d"].map((subjectId) =>
    store.remove({ tenantId: "acme", subjectId, role: "owner", resourceId: null }, { protectedRole: true, now: at() })));
  assert.equal(removals.filter((r) => r === "removed").length, 3);
  assert.equal(removals.filter((r) => r === "last-holder").length, 1);
  // An expired holder (for example a legacy row) does not count as a remaining owner.
  const [survivor] = (await db.query("SELECT subject_id FROM rbac_assignments WHERE role = 'owner'")).rows.map((r) => r.subject_id);
  await db.query("INSERT INTO rbac_assignments (tenant_id, subject_id, role, resource_id, expires_at, created_at, granted_by) VALUES ('acme', 'old', 'owner', NULL, $1, 1, 'x')", [at() - 1]);
  assert.equal(await store.remove({ tenantId: "acme", subjectId: survivor, role: "owner", resourceId: null }, { protectedRole: true, now: at() }), "last-holder");
  assert.equal(await store.remove({ tenantId: "acme", subjectId: "old", role: "owner", resourceId: null }, { protectedRole: true, now: at() }), "removed", "an expired row may always be removed");
  // Another tenant's owner never counts.
  await rbac.grantAsSystem({ tenantId: "globex", subjectId: "g", role: "owner" });
  await assert.rejects(rbac.revoke(survivor, { tenantId: "acme", subjectId: survivor, role: "owner" }), { code: "last-owner" });
});
