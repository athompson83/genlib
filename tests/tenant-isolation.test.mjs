// SPDX-License-Identifier: Apache-2.0
// tenant-isolation without a database: tenant resolution from trusted session and membership state, selectors,
// the Fetch handler's status mapping, and the SQL every helper emits (tenant filter on every statement,
// transaction-local settings, identifier validation). tests/tenant-isolation-sql.test.mjs runs the same code on PostgreSQL.
import assert from "node:assert/strict";
import test from "node:test";
import {
  TenantIsolationError, createTenantHandler, headerSelector, isTenantId, pathSelector, resolveTenant, subdomainSelector, tenantErrorResponse,
} from "../.build/modules/tenant-isolation/files/core.js";
import { appRoleSql, scoped, tenantPredicate, tenantTableSql, withTenant } from "../.build/modules/tenant-isolation/files/sql.js";

const code = (expected) => (error) => error instanceof TenantIsolationError && error.code === expected;
// alice belongs to acme (admin) and globex (viewer); eve only to globex; nobody has no memberships.
const members = { alice: [{ tenantId: "acme", role: "admin" }, { tenantId: "globex", role: "viewer" }], eve: [{ tenantId: "globex", role: "member" }], nobody: [] };
const sessions = { "s-alice": { userId: "alice" }, "s-eve": { userId: "eve" }, "s-nobody": { userId: "nobody" }, "s-eve-claim": { userId: "eve", tenantId: "globex" } };
const session = async (request) => sessions[request.headers.get("cookie")?.replace("sid=", "") ?? ""] ?? null;
const memberships = async (userId) => members[userId] ?? [];
const req = (url, sid, headers = {}) => new Request(url, { headers: { ...(sid ? { cookie: `sid=${sid}` } : {}), ...headers } });

test("tenant context comes from the verified session and membership, never from an unchecked client value", async () => {
  const selector = headerSelector("x-tenant-id");
  const opts = { session, memberships, selector };
  // A client-sent tenant id is only a selector that must match a membership.
  assert.deepEqual(await resolveTenant(req("https://app.test/", "s-alice", { "x-tenant-id": "globex" }), opts), { userId: "alice", tenantId: "globex", role: "viewer" });
  await assert.rejects(resolveTenant(req("https://app.test/", "s-eve", { "x-tenant-id": "acme" }), opts), code("not-a-member"));
  // Without a session the header is worthless.
  await assert.rejects(resolveTenant(req("https://app.test/", null, { "x-tenant-id": "acme" }), opts), code("unauthenticated"));
  await assert.rejects(resolveTenant(req("https://app.test/", "s-forged", { "x-tenant-id": "acme" }), opts), code("unauthenticated"));
  // Malformed selectors are refused before any lookup.
  await assert.rejects(resolveTenant(req("https://app.test/", "s-alice", { "x-tenant-id": "acme' OR '1'='1" }), opts), code("invalid-tenant"));
  // No selector: a single membership decides; several need a choice; none is refused.
  assert.equal((await resolveTenant(req("https://app.test/", "s-eve"), opts)).tenantId, "globex");
  await assert.rejects(resolveTenant(req("https://app.test/", "s-alice"), opts), code("tenant-required"));
  await assert.rejects(resolveTenant(req("https://app.test/", "s-nobody"), opts), code("no-tenant"));
  // A verified session claim is checked against memberships too, and a selector cannot override it.
  assert.equal((await resolveTenant(req("https://app.test/", "s-eve-claim"), opts)).tenantId, "globex");
  await assert.rejects(resolveTenant(req("https://app.test/", "s-eve-claim", { "x-tenant-id": "acme" }), opts), code("not-a-member"));
  const revoked = { session, memberships: async () => [], selector };
  await assert.rejects(resolveTenant(req("https://app.test/", "s-eve-claim"), revoked), code("not-a-member"));
});

test("path and subdomain selectors extract the tenant label only", () => {
  const path = pathSelector("/t/");
  assert.equal(path(new Request("https://app.test/t/acme/projects/1")), "acme");
  assert.equal(path(new Request("https://app.test/t/")), null);
  assert.equal(path(new Request("https://app.test/other/acme")), null);
  assert.equal(isTenantId(path(new Request("https://app.test/t/%E0%A4%A"))), false);
  const sub = subdomainSelector("app.example.com");
  assert.equal(sub(new Request("https://Acme.App.Example.com/x")), "acme");
  assert.equal(sub(new Request("https://app.example.com/x")), null);
  assert.equal(sub(new Request("https://a.b.app.example.com/x")), null);
  assert.equal(sub(new Request("https://acme.evil.com/x")), null);
  assert.equal(isTenantId(""), false);
  assert.equal(isTenantId("x".repeat(129)), false);
  assert.equal(isTenantId("org_01HZ:prod"), true);
});

test("tenant handler: 401, hidden 404 for foreign tenants, 403 option and the resolved context", async () => {
  const seen = [];
  const handler = createTenantHandler({ session, memberships, selector: pathSelector("/t") }, async (_request, context) => {
    seen.push(context);
    return new Response("ok");
  });
  assert.equal((await handler(req("https://app.test/t/acme/x", null))).status, 401);
  const hidden = await handler(req("https://app.test/t/acme/x", "s-eve"));
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { error: "not-found" });
  assert.equal(hidden.headers.get("cache-control"), "no-store");
  assert.equal((await handler(req("https://app.test/t/globex/x", "s-eve"))).status, 200);
  assert.deepEqual(seen, [{ userId: "eve", tenantId: "globex", role: "member" }]);
  const strict = createTenantHandler({ session, memberships, selector: pathSelector("/t"), hiddenStatus: 403 }, async () => new Response("ok"));
  assert.equal((await strict(req("https://app.test/t/acme/x", "s-eve"))).status, 403);
  assert.equal((await strict(req("https://app.test/x", "s-alice"))).status, 400);
  assert.throws(() => createTenantHandler({ session, memberships, hiddenStatus: 500 }, async () => new Response("")), RangeError);
  // Errors thrown by the handler itself (scoped not-found) map too; foreign errors propagate.
  const missing = createTenantHandler({ session, memberships }, async () => { throw new TenantIsolationError("not-found"); });
  assert.equal((await missing(req("https://app.test/", "s-eve"))).status, 404);
  assert.throws(() => tenantErrorResponse(new Error("boom")), /boom/);
});

function recorder(rowsFor = () => []) {
  const calls = [];
  return { calls, query: async (text, params = []) => { calls.push({ text, params }); return { rows: rowsFor(text, params) }; } };
}

test("scoped queries add the tenant filter to every statement and map foreign ids to not-found", async () => {
  const db = recorder();
  const repo = scoped(db, "acme", { table: "tenant_items", columns: ["title"] });
  assert.equal(await repo.get("b-1"), null);
  await assert.rejects(repo.require("b-1"), code("not-found"));
  await repo.list({ after: "a-1", limit: 10 });
  await repo.list();
  assert.equal(await repo.update("b-1", { title: "x" }), null);
  assert.equal(await repo.delete("b-1"), false);
  for (const { text, params } of db.calls) {
    assert.match(text, /tenant_id = \$\d/, text);
    assert.ok(params.includes("acme"), text);
  }
  // Inserts force the tenant column; another tenant's value is refused before SQL runs.
  const ins = recorder(() => [{ id: "n", tenant_id: "acme", title: "t" }]);
  const insertRepo = scoped(ins, "acme", { table: "tenant_items", columns: ["title"] });
  await insertRepo.insert({ id: "n", title: "t" });
  assert.deepEqual(ins.calls[0].params, ["acme", "n", "t"]);
  await assert.rejects(insertRepo.insert({ id: "n", title: "t", tenant_id: "globex" }), code("tenant-mismatch"));
  await assert.rejects(repo.update("a-1", { tenant_id: "globex" }), code("invalid-column"));
  await assert.rejects(repo.update("a-1", { "title = 'x'; --": 1 }), code("invalid-column"));
  await assert.rejects(repo.list({ limit: 0 }), code("invalid-limit"));
  assert.throws(() => scoped(db, "acme", { table: "bad; drop", columns: [] }), code("invalid-identifier"));
  assert.throws(() => scoped(db, "", { table: "t", columns: [] }), code("invalid-tenant"));
});

test("withTenant sets a transaction-local tenant and role, and rolls back on error", async () => {
  const db = recorder();
  assert.equal(await withTenant(db, "acme", async (tx) => { await tx.query("SELECT 1"); return 7; }, { role: "app_user" }), 7);
  assert.deepEqual(db.calls.map((c) => c.text), ["BEGIN", "SELECT set_config($1, $2, true)", "SET LOCAL ROLE app_user", "SELECT 1", "COMMIT"]);
  assert.deepEqual(db.calls[1].params, ["app.tenant_id", "acme"]);
  const failing = recorder();
  await assert.rejects(withTenant(failing, "acme", async () => { throw new Error("boom"); }), /boom/);
  assert.deepEqual(failing.calls.map((c) => c.text), ["BEGIN", "SELECT set_config($1, $2, true)", "ROLLBACK"]);
  // With a transaction function (pools), BEGIN/COMMIT are left to it.
  const tx = recorder();
  await withTenant({ query: tx.query, transaction: (work) => work(tx) }, "acme", async () => null);
  assert.deepEqual(tx.calls.map((c) => c.text), ["SELECT set_config($1, $2, true)"]);
  await assert.rejects(withTenant(db, "", async () => null), code("invalid-tenant"));
  await assert.rejects(withTenant(db, "acme", async () => null, { role: "app_user; RESET ROLE" }), code("invalid-identifier"));
  await assert.rejects(withTenant(db, "acme", async () => null, { setting: "x'); --" }), code("invalid-identifier"));
});

test("generated RLS SQL enables and forces RLS with a policy that matches nothing when unset", () => {
  const sql = tenantTableSql("documents");
  assert.match(sql, /ALTER TABLE documents ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE documents FORCE ROW LEVEL SECURITY;/);
  assert.match(sql, /CREATE POLICY tenant_isolation ON documents USING \(tenant_id = NULLIF\(current_setting\('app\.tenant_id', true\), ''\)\) WITH CHECK \(tenant_id = NULLIF/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO app_user;/);
  assert.equal(tenantPredicate({ column: "org_id", columnType: "uuid", setting: "app.org_id" }), "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid");
  assert.match(appRoleSql("app_user"), /CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS/);
  assert.throws(() => tenantTableSql("docs; drop table x"), code("invalid-identifier"));
  assert.throws(() => tenantPredicate({ columnType: "text); --" }), code("invalid-identifier"));
});
