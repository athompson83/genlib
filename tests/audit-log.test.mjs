// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  AuditLogError, GENESIS_HASH, REDACTED, canonicalJson, createAuditLog, csvCell, hashInput, redactDetails,
} from "../.build/modules/audit-log/files/core.js";
import { MemoryAuditStore } from "../.build/modules/audit-log/files/memory-store.js";
import { createAuditLogHandler } from "../.build/modules/audit-log/files/http.js";

// alice administers acme, bob is an ordinary acme member, eve administers globex.
const roles = new Map([["alice", { acme: "admin" }], ["bob", { acme: "member" }], ["eve", { globex: "admin" }]]);
const authorize = async (actor, _action, { tenantId }) => roles.get(actor.userId)?.[tenantId] === "admin";
const alice = { userId: "alice" }, bob = { userId: "bob" }, eve = { userId: "eve" };
const code = (expected) => (error) => error instanceof AuditLogError && error.code === expected;
const DAY = 86_400_000;

function setup(extra = {}) {
  let now = Date.UTC(2026, 0, 1);
  let counter = 0;
  const store = extra.store ?? new MemoryAuditStore();
  const audit = createAuditLog({
    store, authorize, retentionMs: 30 * DAY, now: () => now, newId: () => `e-${String(++counter).padStart(4, "0")}`, ...extra,
  });
  return { store, audit, advance: (ms) => { now += ms; }, at: () => now };
}

const entry = (over = {}) => ({
  tenantId: "acme", actor: { id: "alice" }, action: "member.invite", target: { type: "member", id: "m-1" },
  outcome: "success", requestId: "req-1", ...over,
});

async function collect(generator) {
  let text = "";
  for await (const chunk of generator) text += chunk;
  return text;
}

test("record stores actor, tenant, action, target, time, outcome and request id in a hash chain", async () => {
  const { audit, at } = setup();
  const first = await audit.record(null, entry({ details: { role: "editor" } }));
  assert.deepEqual(
    { ...first, hash: undefined },
    {
      id: "e-0001", tenantId: "acme", seq: 1, at: at(), actorType: "user", actorId: "alice", action: "member.invite",
      targetType: "member", targetId: "m-1", outcome: "success", requestId: "req-1", details: { role: "editor" },
      prevHash: GENESIS_HASH, hash: undefined,
    },
  );
  assert.match(first.hash, /^[0-9a-f]{64}$/);
  const expected = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput(first)))).toString("hex");
  assert.equal(first.hash, expected);
  const second = await audit.record(null, entry({ actor: { id: "svc-billing", type: "service" }, action: "auth.login", target: null, outcome: "denied", requestId: null }));
  assert.equal(second.seq, 2);
  assert.equal(second.prevHash, first.hash);
  assert.equal(second.actorType, "service");
  assert.equal(second.targetType, null);
  assert.equal(second.requestId, null);
  assert.deepEqual(await audit.verifyChain("acme"), { ok: true, count: 2, head: { seq: 2, hash: second.hash, anchorSeq: 0, anchorHash: GENESIS_HASH } });

  await assert.rejects(audit.record(null, entry({ tenantId: "bad tenant" })), code("invalid-tenant"));
  await assert.rejects(audit.record(null, entry({ actor: { id: "" } })), code("invalid-actor"));
  await assert.rejects(audit.record(null, entry({ actor: { id: "x", type: "root" } })), code("invalid-actor"));
  await assert.rejects(audit.record(null, entry({ action: "Member Invite" })), code("invalid-action"));
  await assert.rejects(audit.record(null, entry({ target: { type: "member" } })), code("invalid-target"));
  await assert.rejects(audit.record(null, entry({ outcome: "ok" })), code("invalid-outcome"));
  await assert.rejects(audit.record(null, entry({ requestId: "has space" })), code("invalid-request-id"));
  await assert.rejects(audit.record(null, entry({ details: ["x"] })), code("invalid-details"));
  assert.throws(() => setup({ retentionMs: 0 }), RangeError);
  assert.throws(() => setup({ hmacKey: new Uint8Array(8) }), RangeError);
});

test("redaction removes secrets, card numbers, SSNs, bearer tokens and JWTs before hashing and masks emails by default", async () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
  const raw = {
    password: "hunter2", newPassword: "x", "X-API-Key": "k", headers: { Authorization: "Bearer abc.def", cookie: "sid=1" },
    githubToken: "ghp_1", client_secret: "s", nested: [{ apiKey: "a" }, { ssn: "123-45-6789" }],
    note: `paid with 4242 4242 4242 4242 using ${jwt}; header Bearer tok_123`, notACard: "order 1234567890123",
    contact: "Ada.Lovelace@example.com", count: 3, ok: true, when: new Date(0), big: 10n, nan: Number.NaN, fn() {},
  };
  const clean = redactDetails(raw);
  assert.equal(clean.password, REDACTED);
  assert.equal(clean.newPassword, REDACTED);
  assert.equal(clean["X-API-Key"], REDACTED);
  assert.equal(clean.headers.Authorization, REDACTED);
  assert.equal(clean.headers.cookie, REDACTED);
  assert.equal(clean.githubToken, REDACTED);
  assert.equal(clean.client_secret, REDACTED);
  assert.deepEqual(clean.nested, [{ apiKey: REDACTED }, { ssn: REDACTED }]);
  assert.equal(clean.note, `paid with [REDACTED card ending 4242] using ${REDACTED}; header Bearer ${REDACTED}`);
  assert.equal(clean.notACard, "order 1234567890123", "a number that fails the Luhn check is kept");
  assert.equal(redactDetails({ free: "applicant 078-05-1120 approved" }).free, "applicant [REDACTED ssn] approved");
  assert.equal(clean.contact, "A***@example.com", "emails are masked by default");
  assert.equal(redactDetails({ contact: "ada@example.com" }, { maskEmails: false }).contact, "ada@example.com");
  assert.equal(clean.when, "1970-01-01T00:00:00.000Z");
  assert.equal(clean.big, "10");
  assert.equal(clean.nan, null);
  assert.ok(!("fn" in clean));
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  assert.deepEqual(redactDetails(cyclic), { a: 1, self: "[Circular]" });

  const { audit } = setup({ maskEmails: true, redactKeys: ["dob"], redactPatterns: [/acct-\d+/] });
  const recorded = await audit.record(null, entry({ details: { ...raw, dob: "1990-01-01", ref: "acct-991 for bob@corp.io" } }));
  assert.equal(recorded.details.contact, "A***@example.com");
  assert.equal(recorded.details.dob, REDACTED);
  assert.equal(recorded.details.ref, `${REDACTED} for b***@corp.io`);
  const stored = JSON.stringify(recorded) + hashInput(recorded);
  for (const secret of ["hunter2", "ghp_1", "abc.def", "sid=1", "4242 4242", jwt, "123-45-6789", "Lovelace"]) {
    assert.ok(!stored.includes(secret), `${secret} must not be stored or hashed`);
  }
  assert.equal((await audit.verifyChain("acme")).ok, true);
  const huge = await audit.record(null, entry({ details: { blob: "x".repeat(2000), more: "y".repeat(2000), again: "z".repeat(2000), last: "w".repeat(2000), extra: "v".repeat(500) } }));
  assert.equal(huge.details["[truncated]"], true);
});

test("verifyChain detects an edited, deleted, inserted or reordered entry and a removed tail", async () => {
  const base = new MemoryAuditStore();
  let mutate = (rows) => rows;
  const store = {
    append: (...args) => base.append(...args), head: (t) => base.head(t), page: (...args) => base.page(...args),
    purge: (...args) => base.purge(...args), tenants: () => base.tenants(),
    scan: async (...args) => mutate(await base.scan(...args)),
  };
  const { audit } = setup({ store });
  for (let i = 0; i < 4; i++) await audit.record(null, entry({ requestId: `req-${i}` }));
  assert.equal((await audit.verifyChain("acme")).ok, true);
  mutate = (rows) => rows.map((row) => (row.seq === 2 ? { ...row, outcome: "failure" } : row));
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "hash-mismatch", seq: 2 });
  mutate = (rows) => rows.filter((row) => row.seq !== 3);
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "sequence-gap", seq: 3 });
  mutate = (rows) => { const out = [...rows]; [out[1], out[2]] = [{ ...out[2], seq: 2 }, { ...out[1], seq: 3 }]; return out; };
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "broken-link", seq: 2 });
  mutate = (rows) => rows.filter((row) => row.seq !== 4);
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "sequence-gap", seq: 4 });
  mutate = (rows) => rows;
  const checkpoint = await audit.checkpoint("acme");
  assert.deepEqual(checkpoint.seq, 4);
  assert.equal((await audit.verifyChain("acme", checkpoint)).ok, true);
  assert.deepEqual(await audit.verifyChain("acme", { seq: 2, hash: "f".repeat(64) }), { ok: false, reason: "checkpoint-mismatch", seq: 2 });
  assert.deepEqual(await audit.verifyChain("acme", { seq: 9, hash: checkpoint.hash }), { ok: false, reason: "checkpoint-mismatch", seq: 9 });
});

test("hmacKey: chains verify only with the same key", async () => {
  const store = new MemoryAuditStore();
  const key = crypto.getRandomValues(new Uint8Array(32));
  const { audit } = setup({ store, hmacKey: key });
  await audit.record(null, entry());
  assert.equal((await audit.verifyChain("acme")).ok, true);
  assert.deepEqual(await setup({ store }).audit.verifyChain("acme"), { ok: false, reason: "hash-mismatch", seq: 1 });
  assert.deepEqual(await setup({ store, hmacKey: new Uint8Array(32) }).audit.verifyChain("acme"), { ok: false, reason: "hash-mismatch", seq: 1 });
});

test("tenant-scoped read: only tenant administrators can query or export, never another tenant", async () => {
  const { audit } = setup();
  await audit.record(null, entry());
  await audit.record(null, entry({ tenantId: "globex", actor: { id: "eve" } }));
  const own = await audit.query(alice, { tenantId: "acme" });
  assert.deepEqual(own.entries.map((e) => e.tenantId), ["acme"]);
  await assert.rejects(audit.query(bob, { tenantId: "acme" }), code("forbidden"));
  await assert.rejects(audit.query(eve, { tenantId: "acme" }), code("forbidden"));
  await assert.rejects(audit.query(alice, { tenantId: "globex" }), code("forbidden"));
  await assert.rejects(audit.export(bob, { tenantId: "acme", format: "csv" }), code("forbidden"));
  await assert.rejects(audit.export(eve, { tenantId: "acme", format: "ndjson" }), code("forbidden"));
  const checks = [];
  const spy = setup({ authorize: async (actor, action, target) => { checks.push([actor.userId, action, target.tenantId]); return true; } });
  await spy.audit.query(alice, { tenantId: "acme" });
  await spy.audit.export(alice, { tenantId: "acme", format: "csv" });
  assert.deepEqual(checks, [["alice", "read", "acme"], ["alice", "export", "acme"]]);
});

test("query filters by actor, action, prefix and time range, newest first with keyset cursors", async () => {
  const { audit, advance, at } = setup();
  const start = at();
  const plan = [["alice", "member.invite"], ["bob", "member.remove"], ["alice", "project.delete"], ["alice", "member.invite"], ["bob", "member.invite"]];
  for (const [actor, action] of plan) { await audit.record(null, entry({ actor: { id: actor }, action })); advance(1000); }
  await audit.record(null, entry({ tenantId: "globex", actor: { id: "alice" } }));
  const all = await audit.query(alice, { tenantId: "acme" });
  assert.deepEqual(all.entries.map((e) => e.seq), [5, 4, 3, 2, 1]);
  const page1 = await audit.query(alice, { tenantId: "acme", limit: 2 });
  assert.deepEqual(page1.entries.map((e) => e.seq), [5, 4]);
  const page2 = await audit.query(alice, { tenantId: "acme", limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.entries.map((e) => e.seq), [3, 2]);
  const page3 = await audit.query(alice, { tenantId: "acme", limit: 2, cursor: page2.nextCursor });
  assert.deepEqual(page3.entries.map((e) => e.seq), [1]);
  assert.equal(page3.nextCursor, null);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", actorId: "alice" })).entries.map((e) => e.seq), [4, 3, 1]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", action: "member.invite" })).entries.map((e) => e.seq), [5, 4, 1]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", actionPrefix: "member." })).entries.map((e) => e.seq), [5, 4, 2, 1]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", from: start + 1000, to: start + 3000 })).entries.map((e) => e.seq), [3, 2]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", actorId: "alice", action: "member.invite", limit: 1 })).entries.map((e) => e.seq), [4]);
  await assert.rejects(audit.query(alice, { tenantId: "acme", limit: 0 }), code("invalid-limit"));
  await assert.rejects(audit.query(alice, { tenantId: "acme", limit: 201 }), code("invalid-limit"));
  await assert.rejects(audit.query(alice, { tenantId: "acme", cursor: "not-a-cursor!" }), code("invalid-cursor"));
  await assert.rejects(audit.query(alice, { tenantId: "acme", from: 5, to: 5 }), code("invalid-range"));
  await assert.rejects(audit.query(alice, { tenantId: "acme", action: "DROP TABLE" }), code("invalid-filter"));
});

test("export: CSV neutralizes formula injection and NDJSON streams every page", async () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("\tx"), "'\tx");
  assert.equal(csvCell("\rx"), "\"'\rx\"");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("plain"), "plain");
  const { audit } = setup();
  await audit.record(null, entry({ actor: { id: "=HYPERLINK(\"http://evil\")" }, target: { type: "doc", id: "@x" }, details: { note: "line1\nline2" } }));
  for (let i = 0; i < 6; i++) await audit.record(null, entry({ requestId: `req-${i}` }));
  const csv = await collect(await audit.export(alice, { tenantId: "acme", format: "csv", pageSize: 2 }));
  const lines = csv.split("\r\n").filter(Boolean);
  assert.equal(lines[0], "seq,at,id,tenant_id,actor_type,actor_id,action,target_type,target_id,outcome,request_id,details,prev_hash,hash");
  assert.equal(lines.length, 8);
  assert.ok(lines[7].includes(`,"'=HYPERLINK(""http://evil"")",`));
  assert.ok(lines[7].includes(",'@x,"));
  assert.ok(lines[7].includes('"{""note"":""line1\\nline2""}"'));
  const chunks = [];
  for await (const chunk of await audit.export(alice, { tenantId: "acme", format: "ndjson", pageSize: 3, actorId: "alice" })) chunks.push(chunk);
  assert.equal(chunks.length, 2, "6 matching rows in pages of 3");
  const rows = chunks.join("").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((r) => r.seq), [7, 6, 5, 4, 3, 2]);
  assert.equal(canonicalJson(rows[0].details), "{}");
  await assert.rejects(audit.export(alice, { tenantId: "acme", format: "xlsx" }), code("invalid-format"));
});

test("retention: entries past the declared period are hidden, purged, and the chain still verifies from the anchor", async () => {
  const { audit, advance, store } = setup();
  for (let i = 0; i < 3; i++) await audit.record(null, entry({ requestId: `old-${i}` }));
  await audit.record(null, entry({ tenantId: "globex", actor: { id: "eve" } }));
  advance(20 * DAY);
  for (let i = 0; i < 2; i++) await audit.record(null, entry({ requestId: `new-${i}` }));
  advance(11 * DAY);
  // The first three acme entries are now 31 days old: hidden before any purge runs.
  assert.deepEqual((await audit.query(alice, { tenantId: "acme" })).entries.map((e) => e.requestId), ["new-1", "new-0"]);
  assert.deepEqual((await audit.query(alice, { tenantId: "acme", from: 0 })).entries.length, 2);
  const result = await audit.purgeExpired();
  assert.equal(result.purged, 4, "three acme entries and one globex entry");
  const head = await store.head("acme");
  assert.equal(head.anchorSeq, 3);
  assert.equal(head.seq, 5);
  assert.deepEqual(await audit.verifyChain("acme"), { ok: true, count: 2, head });
  assert.equal((await audit.verifyChain("globex")).ok, true);
  const next = await audit.record(null, entry({ requestId: "after" }));
  assert.equal(next.seq, 6);
  assert.equal((await audit.verifyChain("acme")).ok, true);
  assert.equal((await audit.purgeExpired("acme")).purged, 0);
});

test("concurrent records for one tenant form one valid chain", async () => {
  const { audit } = setup();
  await Promise.all(Array.from({ length: 25 }, (_, i) => audit.record(null, entry({ requestId: `r-${i}` }))));
  const result = await audit.verifyChain("acme");
  assert.equal(result.ok, true);
  assert.equal(result.count, 25);
});

test("HTTP handler: query, CSV and NDJSON export, 401, 403, 400, 404 and 405", async () => {
  const { audit } = setup();
  for (let i = 0; i < 3; i++) await audit.record(null, entry({ requestId: `req-${i}` }));
  const users = { "token-alice": alice, "token-bob": bob };
  const handler = createAuditLogHandler({
    audit, prefix: "/api/audit/", authenticate: async (request) => users[request.headers.get("authorization")?.replace("Bearer ", "") ?? ""] ?? null,
  });
  const get = (path, token = "token-alice", method = "GET") => handler(new Request(`https://app.test${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} }));

  const ok = await get("/api/audit?tenantId=acme&limit=2");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.json();
  assert.deepEqual(body.entries.map((e) => e.seq), [3, 2]);
  const next = await (await get(`/api/audit?tenantId=acme&limit=2&cursor=${body.nextCursor}`)).json();
  assert.deepEqual(next.entries.map((e) => e.seq), [1]);
  const iso = await (await get("/api/audit?tenantId=acme&from=2025-12-31T00:00:00Z&to=2026-01-02T00:00:00Z")).json();
  assert.equal(iso.entries.length, 3);

  const csv = await get("/api/audit/export?tenantId=acme&format=csv");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(csv.headers.get("content-disposition"), 'attachment; filename="audit-acme.csv"');
  assert.equal((await csv.text()).split("\r\n").filter(Boolean).length, 4);
  const nd = await get("/api/audit/export?tenantId=acme&format=ndjson&action=member.invite");
  assert.equal(nd.headers.get("content-type"), "application/x-ndjson");
  assert.equal((await nd.text()).trim().split("\n").length, 3);

  assert.equal((await get("/api/audit?tenantId=acme", null)).status, 401);
  assert.equal((await get("/api/audit?tenantId=acme", "token-bob")).status, 403);
  assert.equal((await get("/api/audit/export?tenantId=acme", "token-bob")).status, 403);
  assert.equal((await get("/api/audit?tenantId=globex")).status, 403);
  assert.equal((await get("/api/audit?tenantId=acme&limit=abc")).status, 400);
  assert.equal((await get("/api/audit?tenantId=acme&from=yesterday")).status, 400);
  assert.equal((await get("/api/audit/export?tenantId=acme&format=xml")).status, 400);
  assert.equal((await get("/api/audit/other?tenantId=acme")).status, 404);
  const post = await get("/api/audit?tenantId=acme", "token-alice", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
});

test("verifyChain never accepts a checkpoint older than the anchor, or rows still present at or below the anchor", async () => {
  const base = new MemoryAuditStore();
  let headOverride = null;
  let mutate = (rows) => rows;
  const store = {
    append: (...args) => base.append(...args), page: (...args) => base.page(...args), purge: (...args) => base.purge(...args),
    tenants: () => base.tenants(), head: async (t) => headOverride ?? base.head(t), scan: async (...args) => mutate(await base.scan(...args)),
  };
  const { audit } = setup({ store });
  const recorded = [];
  for (let i = 0; i < 8; i++) recorded.push(await audit.record(null, entry({ requestId: `req-${i}` })));
  const cp5 = { seq: 5, hash: recorded[4].hash };
  const real = await base.head("acme");
  // Attacker deletes seq 1-6 and moves the anchor to entry 6.
  headOverride = { ...real, anchorSeq: 6, anchorHash: recorded[5].hash };
  mutate = (rows) => rows.filter((row) => row.seq > 6);
  assert.deepEqual(await audit.verifyChain("acme", cp5), { ok: false, reason: "checkpoint-purged", seq: 5 });
  // A faked purge: the anchor moved but the rows at or below it are still there.
  headOverride = { ...real, anchorSeq: 3, anchorHash: recorded[2].hash };
  mutate = (rows) => rows;
  assert.deepEqual(await audit.verifyChain("acme"), { ok: false, reason: "purged-rows-present", seq: 1 });
});

test("strings with lone UTF-16 surrogates are refused in ids and made well-formed in details", async () => {
  const { audit } = setup();
  await assert.rejects(audit.record(null, entry({ actor: { id: "bad\uD800" } })), code("invalid-actor"));
  await assert.rejects(audit.record(null, entry({ target: { type: "member", id: "\uDC00x" } })), code("invalid-target"));
  await assert.rejects(audit.query(alice, { tenantId: "acme", actorId: "a\uD83D" }), code("invalid-filter"));
  const ok = await audit.record(null, entry({ actor: { id: "zoë 😀" }, details: { "k\uDC00": "v\uD800", fine: "😀" } }));
  assert.deepEqual(ok.details, { "k�": "v�", fine: "😀" });
  assert.equal((await audit.verifyChain("acme")).ok, true);
});

test("emails are masked by default and kept only with maskEmails false", async () => {
  const masked = await setup().audit.record(null, entry({ details: { invited: "Ada.Lovelace@example.com" } }));
  assert.equal(masked.details.invited, "A***@example.com");
  const kept = await setup({ maskEmails: false }).audit.record(null, entry({ details: { invited: "ada@example.com" } }));
  assert.equal(kept.details.invited, "ada@example.com");
});
