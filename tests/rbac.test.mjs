// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { RbacError, createRbac, decodeCursor, isPermissionPattern } from "../.build/modules/rbac/files/core.js";
import { MemoryRbacStore } from "../.build/modules/rbac/files/memory-store.js";
import { createRbacHandler, requirePermission } from "../.build/modules/rbac/files/http.js";

const HOUR = 3_600_000;
const ROLES = {
  viewer: { permissions: ["*:read"] },
  editor: { permissions: ["invoice:create", "invoice:update", "!invoice:delete"], inherits: ["viewer"] },
  billing: { permissions: ["invoice:*", "billing:*"] },
  admin: { permissions: ["rbac:manage", "invoice:*", "project:*"], inherits: ["viewer"] },
  owner: { permissions: ["*"], protected: true },
  auditor: { permissions: ["*", "!*:delete", "!billing:*"] },
};

function setup(roles = ROLES) {
  let now = 1_000_000;
  const store = new MemoryRbacStore();
  const rbac = createRbac({ store, roles, now: () => now });
  return { store, rbac, advance: (ms) => { now += ms; }, at: () => now };
}
const code = (expected) => (error) => error instanceof RbacError && error.code === expected;
const acme = { tenantId: "acme" };

test("role definitions are validated at creation: unknown parents, cycles, bad patterns", () => {
  assert.throws(() => createRbac({ store: new MemoryRbacStore(), roles: { a: { permissions: [], inherits: ["missing"] } } }), /unknown role/);
  assert.throws(() => createRbac({ store: new MemoryRbacStore(), roles: { a: { permissions: [], inherits: ["b"] }, b: { permissions: [], inherits: ["c"] }, c: { permissions: [], inherits: ["a"] } } }), /cycle/);
  assert.throws(() => createRbac({ store: new MemoryRbacStore(), roles: { a: { permissions: [], inherits: ["a"] } } }), /cycle/);
  for (const bad of ["invoice", "invoice:", ":read", "in voice:read", "invoice:re*", "**", "!!invoice:read", "a:b:c", 7]) {
    assert.throws(() => createRbac({ store: new MemoryRbacStore(), roles: { a: { permissions: [bad] } } }), RangeError, String(bad));
  }
  assert.throws(() => createRbac({ store: new MemoryRbacStore(), roles: { "Bad Role": { permissions: [] } } }), RangeError);
  assert.throws(() => createRbac({ store: new MemoryRbacStore(), roles: {} }), RangeError);
  assert.ok(isPermissionPattern("*") && isPermissionPattern("*:read") && isPermissionPattern("invoice:*") && !isPermissionPattern("!invoice:read"));
  // Diamond inheritance is not a cycle.
  const { rbac } = setup({ base: { permissions: ["a:read"] }, left: { permissions: [], inherits: ["base"] }, right: { permissions: [], inherits: ["base"] }, top: { permissions: [], inherits: ["left", "right"] } });
  assert.deepEqual(rbac.describeRoles().top.allow, ["a:read"]);
});

test("wildcards, inheritance and deny precedence", async () => {
  const { rbac } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "ed", role: "editor" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "aud", role: "auditor" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "o", role: "owner" });

  assert.deepEqual(await rbac.can("ed", "report:read", acme), { allowed: true, reason: "allowed", via: "editor" }, "*:read inherited from viewer");
  assert.equal((await rbac.can("ed", "invoice:create", acme)).allowed, true);
  assert.deepEqual(await rbac.can("ed", "invoice:delete", acme), { allowed: false, reason: "denied-by-rule", via: "editor" });
  assert.deepEqual(await rbac.can("ed", "project:create", acme), { allowed: false, reason: "no-matching-role" });
  assert.equal((await rbac.can("o", "anything:goes", acme)).allowed, true, "* matches everything");
  // auditor has * but denies every delete and all of billing.
  assert.equal((await rbac.can("aud", "invoice:update", acme)).allowed, true);
  assert.equal((await rbac.can("aud", "invoice:delete", acme)).reason, "denied-by-rule");
  assert.equal((await rbac.can("aud", "billing:read", acme)).reason, "denied-by-rule");
  // A deny on one role overrides an allow from another role of the same subject.
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "ed", role: "billing" });
  assert.deepEqual(await rbac.can("ed", "invoice:delete", acme), { allowed: false, reason: "denied-by-rule", via: "editor" });
  assert.equal((await rbac.can("ed", "billing:refund", acme)).via, "billing");

  // Fail closed on unknown permission shapes and malformed contexts.
  for (const bad of ["invoice", "invoice:*", "*", "*:read", "", "a:b:c", null, 42]) {
    assert.equal((await rbac.can("o", bad, acme)).reason, "invalid-permission", String(bad));
  }
  assert.equal((await rbac.can("o", "invoice:read", { tenantId: "" })).reason, "invalid-context");
  assert.equal((await rbac.can("o", "invoice:read", { tenantId: "acme", resourceId: "../x" })).reason, "invalid-context");
  assert.equal((await rbac.can("o", "invoice:read", undefined)).reason, "invalid-context");
  await assert.rejects(rbac.assert("ed", "invoice:delete", acme), code("forbidden"));
  assert.equal((await rbac.assert("ed", "invoice:read", acme)).via, "billing", "the first matching role in name order");

  const effective = await rbac.permissionsFor("ed", acme);
  assert.deepEqual(effective.roles, ["billing", "editor"]);
  assert.deepEqual(effective.deny, ["invoice:delete"]);
  assert.ok(effective.allow.includes("*:read") && effective.allow.includes("billing:*"));
  assert.deepEqual(await rbac.permissionsFor("nobody", acme), { roles: [], allow: [], deny: [] });
});

test("tenant isolation and resource scope", async () => {
  const { rbac } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "u", role: "viewer" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "u", role: "editor", resourceId: "proj-1" });
  assert.equal((await rbac.can("u", "invoice:read", { tenantId: "globex" })).allowed, false, "roles never cross tenants");
  assert.equal((await rbac.can("u", "invoice:read", { tenantId: "acme", resourceId: "proj-9" })).allowed, true, "tenant-wide applies to every resource");
  assert.equal((await rbac.can("u", "invoice:create", { tenantId: "acme", resourceId: "proj-1" })).via, "editor");
  assert.equal((await rbac.can("u", "invoice:create", { tenantId: "acme", resourceId: "proj-2" })).allowed, false, "resource scope stays on its resource");
  assert.equal((await rbac.can("u", "invoice:create", acme)).allowed, false, "a resource role does not apply tenant-wide");
  assert.equal((await rbac.can("u", "invoice:create", { tenantId: "globex", resourceId: "proj-1" })).allowed, false);
  assert.deepEqual((await rbac.permissionsFor("u", { tenantId: "acme", resourceId: "proj-1" })).roles, ["editor", "viewer"]);
});

test("expired assignments are ignored and expiry is validated", async () => {
  const { rbac, advance, at } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "temp", role: "billing", expiresAt: at() + HOUR });
  assert.equal((await rbac.can("temp", "billing:read", acme)).allowed, true);
  advance(HOUR);
  assert.equal((await rbac.can("temp", "billing:read", acme)).allowed, false, "expiresAt itself is already expired");
  assert.deepEqual((await rbac.permissionsFor("temp", acme)).roles, []);
  await assert.rejects(rbac.grantAsSystem({ tenantId: "acme", subjectId: "x", role: "billing", expiresAt: at() }), code("invalid-expiry"));
  await assert.rejects(rbac.grantAsSystem({ tenantId: "acme", subjectId: "x", role: "billing", expiresAt: 1.5e12 + 0.5 }), code("invalid-expiry"));
  await assert.rejects(rbac.grantAsSystem({ tenantId: "acme", subjectId: "x", role: "owner", expiresAt: at() + HOUR }), code("invalid-expiry"), "protected roles cannot expire");
  // Re-granting revives an expired assignment with the new expiry.
  const again = await rbac.grantAsSystem({ tenantId: "acme", subjectId: "temp", role: "billing", expiresAt: at() + HOUR });
  assert.equal(again.created, false);
  assert.equal((await rbac.can("temp", "billing:read", acme)).allowed, true);
});

test("grant and revoke need rbac:manage and cannot escalate", async () => {
  const { rbac } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "own", role: "owner" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "adm", role: "admin" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "ed", role: "editor" });
  await rbac.grantAsSystem({ tenantId: "globex", subjectId: "eve", role: "owner" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "pm", role: "admin", resourceId: "proj-1" });

  await assert.rejects(rbac.grant("ed", { tenantId: "acme", subjectId: "x", role: "viewer" }), code("forbidden"), "no rbac:manage");
  await assert.rejects(rbac.grant("eve", { tenantId: "acme", subjectId: "x", role: "viewer" }), code("forbidden"), "owner elsewhere is nobody here");
  // admin = rbac:manage, invoice:*, project:*, *:read. It may grant viewer and editor (deny-only extras are fine).
  assert.equal((await rbac.grant("adm", { tenantId: "acme", subjectId: "x", role: "viewer" })).created, true);
  assert.equal((await rbac.grant("adm", { tenantId: "acme", subjectId: "x", role: "editor" })).assignment.grantedBy, "adm");
  await assert.rejects(rbac.grant("adm", { tenantId: "acme", subjectId: "x", role: "owner" }), code("escalation"));
  await assert.rejects(rbac.grant("adm", { tenantId: "acme", subjectId: "x", role: "billing" }), code("escalation"), "billing:* exceeds admin");
  await assert.rejects(rbac.grant("adm", { tenantId: "acme", subjectId: "adm", role: "owner" }), code("escalation"), "no self-promotion");
  await assert.rejects(rbac.revoke("adm", { tenantId: "acme", subjectId: "own", role: "owner" }), code("escalation"), "cannot remove a stronger role");
  assert.equal((await rbac.grant("own", { tenantId: "acme", subjectId: "x", role: "billing" })).created, true);
  assert.equal((await rbac.grant("own", { tenantId: "acme", subjectId: "x", role: "auditor" })).created, true);

  // An actor with denies cannot grant a role that lacks the same denies.
  const { rbac: second } = setup({ ...ROLES, lead: { permissions: ["rbac:manage", "invoice:*", "!invoice:delete", "*:read"] } });
  await second.grantAsSystem({ tenantId: "acme", subjectId: "lead", role: "lead" });
  await assert.rejects(second.grant("lead", { tenantId: "acme", subjectId: "x", role: "billing" }), code("escalation"));
  assert.equal((await second.grant("lead", { tenantId: "acme", subjectId: "x", role: "editor" })).created, true, "editor denies invoice:delete too");

  // Resource-scoped managers manage only their resource.
  assert.equal((await rbac.grant("pm", { tenantId: "acme", subjectId: "y", role: "editor", resourceId: "proj-1" })).created, true);
  await assert.rejects(rbac.grant("pm", { tenantId: "acme", subjectId: "y", role: "editor", resourceId: "proj-2" }), code("forbidden"));
  await assert.rejects(rbac.grant("pm", { tenantId: "acme", subjectId: "y", role: "editor" }), code("forbidden"));

  // Input validation.
  await assert.rejects(rbac.grant("own", { tenantId: "acme", subjectId: "x", role: "superuser" }), code("invalid-role"));
  await assert.rejects(rbac.grant("own", { tenantId: "a/b", subjectId: "x", role: "viewer" }), code("invalid-tenant"));
  await assert.rejects(rbac.grant("own", { tenantId: "acme", subjectId: "", role: "viewer" }), code("invalid-subject"));
  await assert.rejects(rbac.grant("own", { tenantId: "acme", subjectId: "x", role: "viewer", resourceId: "a b" }), code("invalid-resource"));

  assert.deepEqual(await rbac.revoke("adm", { tenantId: "acme", subjectId: "x", role: "viewer" }), { removed: true });
  assert.deepEqual(await rbac.revoke("adm", { tenantId: "acme", subjectId: "x", role: "viewer" }), { removed: false });
});

test("grant is idempotent", async () => {
  const { rbac, store, advance } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "own", role: "owner" });
  const first = await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "editor", resourceId: "p1" });
  advance(1000);
  const second = await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "editor", resourceId: "p1" });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(second.assignment, first.assignment);
  assert.equal((await store.forSubject("acme", "u")).length, 1);
  // A tenant-wide grant of the same role is a separate assignment.
  assert.equal((await rbac.grant("own", { tenantId: "acme", subjectId: "u", role: "editor" })).created, true);
  assert.equal((await store.forSubject("acme", "u")).length, 2);
});

test("the last holder of a protected role cannot be removed", async () => {
  const { rbac } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "a", role: "owner" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "b", role: "owner" });
  await rbac.grantAsSystem({ tenantId: "globex", subjectId: "g", role: "owner" });
  assert.deepEqual(await rbac.revoke("a", { tenantId: "acme", subjectId: "b", role: "owner" }), { removed: true });
  await assert.rejects(rbac.revoke("a", { tenantId: "acme", subjectId: "a", role: "owner" }), code("last-owner"), "an owner in another tenant does not count");
  assert.equal((await rbac.can("a", "rbac:manage", acme)).allowed, true);
  // Concurrent revokes of the last two owners: at most one succeeds.
  await rbac.grant("a", { tenantId: "acme", subjectId: "b", role: "owner" });
  const results = await Promise.allSettled([
    rbac.revoke("a", { tenantId: "acme", subjectId: "b", role: "owner" }),
    rbac.revoke("b", { tenantId: "acme", subjectId: "a", role: "owner" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.some((r) => r.status === "rejected" && r.reason.code === "last-owner"));
  // A resource-scoped grant of a protected role is not guarded (a tenant-wide holder remains).
  const holder = (await rbac.permissionsFor("a", acme)).roles.includes("owner") ? "a" : "b";
  await rbac.grant(holder, { tenantId: "acme", subjectId: "c", role: "owner", resourceId: "p1" });
  assert.deepEqual(await rbac.revoke(holder, { tenantId: "acme", subjectId: "c", role: "owner", resourceId: "p1" }), { removed: true });
});

test("listAssignments: authorization, filters and keyset pages", async () => {
  const { rbac } = setup();
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "own", role: "owner" });
  for (let i = 0; i < 5; i += 1) await rbac.grantAsSystem({ tenantId: "acme", subjectId: `u${i}`, role: "viewer" });
  await rbac.grantAsSystem({ tenantId: "acme", subjectId: "u1", role: "editor", resourceId: "p1" });
  await rbac.grantAsSystem({ tenantId: "globex", subjectId: "g", role: "viewer" });
  const seen = [];
  let cursor = null;
  do {
    const page = await rbac.listAssignments("own", "acme", { cursor, limit: 2 });
    assert.ok(page.assignments.length <= 2);
    seen.push(...page.assignments.map((a) => `${a.subjectId}/${a.role}/${a.resourceId ?? ""}`));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, ["own/owner/", "u0/viewer/", "u1/editor/p1", "u1/viewer/", "u2/viewer/", "u3/viewer/", "u4/viewer/"]);
  assert.deepEqual((await rbac.listAssignments("own", "acme", { subjectId: "u1" })).assignments.map((a) => a.role), ["editor", "viewer"]);
  await assert.rejects(rbac.listAssignments("u0", "acme"), code("forbidden"));
  await assert.rejects(rbac.listAssignments("own", "globex"), code("forbidden"));
  await assert.rejects(rbac.listAssignments("own", "acme", { limit: 101 }), code("invalid-limit"));
  await assert.rejects(rbac.listAssignments("own", "acme", { limit: 0 }), code("invalid-limit"));
  await assert.rejects(rbac.listAssignments("own", "acme", { cursor: "not!valid" }), code("invalid-cursor"));
  assert.throws(() => decodeCursor("eyJ4IjoxfQ"), code("invalid-cursor"));
});

// --- HTTP ---------------------------------------------------------------------------------------------

const ORIGIN = "https://app.example";
async function httpSetup() {
  const ctx = setup();
  await ctx.rbac.grantAsSystem({ tenantId: "acme", subjectId: "own", role: "owner" });
  await ctx.rbac.grantAsSystem({ tenantId: "acme", subjectId: "adm", role: "admin" });
  await ctx.rbac.grantAsSystem({ tenantId: "acme", subjectId: "ed", role: "editor" });
  const handler = createRbacHandler({
    rbac: ctx.rbac, prefix: "/api/rbac/", allowedOrigins: [ORIGIN],
    authenticate: async (request) => { const id = request.headers.get("x-user"); return id ? { subjectId: id } : null; },
  });
  const call = (method, path, { user, body, origin = ORIGIN, raw } = {}) => handler(new Request(`https://app.example/api/rbac${path}`, {
    method,
    headers: { ...(user ? { "x-user": user } : {}), ...(origin ? { origin } : {}), ...(body !== undefined || raw !== undefined ? { "content-type": "application/json" } : {}) },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  }));
  return { ...ctx, call };
}

test("HTTP: me/permissions, listing, grant, revoke, statuses and origin check", async () => {
  const { call } = await httpSetup();
  let response = await call("GET", "/me/permissions?tenantId=acme", { user: "ed" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const mine = await response.json();
  assert.deepEqual(mine.roles, ["editor"]);
  assert.deepEqual(mine.deny, ["invoice:delete"]);
  assert.equal((await call("GET", "/me/permissions?tenantId=acme")).status, 401);

  response = await call("POST", "/assignments", { user: "adm", body: { tenantId: "acme", subjectId: "new", role: "viewer" } });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).assignment.role, "viewer");
  assert.equal((await call("POST", "/assignments", { user: "adm", body: { tenantId: "acme", subjectId: "new", role: "viewer" } })).status, 200, "idempotent re-grant");
  assert.equal((await call("POST", "/assignments", { user: "adm", body: { tenantId: "acme", subjectId: "new", role: "owner" } })).status, 403);
  assert.equal((await call("POST", "/assignments", { user: "ed", body: { tenantId: "acme", subjectId: "new", role: "viewer" } })).status, 403);
  assert.equal((await call("POST", "/assignments", { body: { tenantId: "acme", subjectId: "new", role: "viewer" } })).status, 401);
  assert.equal((await call("POST", "/assignments", { user: "adm", origin: "https://evil.example", body: { tenantId: "acme", subjectId: "new", role: "viewer" } })).status, 403);
  assert.equal((await call("POST", "/assignments", { user: "adm", origin: null, body: { tenantId: "acme", subjectId: "new", role: "viewer" } })).status, 403);
  assert.equal((await call("POST", "/assignments", { user: "adm", body: { tenantId: "acme", subjectId: "new", role: "nope" } })).status, 400);
  assert.equal((await call("POST", "/assignments", { user: "adm", body: { tenantId: "acme", subjectId: "n", role: "viewer", expiresAt: "soon" } })).status, 400);
  assert.equal((await call("POST", "/assignments", { user: "adm", raw: "{not json" })).status, 400);
  assert.equal((await call("POST", "/assignments", { user: "adm", raw: JSON.stringify({ tenantId: "acme", pad: "x".repeat(5000) }) })).status, 400, "bounded body");

  response = await call("GET", "/assignments?tenantId=acme&limit=2", { user: "adm" });
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.equal(page.assignments.length, 2);
  assert.ok(page.nextCursor);
  const next = await (await call("GET", `/assignments?tenantId=acme&limit=2&cursor=${page.nextCursor}`, { user: "adm" })).json();
  assert.notEqual(next.assignments[0].subjectId, page.assignments[0].subjectId);
  assert.equal((await call("GET", "/assignments?tenantId=acme&subjectId=new", { user: "adm" }).then((r) => r.json())).assignments.length, 1);
  assert.equal((await call("GET", "/assignments?tenantId=acme", { user: "ed" })).status, 403);
  assert.equal((await call("GET", "/assignments?tenantId=acme&limit=500", { user: "adm" })).status, 400);
  assert.equal((await call("GET", "/assignments?tenantId=acme&limit=abc", { user: "adm" })).status, 400);

  response = await call("DELETE", "/assignments", { user: "adm", body: { tenantId: "acme", subjectId: "new", role: "viewer" } });
  assert.deepEqual(await response.json(), { removed: true });
  assert.equal((await call("DELETE", "/assignments", { user: "own", origin: "https://evil.example", body: { tenantId: "acme", subjectId: "ed", role: "editor" } })).status, 403);
  response = await call("DELETE", "/assignments", { user: "own", body: { tenantId: "acme", subjectId: "own", role: "owner" } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "last-owner");
  assert.equal((await call("PUT", "/assignments", { user: "own", body: {} })).status, 405);
  assert.equal((await call("GET", "/elsewhere", { user: "own" })).status, 404);
  assert.equal((await handler404()).status, 404);

  async function handler404() {
    const h = createRbacHandler({ rbac: createRbac({ store: new MemoryRbacStore(), roles: ROLES }), prefix: "/api/rbac", allowedOrigins: [ORIGIN], authenticate: async () => null });
    return h(new Request("https://app.example/other"));
  }
});

test("requirePermission wraps a handler with 401/403 JSON", async () => {
  const { rbac } = await httpSetup();
  let calls = 0;
  const inner = async () => { calls += 1; return new Response("ok"); };
  const guarded = requirePermission(rbac, "invoice:delete", async (request) => {
    const user = request.headers.get("x-user");
    return user ? { subjectId: user, tenantId: new URL(request.url).searchParams.get("tenant") ?? "" } : null;
  })(inner);
  const req = (user, tenant = "acme") => new Request(`https://app.example/invoices?tenant=${tenant}`, { headers: user ? { "x-user": user } : {} });
  assert.equal((await guarded(req("own"))).status, 200);
  const denied = await guarded(req("ed"));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("content-type"), "application/json");
  assert.deepEqual(await denied.json(), { error: "forbidden", reason: "denied-by-rule" });
  assert.equal((await guarded(req("own", "globex"))).status, 403);
  assert.equal((await guarded(req(null))).status, 401);
  assert.equal(calls, 1);
});
