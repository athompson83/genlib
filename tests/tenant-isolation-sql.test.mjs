// SPDX-License-Identifier: Apache-2.0
// tenant-isolation on real PostgreSQL semantics (PGlite, Postgres compiled to WASM). PGlite connects as the
// superuser `postgres`, which bypasses RLS, so every check switches to the NOLOGIN, NOBYPASSRLS role app_user
// with SET LOCAL ROLE inside withTenant, exactly as an app that logs in as an owner would.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { appRoleSql, inspectIsolation, scoped, tenantTableSql, withTenant } from "../.build/modules/tenant-isolation/files/sql.js";
import { TenantIsolationAssertionError, assertTenantIsolation } from "../.build/modules/tenant-isolation/files/test-kit.js";
import { TenantIsolationError, createTenantHandler, headerSelector } from "../.build/modules/tenant-isolation/files/core.js";

const schema = readFileSync(new URL("../modules/tenant-isolation/files/schema.sql", import.meta.url), "utf8");
const wrap = (q) => ({ query: (text, params) => q.query(text, params) });
const executor = (db) => ({ ...wrap(db), transaction: (work) => db.transaction((tx) => work(wrap(tx))) });
const role = { role: "app_user" };
const notFound = (error) => error instanceof TenantIsolationError && error.code === "not-found";

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  // Seed as the owner (superuser bypasses RLS) so both tenants have rows.
  await db.exec("INSERT INTO tenant_items (id, tenant_id, title) VALUES ('a-1','acme','A one'),('a-2','acme','A two'),('b-1','globex','B one')");
  return { db, ex: executor(db) };
}

test("database enforcement: as app_user a raw unscoped SELECT returns only the current tenant's rows", async () => {
  const { ex } = await setup();
  const rows = await withTenant(ex, "acme", async (tx) => (await tx.query("SELECT id, tenant_id FROM tenant_items ORDER BY id")).rows, role);
  assert.deepEqual(rows, [{ id: "a-1", tenant_id: "acme" }, { id: "a-2", tenant_id: "acme" }]);
  const who = await withTenant(ex, "acme", async (tx) => (await tx.query("SELECT current_user AS u, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).rows[0], role);
  assert.deepEqual(who, { u: "app_user", rolsuper: false, rolbypassrls: false });
  const status = await inspectIsolation(ex, "tenant_items", "app_user");
  assert.equal(status.ok, true, status.problems.join("; "));
  assert.deepEqual([status.rowSecurity, status.forced, status.policies], [true, true, ["tenant_isolation"]]);
  // The connection user (superuser) is reported as able to bypass RLS.
  assert.equal((await inspectIsolation(ex, "tenant_items", "postgres")).roleBypassesRls, true);
});

test("database enforcement: UPDATE and DELETE of another tenant's id affect 0 rows, INSERT as another tenant fails WITH CHECK", async () => {
  const { db, ex } = await setup();
  const updated = await withTenant(ex, "acme", async (tx) => (await tx.query("UPDATE tenant_items SET title = 'pwned' WHERE id = 'b-1' RETURNING id")).rows.length, role);
  assert.equal(updated, 0);
  const deleted = await withTenant(ex, "acme", async (tx) => (await tx.query("DELETE FROM tenant_items WHERE id = 'b-1' RETURNING id")).rows.length, role);
  assert.equal(deleted, 0);
  await assert.rejects(withTenant(ex, "acme", (tx) => tx.query("INSERT INTO tenant_items (id, tenant_id, title) VALUES ('x', 'globex', 'planted')"), role), /row-level security/);
  await assert.rejects(withTenant(ex, "acme", (tx) => tx.query("UPDATE tenant_items SET tenant_id = 'globex' WHERE id = 'a-1'"), role), /row-level security/);
  // Owner view: B's row is untouched and nothing was planted or moved.
  assert.deepEqual((await db.query("SELECT id, tenant_id, title FROM tenant_items WHERE tenant_id = 'globex'")).rows, [{ id: "b-1", tenant_id: "globex", title: "B one" }]);
});

test("database enforcement: no tenant set returns 0 rows, and the setting does not leak after the transaction", async () => {
  const { db, ex } = await setup();
  const unset = await ex.transaction(async (tx) => { await tx.query("SET LOCAL ROLE app_user"); return (await tx.query("SELECT count(*)::int AS n FROM tenant_items")).rows[0].n; });
  assert.equal(unset, 0);
  await withTenant(ex, "acme", async () => null, role);
  const after = (await db.query("SELECT current_setting('app.tenant_id', true) AS v, current_user AS u")).rows[0];
  assert.equal(after.u, "postgres");
  assert.ok(after.v === "" || after.v === null, `setting leaked: ${after.v}`);
  // After the transaction ends, app_user with the reset ('') setting still sees nothing.
  const reset = await ex.transaction(async (tx) => { await tx.query("SET LOCAL ROLE app_user"); return (await tx.query("SELECT count(*)::int AS n FROM tenant_items")).rows[0].n; });
  assert.equal(reset, 0);
  // An error inside withTenant rolls back its writes and its setting.
  await assert.rejects(withTenant(ex, "acme", async (tx) => { await tx.query("INSERT INTO tenant_items (id, tenant_id, title) VALUES ('a-3','acme','x')"); throw new Error("boom"); }, role), /boom/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM tenant_items WHERE id = 'a-3'")).rows[0].n, 0);
  assert.ok(["", null].includes((await db.query("SELECT current_setting('app.tenant_id', true) AS v")).rows[0].v));
  // The BEGIN/COMMIT fallback (dedicated client) behaves the same.
  const rows = await withTenant(wrap(db), "globex", async (tx) => (await tx.query("SELECT id FROM tenant_items")).rows, role);
  assert.deepEqual(rows, [{ id: "b-1" }]);
  assert.equal((await db.query("SELECT current_user AS u")).rows[0].u, "postgres");
});

test("scoped repository on PostgreSQL: ids from another tenant behave as not found", async () => {
  const { db, ex } = await setup();
  const opts = { table: "tenant_items", columns: ["title", "created_at"] };
  await withTenant(ex, "acme", async (tx) => {
    const repo = scoped(tx, "acme", opts);
    assert.equal(await repo.get("b-1"), null);
    await assert.rejects(repo.require("b-1"), notFound);
    assert.equal(await repo.update("b-1", { title: "pwned" }), null);
    assert.equal(await repo.delete("b-1"), false);
    assert.deepEqual((await repo.list()).map((r) => r.id), ["a-1", "a-2"]);
    assert.deepEqual((await repo.list({ after: "a-1", limit: 1 })).map((r) => r.id), ["a-2"]);
    assert.equal((await repo.insert({ id: "a-3", title: "new" })).tenant_id, "acme");
    assert.equal((await repo.update("a-1", { title: "edited" })).title, "edited");
    assert.equal(await repo.delete("a-2"), true);
  }, role);
  // Defense in depth: even on a connection that bypasses RLS (the superuser), scoped() still filters by tenant.
  const owner = scoped(wrap(db), "acme", opts);
  assert.equal(await owner.get("b-1"), null);
  assert.equal(await owner.delete("b-1"), false);
  assert.deepEqual((await db.query("SELECT id, title FROM tenant_items ORDER BY id")).rows,
    [{ id: "a-1", title: "edited" }, { id: "a-3", title: "new" }, { id: "b-1", title: "B one" }]);
});

test("cross-tenant test kit: assertTenantIsolation passes on an RLS table and fails on an unprotected one", async () => {
  const { db, ex } = await setup();
  // A second table protected with the generated SQL, uuid-free text ids.
  await db.exec(`CREATE TABLE invoices (id text PRIMARY KEY, tenant_id text NOT NULL, amount int NOT NULL);
    ${appRoleSql("app_user")}
    ${tenantTableSql("invoices")}`);
  let n = 0;
  const row = (tenantId) => ({ id: `inv-${tenantId}-${++n}`, amount: 100 });
  for (const table of ["tenant_items", "invoices"]) {
    const checks = await assertTenantIsolation({ executor: ex, table, tenants: ["acme", "globex"], role: "app_user", client: wrap(db),
      row: table === "invoices" ? row : (tenantId, i) => ({ id: `kit-${tenantId}-${i}`, title: "kit" }) });
    assert.equal(checks.length, 9);
    assert.ok(checks.every((c) => c.passed && c.status === "passed"));
  }
  // Seeded rows are cleaned up.
  assert.equal((await db.query("SELECT count(*)::int AS n FROM invoices")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM tenant_items WHERE id LIKE 'kit-%'")).rows[0].n, 0);

  // Without RLS the kit reports every leak.
  await db.exec("CREATE TABLE leaky (id text PRIMARY KEY, tenant_id text NOT NULL, amount int NOT NULL); GRANT SELECT, INSERT, UPDATE, DELETE ON leaky TO app_user;");
  const failure = await assertTenantIsolation({ executor: ex, table: "leaky", tenants: ["acme", "globex"], role: "app_user", row }).catch((e) => e);
  assert.ok(failure instanceof TenantIsolationAssertionError);
  const failed = failure.checks.filter((c) => !c.passed).map((c) => c.name);
  for (const name of ["unscoped-select-sees-only-own-tenant", "select-other-tenant-id-returns-nothing", "update-other-tenant-row-affects-nothing",
    "delete-other-tenant-row-affects-nothing", "insert-as-other-tenant-is-refused", "move-row-to-other-tenant-is-refused", "no-tenant-set-returns-no-rows"]) {
    assert.ok(failed.includes(name), `${name} should fail on a table without RLS`);
  }
  // RLS enabled but not forced, queried as the owner: the kit refuses a role that bypasses RLS.
  const bypass = await assertTenantIsolation({ executor: ex, table: "tenant_items", tenants: ["acme", "globex"], row }).catch((e) => e);
  assert.ok(bypass instanceof TenantIsolationAssertionError);
  assert.deepEqual(bypass.checks.map((c) => [c.name, c.passed]), [["role-cannot-bypass-rls", false]]);
  const notForced = await db.exec("ALTER TABLE leaky ENABLE ROW LEVEL SECURITY").then(() => inspectIsolation(ex, "leaky", "app_user"));
  assert.equal(notForced.ok, false);
  assert.ok(notForced.problems.some((p) => p.includes("not forced")));
  assert.ok(notForced.problems.some((p) => p.includes("no permissive policy")));
});

test("end to end: a user of tenant A cannot read or change tenant B's data through the handler", async () => {
  const { db, ex } = await setup();
  const members = { alice: [{ tenantId: "acme", role: "admin" }], eve: [{ tenantId: "globex", role: "admin" }] };
  const handler = createTenantHandler({
    session: async (request) => ({ "s-alice": { userId: "alice" }, "s-eve": { userId: "eve" } })[request.headers.get("authorization") ?? ""] ?? null,
    memberships: async (userId) => members[userId] ?? [],
    selector: headerSelector("x-tenant-id"),
  }, async (request, { tenantId }) => {
    const id = new URL(request.url).pathname.slice(1);
    return withTenant(ex, tenantId, async (tx) => {
      const repo = scoped(tx, tenantId, { table: "tenant_items", columns: ["title"] });
      if (request.method === "DELETE") return repo.delete(id).then((ok) => new Response(null, { status: ok ? 204 : 404 }));
      const row = await repo.require(id);
      return Response.json(row);
    }, role);
  });
  const call = (sid, id, method = "GET", tenant) => handler(new Request(`https://app.test/${id}`, { method, headers: { authorization: sid, ...(tenant ? { "x-tenant-id": tenant } : {}) } }));
  assert.equal((await call("s-alice", "a-1")).status, 200);
  assert.equal((await call("s-alice", "b-1")).status, 404);
  assert.equal((await call("s-alice", "b-1", "DELETE")).status, 404);
  assert.equal((await call("s-alice", "b-1", "GET", "globex")).status, 404);
  assert.equal((await call("s-eve", "b-1")).status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM tenant_items WHERE id = 'b-1'")).rows[0].n, 1);
});

test("inspectIsolation flags permissive policies that do not reference the tenant setting and matches the schema", async () => {
  const { db, ex } = await setup();
  // A forced RLS table whose only policy is USING (true) is not isolated.
  await db.exec(`CREATE TABLE open_t (id text PRIMARY KEY, tenant_id text NOT NULL);
    ALTER TABLE open_t ENABLE ROW LEVEL SECURITY; ALTER TABLE open_t FORCE ROW LEVEL SECURITY;
    CREATE POLICY everyone ON open_t USING (true);`);
  const open = await inspectIsolation(ex, "open_t", "app_user");
  assert.equal(open.ok, false);
  assert.ok(open.problems.some((p) => p.includes("everyone") && p.includes("USING")), open.problems.join("; "));
  // Permissive policies are OR-ed: an extra permissive USING (true) defeats the tenant policy.
  await db.exec(`CREATE TABLE mixed (id text PRIMARY KEY, tenant_id text NOT NULL, title text);
    ${tenantTableSql("mixed")}
    CREATE POLICY everyone ON mixed FOR SELECT USING (true);`);
  const mixed = await inspectIsolation(ex, "mixed", "app_user");
  assert.equal(mixed.ok, false);
  assert.ok(mixed.problems.some((p) => p.includes("everyone")), mixed.problems.join("; "));
  // A restrictive extra policy only narrows access, so it is fine.
  await db.exec("DROP POLICY everyone ON mixed; CREATE POLICY no_x ON mixed AS RESTRICTIVE USING (title IS DISTINCT FROM 'x');");
  assert.equal((await inspectIsolation(ex, "mixed", "app_user")).ok, true);
  // A permissive WITH CHECK (true) lets rows be written into any tenant.
  await db.exec("CREATE POLICY writes ON mixed FOR INSERT WITH CHECK (true);");
  const writes = await inspectIsolation(ex, "mixed", "app_user");
  assert.equal(writes.ok, false);
  assert.ok(writes.problems.some((p) => p.includes("writes") && p.includes("WITH CHECK")), writes.problems.join("; "));
  // Same table name in another schema: its policies do not count for public, and it can be inspected by schema.
  await db.exec(`CREATE SCHEMA other; CREATE TABLE other.tenant_items (id text PRIMARY KEY, tenant_id text NOT NULL);
    ALTER TABLE other.tenant_items ENABLE ROW LEVEL SECURITY; CREATE POLICY open_other ON other.tenant_items USING (true);`);
  const pub = await inspectIsolation(ex, "tenant_items", "app_user");
  assert.equal(pub.ok, true, pub.problems.join("; "));
  assert.deepEqual(pub.policies, ["tenant_isolation"]);
  const other = await inspectIsolation(ex, "tenant_items", "app_user", { schema: "other" });
  assert.equal(other.ok, false);
  assert.deepEqual(other.policies, ["open_other"]);
  assert.ok(other.problems.some((p) => p.includes("not forced")));
  assert.equal((await inspectIsolation(ex, "tenant_items", "app_user", { schema: "missing" })).ok, false);
});

test("test kit checks the tenant setting on one dedicated client, and reports not-checked on a pool", async () => {
  const { db, ex } = await setup();
  const row = (tenantId, i) => ({ id: `kit-${tenantId}-${i}`, title: "kit" });
  const base = { executor: ex, table: "tenant_items", tenants: ["acme", "globex"], role: "app_user", row };
  const leakCheck = (checks) => checks.find((c) => c.name === "tenant-setting-does-not-outlive-transaction");
  // A pool-like executor (transaction() may use any connection) without a client: the check is not claimed.
  const pooled = leakCheck(await assertTenantIsolation(base));
  assert.equal(pooled.status, "not-checked");
  assert.equal(pooled.passed, false);
  // With a dedicated client the check runs before and after commit on that same connection.
  const checked = leakCheck(await assertTenantIsolation({ ...base, client: wrap(db) }));
  assert.equal(checked.status, "passed");
  // A client whose tenant setting is session-level (leaks) fails the check.
  const leaky = { query: (text, params) => db.query(text.replace("SELECT set_config($1, $2, true)", "SELECT set_config($1, $2, false)"), params) };
  const failure = await assertTenantIsolation({ ...base, client: leaky }).catch((e) => e);
  assert.ok(failure instanceof TenantIsolationAssertionError);
  assert.equal(leakCheck(failure.checks).status, "failed");
  await db.query("SELECT set_config('app.tenant_id', '', false)");
});
