// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  ACCEPT_BELOW, ALPHABET, ApiKeyError, LOOKUP_LENGTH, SECRET_LENGTH, createApiKeys, parseApiKey, randomBase62, timingSafeEqual,
} from "../.build/modules/api-keys/files/core.js";
import { MemoryApiKeyStore } from "../.build/modules/api-keys/files/memory-store.js";
import { authenticateRequest } from "../.build/modules/api-keys/files/http.js";

const PEPPER = "test-pepper-0123456789-abcdefghijklmnop";
// alice is an admin of acme holding invoices:read/write; bob is an acme member who may create keys but holds only
// invoices:read; viewer may list but not create or revoke; eve administers globex.
const members = new Map([
  ["alice", { acme: { role: "admin", scopes: ["invoices:read", "invoices:write"] } }],
  ["bob", { acme: { role: "member", scopes: ["invoices:read"] } }],
  ["viewer", { acme: { role: "viewer", scopes: ["invoices:read"] } }],
  ["eve", { globex: { role: "admin", scopes: ["invoices:read", "invoices:write"] } }],
]);
async function authorize(actor, action, { tenantId }) {
  const membership = members.get(actor.userId)?.[tenantId];
  if (!membership) return false;
  if (action === "list") return true;
  if (action === "create") return membership.role !== "viewer";
  return membership.role === "admin";
}
async function holderScopes(actor, tenantId) {
  return members.get(actor.userId)?.[tenantId]?.scopes ?? [];
}
const alice = { userId: "alice" }, bob = { userId: "bob" }, viewer = { userId: "viewer" }, eve = { userId: "eve" };
const code = (expected) => (error) => error instanceof ApiKeyError && error.code === expected;
const secretOf = (key) => key.split("_")[3];

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const store = extra.store ?? new MemoryApiKeyStore();
  const events = [];
  const keys = createApiKeys({
    store, authorize, holderScopes, pepper: PEPPER, appPrefix: "gl", now: () => now,
    newId: () => `k-${String(++counter).padStart(4, "0")}`, onAudit: (event) => { events.push(event); }, ...extra,
  });
  return { store, keys, events, advance: (ms) => { now += ms; }, at: () => now };
}

test("generate: CSPRNG keys with an identifiable non-secret prefix and about 256 bits of secret", async () => {
  assert.equal(ALPHABET.length, 62);
  assert.equal(ACCEPT_BELOW, 248);
  assert.equal(LOOKUP_LENGTH, 12);
  assert.equal(SECRET_LENGTH, 43);
  assert.ok(Math.log2(62) * SECRET_LENGTH >= 256, "secret entropy is at least 256 bits");
  const { keys } = setup();
  const { key, info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  assert.match(key, /^gl_live_[0-9A-Za-z]{12}_[0-9A-Za-z]{43}$/);
  assert.equal(info.prefix, key.split("_").slice(0, 3).join("_"));
  assert.ok(!info.prefix.includes(secretOf(key)));
  const test1 = await keys.create(alice, { tenantId: "acme", name: "Sandbox", scopes: ["invoices:read"], environment: "test" });
  assert.match(test1.key, /^gl_test_/);
  // The default random source is the platform CSPRNG: 200 keys, no repeated secrets or lookup ids.
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const { key: next } = await keys.create(alice, { tenantId: "acme", name: `k${i}`, scopes: ["invoices:read"] });
    seen.add(secretOf(next)); seen.add(next.split("_")[2]);
  }
  assert.equal(seen.size, 400);
  assert.deepEqual(parseApiKey(key, "gl"), { environment: "live", lookupId: key.split("_")[2], prefix: info.prefix });
  for (const bad of [key + "x", key.replace("gl_", "zz_"), key.replace("_live_", "_prod_"), "gl_live_short_secret", 42, null, "a".repeat(500)]) {
    assert.equal(parseApiKey(bad, "gl"), null);
  }
  assert.throws(() => setup({ appPrefix: "Bad_Prefix" }), RangeError);
  assert.throws(() => setup({ pepper: "too-short" }), RangeError);
});

test("rejection sampling: bytes at or above 248 are discarded, so every base62 character is equally likely", () => {
  const fixed = [248, 255, 0, 61, 62, 247];
  let offset = 0;
  const bytes = (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = fixed[offset++] ?? 0; return out; };
  assert.equal(randomBase62(4, bytes), "0z0z");
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const counts = new Map();
  for (const ch of randomBase62(248, () => all)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  assert.equal(counts.size, 62);
  assert.ok([...counts.values()].every((n) => n === 4), "uniform: no modulo bias");
  assert.throws(() => randomBase62(4, (n) => new Uint8Array(n).fill(255)), /rejected bytes/);
});

test("show once, hash at rest: only the HMAC-SHA-256 under the pepper is stored", async () => {
  const { keys, store } = setup();
  const { key, info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  const record = await store.findById(info.id);
  assert.equal(record.keyHash, createHmac("sha256", PEPPER).update(key).digest("hex"));
  assert.equal(record.lookupId, key.split("_")[2]);
  const stored = JSON.stringify(record);
  assert.ok(!stored.includes(key) && !stored.includes(secretOf(key)), "the stored row never holds the key or its secret");
  // The plaintext is only in the create result; list and revoke return info without secret or hash.
  assert.ok(!("key" in info) && !("keyHash" in info) && !("lookupId" in info));
  const listed = await keys.list(alice, "acme");
  assert.equal(listed.length, 1);
  assert.ok(!("keyHash" in listed[0]));
  assert.ok(!JSON.stringify(listed).includes(secretOf(key)) && !JSON.stringify(listed).includes(record.keyHash));
  const revoked = await keys.revoke(alice, info.id);
  assert.ok(!JSON.stringify(revoked).includes(secretOf(key)) && !("keyHash" in revoked));
  // A different pepper gives a different digest, so a leaked table alone cannot verify keys.
  const other = setup({ store, pepper: "another-pepper-0123456789-abcdefghijkl" });
  await assert.rejects(other.keys.verify(key), code("invalid-key"));
});

test("verify: looks up by the lookup id and compares digests in constant time, with the same work for unknown ids", async () => {
  const lookups = [];
  const inner = new MemoryApiKeyStore();
  const store = Object.assign(Object.create(inner), {
    insert: (r) => inner.insert(r), findById: (id) => inner.findById(id), listByTenant: (t) => inner.listByTenant(t),
    revoke: (...a) => inner.revoke(...a), touchLastUsed: (...a) => inner.touchLastUsed(...a),
    findByLookupId: (id) => { lookups.push(id); return inner.findByLookupId(id); },
  });
  const { keys } = setup({ store });
  const { key, info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  const principal = await keys.verify(key);
  assert.deepEqual(principal, { tenantId: "acme", keyId: info.id, prefix: info.prefix, environment: "live", scopes: ["invoices:read"] });
  assert.deepEqual(lookups, [key.split("_")[2]]);
  // Known lookup id with a wrong secret, an unknown lookup id, and a malformed key all fail the same way.
  const last = key.at(-1) === "a" ? "b" : "a";
  const wrongSecret = key.slice(0, -1) + last;
  const unknownId = `gl_live_${"Z".repeat(12)}_${secretOf(key)}`;
  // Count HMAC computations: a known and an unknown lookup id each cost exactly one HMAC and one comparison.
  const original = SubtleCrypto.prototype.sign;
  let signs = 0;
  SubtleCrypto.prototype.sign = function (...args) { signs++; return original.apply(this, args); };
  try {
    for (const presented of [wrongSecret, unknownId]) {
      signs = 0;
      await assert.rejects(keys.verify(presented), (error) => code("invalid-key")(error) && !error.message.includes(presented));
      assert.equal(signs, 1, "one HMAC whether or not the lookup id exists");
    }
  } finally {
    SubtleCrypto.prototype.sign = original;
  }
  for (const bad of ["", "Bearer x", `${key} `, key.replace("gl_", "sk_"), undefined]) await assert.rejects(keys.verify(bad), code("invalid-key"));
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
});

test("scoped tenant: a key authenticates as its one tenant and is limited to its scopes", async () => {
  const { keys } = setup();
  const acmeKey = await keys.create(alice, { tenantId: "acme", name: "reader", scopes: ["invoices:read"] });
  const globexKey = await keys.create(eve, { tenantId: "globex", name: "writer", scopes: ["invoices:read", "invoices:write"] });
  assert.equal((await keys.verify(acmeKey.key, ["invoices:read"])).tenantId, "acme");
  await assert.rejects(keys.verify(acmeKey.key, ["invoices:write"]), code("insufficient-scope"));
  await assert.rejects(keys.verify(acmeKey.key, ["invoices:read", "invoices:write"]), code("insufficient-scope"));
  const globex = await keys.verify(globexKey.key, ["invoices:write"]);
  assert.equal(globex.tenantId, "globex");
  assert.deepEqual(globex.scopes, ["invoices:read", "invoices:write"]);
  // Tenants do not see each other's keys.
  assert.deepEqual((await keys.list(alice, "acme")).map((k) => k.id), [acmeKey.info.id]);
  assert.deepEqual((await keys.list(eve, "globex")).map((k) => k.id), [globexKey.info.id]);
});

test("revoke and expire: rejected on the very next request", async () => {
  const { keys, advance, at } = setup({ acceptEnvironments: ["live"] });
  const { key, info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  await keys.verify(key);
  const revoked = await keys.revoke(alice, info.id);
  assert.equal(revoked.revokedAt, at());
  assert.equal(revoked.revokedBy, "alice");
  await assert.rejects(keys.verify(key), code("revoked"));
  assert.equal((await keys.revoke(alice, info.id)).revokedAt, revoked.revokedAt, "revoking twice is a no-op");
  const expiring = await keys.create(alice, { tenantId: "acme", name: "temp", scopes: ["invoices:read"], expiresAt: at() + 1000 });
  await keys.verify(expiring.key);
  advance(999);
  await keys.verify(expiring.key);
  advance(1);
  await assert.rejects(keys.verify(expiring.key), code("expired"));
  await assert.rejects(keys.create(alice, { tenantId: "acme", name: "past", scopes: ["invoices:read"], expiresAt: at() }), code("invalid-expiry"));
  const sandbox = await keys.create(alice, { tenantId: "acme", name: "sandbox", scopes: ["invoices:read"], environment: "test" });
  await assert.rejects(keys.verify(sandbox.key), code("environment-not-allowed"));
  await assert.rejects(keys.revoke(alice, "k-9999"), code("not-found"));
});

test("managed by authorized members, who cannot mint more access than they hold", async () => {
  const { keys } = setup();
  const { info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read", "invoices:write"] });
  await assert.rejects(keys.create(viewer, { tenantId: "acme", name: "x", scopes: ["invoices:read"] }), code("forbidden"));
  await assert.rejects(keys.create(eve, { tenantId: "acme", name: "x", scopes: ["invoices:read"] }), code("forbidden"));
  await assert.rejects(keys.list(eve, "acme"), code("forbidden"));
  await assert.rejects(keys.revoke(eve, info.id), code("forbidden"));
  await assert.rejects(keys.revoke(bob, info.id), code("forbidden"));
  // bob may create keys but holds only invoices:read.
  await assert.rejects(keys.create(bob, { tenantId: "acme", name: "x", scopes: ["invoices:write"] }), code("scope-exceeds-holder"));
  await assert.rejects(keys.create(bob, { tenantId: "acme", name: "x", scopes: ["invoices:read", "admin"] }), code("scope-exceeds-holder"));
  assert.deepEqual((await keys.create(bob, { tenantId: "acme", name: "mine", scopes: ["invoices:read"] })).info.scopes, ["invoices:read"]);
  assert.equal((await keys.list(viewer, "acme")).length, 2);
  for (const scopes of [[], ["Invoices:Read"], ["invoices:read", "invoices:read"], "invoices:read"]) {
    await assert.rejects(keys.create(alice, { tenantId: "acme", name: "x", scopes }), code("invalid-scopes"));
  }
  await assert.rejects(keys.create(alice, { tenantId: "acme", name: " ", scopes: ["invoices:read"] }), code("invalid-name"));
  await assert.rejects(keys.create(alice, { tenantId: "bad tenant!", name: "x", scopes: ["invoices:read"] }), code("invalid-tenant"));
});

test("audit and last used: events carry ids and prefixes only, and last-used writes are throttled", async () => {
  const { keys, store, events, advance, at } = setup({ lastUsedIntervalMs: 60_000 });
  const { key, info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  const created = at();
  await keys.verify(key);
  assert.equal((await store.findById(info.id)).lastUsedAt, created);
  advance(30_000);
  await keys.verify(key);
  assert.equal((await store.findById(info.id)).lastUsedAt, created, "no write inside the interval");
  advance(30_000);
  await keys.verify(key);
  assert.equal((await store.findById(info.id)).lastUsedAt, at(), "written again once the interval passed");
  await assert.rejects(keys.verify(key, ["invoices:write"]), code("insufficient-scope"));
  await assert.rejects(keys.verify(key.slice(0, -1) + (key.at(-1) === "a" ? "b" : "a")), code("invalid-key"));
  await keys.revoke(alice, info.id);
  await assert.rejects(keys.verify(key), code("revoked"));
  assert.deepEqual(events.map((e) => e.type), ["key.created", "key.used", "key.used", "key.denied", "key.denied", "key.revoked", "key.denied"]);
  assert.deepEqual(events[0], { type: "key.created", at: created, tenantId: "acme", keyId: info.id, prefix: info.prefix, actorId: "alice", scopes: ["invoices:read"], expiresAt: null });
  assert.deepEqual(events.filter((e) => e.type === "key.denied").map((e) => e.reason), ["insufficient-scope", "invalid-key", "revoked"]);
  assert.equal(events[5].actorId, "alice");
  const record = await store.findById(info.id);
  const log = JSON.stringify(events);
  assert.ok(!log.includes(secretOf(key)) && !log.includes(key) && !log.includes(record.keyHash), "no secret or hash in audit events");
  // Creation, revocation and last use are also recorded on the row itself.
  assert.equal(record.createdBy, "alice");
  assert.equal(record.createdAt, created);
  assert.equal(record.revokedBy, "alice");
  assert.ok(record.lastUsedAt > created);
  // A failing audit sink does not break authentication.
  const broken = setup({ onAudit: () => { throw new Error("sink down"); } });
  const made = await broken.keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  assert.equal((await broken.keys.verify(made.key)).keyId, made.info.id);
  // Interval 0 records every use.
  const every = setup({ lastUsedIntervalMs: 0 });
  const k = await every.keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  await every.keys.verify(k.key); await every.keys.verify(k.key);
  assert.equal(every.events.filter((e) => e.type === "key.used").length, 2);
});

test("authenticateRequest: Bearer header, 401 and 403 mapping, never echoing the key", async () => {
  const { keys } = setup();
  const { key, info } = await keys.create(alice, { tenantId: "acme", name: "CI", scopes: ["invoices:read"] });
  const request = (authorization) => new Request("https://api.example.com/v1/invoices", authorization === undefined ? {} : { headers: { authorization } });
  const ok = await authenticateRequest(keys, request(`Bearer ${key}`), ["invoices:read"]);
  assert.equal(ok.ok, true);
  assert.equal(ok.principal.keyId, info.id);
  assert.equal((await authenticateRequest(keys, request(`bearer ${key}`))).ok, true, "scheme is case-insensitive");
  const missing = await authenticateRequest(keys, request(undefined));
  assert.equal(missing.status, 401);
  assert.equal(missing.response.headers.get("www-authenticate"), 'Bearer realm="api"');
  for (const header of [`Basic ${key}`, `Bearer ${key} extra`, "Bearer", `Bearer ${key.slice(0, -2)}`]) {
    const result = await authenticateRequest(keys, request(header));
    assert.equal(result.status, 401);
    assert.ok(!(await result.response.text()).includes(secretOf(key)));
  }
  const scope = await authenticateRequest(keys, request(`Bearer ${key}`), ["invoices:write"], { realm: "billing" });
  assert.equal(scope.status, 403);
  assert.equal(scope.response.headers.get("www-authenticate"), 'Bearer realm="billing", error="insufficient_scope", scope="invoices:write"');
  assert.deepEqual(await scope.response.json(), { error: "insufficient-scope" });
  await keys.revoke(alice, info.id);
  const revoked = await authenticateRequest(keys, request(`Bearer ${key}`));
  assert.equal(revoked.status, 401);
  assert.equal(revoked.response.headers.get("www-authenticate"), 'Bearer realm="api", error="invalid_token"');
  assert.equal(revoked.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await revoked.response.json(), { error: "revoked" });
});
