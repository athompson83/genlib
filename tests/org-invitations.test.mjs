// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createInvitations, hashToken, InvitationError, normalizeEmail } from "../.build/modules/org-invitations/files/core.js";
import { MemoryInvitationStore } from "../.build/modules/org-invitations/files/memory-store.js";
import { createInvitationHandler } from "../.build/modules/org-invitations/files/http.js";

const DAY = 86_400_000;
// Admins of a tenant may invite members or admins; members may do nothing; no one may invite an owner.
const members = new Map([["alice", { acme: "admin" }], ["bob", { acme: "member" }], ["eve", { globex: "admin" }]]);
async function authorize(actor, action, { tenantId, role }) {
  const own = members.get(actor.userId)?.[tenantId];
  if (own !== "admin") return false;
  return action !== "invite" || role !== "owner";
}

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const store = new MemoryInvitationStore();
  const invitations = createInvitations({
    store, authorize, roles: ["member", "admin", "owner"], now: () => now,
    newId: () => `inv-${++counter}`, ...extra,
  });
  return { store, invitations, advance: (ms) => { now += ms; } };
}
const code = (expected) => (error) => error instanceof InvitationError && error.code === expected;

test("an admin invites, the invited user accepts once, and the token is stored only as a hash", async () => {
  const { store, invitations } = setup();
  const { invitation, token } = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: " New.User@Example.COM ", role: "member" });
  assert.equal(invitation.email, "New.User@example.com");
  assert.equal(invitation.tokenHash, undefined, "public view never carries the hash");
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = await store.findById(invitation.id);
  assert.equal(stored.tokenHash, await hashToken(token));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal((await invitations.inspect(token)).status, "pending");
  const accepted = await invitations.accept(token, { userId: "u-new", verifiedEmail: "new.user@EXAMPLE.com" });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.acceptedBy, "u-new");
  // Replay of the same link fails.
  await assert.rejects(invitations.accept(token, { userId: "u-new", verifiedEmail: "new.user@example.com" }), code("already-accepted"));
});

test("concurrent accepts: exactly one wins", async () => {
  const { invitations } = setup();
  const { token } = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "a@example.com", role: "member" });
  const results = await Promise.allSettled([1, 2, 3].map(() => invitations.accept(token, { userId: "u", verifiedEmail: "a@example.com" })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "already-accepted"));
});

test("expired, revoked, unknown and malformed tokens fail with distinct codes", async () => {
  const { invitations, advance } = setup({ ttlMs: DAY });
  const first = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "x@example.com", role: "member" });
  advance(DAY);
  assert.equal((await invitations.inspect(first.token)).status, "expired");
  await assert.rejects(invitations.accept(first.token, { userId: "u", verifiedEmail: "x@example.com" }), code("expired"));
  const second = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "y@example.com", role: "member" });
  await invitations.revoke({ userId: "alice" }, second.invitation.id);
  await assert.rejects(invitations.accept(second.token, { userId: "u", verifiedEmail: "y@example.com" }), code("revoked"));
  await assert.rejects(invitations.accept("A".repeat(43), { userId: "u", verifiedEmail: "y@example.com" }), code("not-found"));
  await assert.rejects(invitations.accept("short", { userId: "u", verifiedEmail: "y@example.com" }), code("not-found"));
  await assert.rejects(invitations.revoke({ userId: "alice" }, second.invitation.id), code("revoked"));
});

test("re-inviting the same email rotates the link: only the newest works", async () => {
  const { invitations } = setup();
  const old = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "r@example.com", role: "member" });
  const fresh = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "R@EXAMPLE.com", role: "admin" });
  assert.equal((await invitations.inspect(old.token)).status, "revoked");
  assert.deepEqual((await invitations.listPending({ userId: "alice" }, "acme")).map((i) => i.id), [fresh.invitation.id]);
  assert.equal((await invitations.accept(fresh.token, { userId: "u", verifiedEmail: "r@example.com" })).role, "admin");
});

test("access boundaries: members, other tenants, role ceilings and email mismatch are refused", async () => {
  const { invitations } = setup();
  await assert.rejects(invitations.invite({ userId: "bob" }, { tenantId: "acme", email: "m@example.com", role: "member" }), code("forbidden"));
  await assert.rejects(invitations.invite({ userId: "eve" }, { tenantId: "acme", email: "m@example.com", role: "member" }), code("forbidden"));
  await assert.rejects(invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "m@example.com", role: "owner" }), code("forbidden"));
  await assert.rejects(invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "m@example.com", role: "superuser" }), code("invalid-role"));
  await assert.rejects(invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "not-an-email", role: "member" }), code("invalid-email"));
  await assert.rejects(invitations.invite({ userId: "alice" }, { tenantId: "../x", email: "m@example.com", role: "member" }), code("invalid-tenant"));
  const { invitation, token } = await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "m@example.com", role: "member" });
  // Eve administers another tenant and cannot revoke or list Acme's invitations by id.
  await assert.rejects(invitations.revoke({ userId: "eve" }, invitation.id), code("forbidden"));
  await assert.rejects(invitations.listPending({ userId: "eve" }, "acme"), code("forbidden"));
  // A different signed-in account cannot use a forwarded link.
  await assert.rejects(invitations.accept(token, { userId: "intruder", verifiedEmail: "intruder@example.com" }), code("email-mismatch"));
  assert.equal((await invitations.inspect(token)).status, "pending");
});

test("pending invitations are capped per tenant and options are validated", async () => {
  const { invitations } = setup({ maxPendingPerTenant: 2 });
  await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "1@example.com", role: "member" });
  await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "2@example.com", role: "member" });
  await assert.rejects(invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "3@example.com", role: "member" }), code("too-many-pending"));
  // Rotating an existing address is still allowed at the cap.
  await invitations.invite({ userId: "alice" }, { tenantId: "acme", email: "2@example.com", role: "member" });
  assert.throws(() => setup({ ttlMs: 1000 }), RangeError);
  assert.throws(() => createInvitations({ store: new MemoryInvitationStore(), authorize, roles: [] }), RangeError);
  assert.equal(normalizeEmail("  Foo@BAR.Com"), "Foo@bar.com");
});

function http(extra = {}) {
  const { invitations, store } = setup();
  const sent = [];
  const users = { alice: { userId: "alice", verifiedEmail: "alice@acme.test" }, newbie: { userId: "newbie", verifiedEmail: "newbie@example.com" } };
  const handler = createInvitationHandler({
    invitations, prefix: "/api/invitations", allowedOrigins: ["https://app.test"],
    authenticate: async (request) => users[request.headers.get("x-test-user")] ?? null,
    sendInvitation: async (invitation, token) => { sent.push({ invitation, token }); },
    ...extra,
  });
  const call = (method, path, { user, body, origin = "https://app.test" } = {}) => handler(new Request("https://app.test" + path, {
    method, headers: { ...(user ? { "x-test-user": user } : {}), ...(origin ? { origin } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { call, sent, store };
}

test("HTTP adapter: invite, inspect, accept and list with the right status codes", async () => {
  const { call, sent } = http();
  const created = await call("POST", "/api/invitations", { user: "alice", body: { tenantId: "acme", email: "newbie@example.com", role: "member" } });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  const { invitation } = await created.json();
  assert.equal(sent.length, 1);
  assert.ok(!JSON.stringify(invitation).includes(sent[0].token), "the token is only given to the email sender");
  const inspected = await (await call("POST", "/api/invitations/inspect", { body: { token: sent[0].token } })).json();
  assert.deepEqual(Object.keys(inspected.invitation).sort(), ["email", "expiresAt", "role", "status", "tenantId"]);
  assert.equal((await call("POST", "/api/invitations/accept", { body: { token: sent[0].token } })).status, 401);
  assert.equal((await call("POST", "/api/invitations/accept", { user: "newbie", body: { token: sent[0].token } })).status, 200);
  assert.equal((await call("POST", "/api/invitations/accept", { user: "newbie", body: { token: sent[0].token } })).status, 409);
  const list = await (await call("GET", "/api/invitations?tenantId=acme", { user: "alice", origin: null })).json();
  assert.deepEqual(list.invitations, []);
});

test("HTTP adapter: origin, forbidden, revoke, bad input and failed delivery", async () => {
  const { call, sent, store } = http();
  assert.equal((await call("POST", "/api/invitations", { user: "alice", origin: "https://evil.test", body: { tenantId: "acme", email: "a@example.com", role: "member" } })).status, 403);
  assert.equal((await call("POST", "/api/invitations", { user: "newbie", body: { tenantId: "acme", email: "a@example.com", role: "member" } })).status, 403);
  await call("POST", "/api/invitations", { user: "alice", body: { tenantId: "acme", email: "a@example.com", role: "member" } });
  const id = sent[0].invitation.id;
  assert.equal((await call("DELETE", `/api/invitations/${id}`, { user: "alice" })).status, 200);
  assert.equal((await call("POST", "/api/invitations/accept", { user: "newbie", body: { token: sent[0].token } })).status, 410);
  assert.equal((await call("POST", "/api/invitations", { user: "alice", body: [1] })).status, 400);
  assert.equal((await call("PUT", "/api/invitations", { user: "alice" })).status, 405);
  assert.equal((await call("GET", "/elsewhere", { user: "alice" })).status, 404);
  const failing = http({ sendInvitation: async () => { throw new Error("smtp down"); } });
  const response = await failing.call("POST", "/api/invitations", { user: "alice", body: { tenantId: "acme", email: "b@example.com", role: "member" } });
  assert.equal(response.status, 502);
  assert.deepEqual(await failing.store.listPending("acme"), [], "a failed delivery leaves nothing pending");
});
