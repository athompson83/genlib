// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { ACCEPT_BELOW, ALPHABET, RESERVED_SLUGS, ShortLinkError, createShortLinks, randomCode } from "../.build/modules/short-links/files/core.js";
import { MemoryShortLinkStore } from "../.build/modules/short-links/files/memory-store.js";
import { createManagementHandler, createRedirectHandler } from "../.build/modules/short-links/files/http.js";

// alice edits acme, viewer may only read acme, eve belongs to globex.
const members = new Map([["alice", { acme: "editor" }], ["viewer", { acme: "viewer" }], ["eve", { globex: "editor" }]]);
async function authorize(actor, action, { tenantId }) {
  const role = members.get(actor.userId)?.[tenantId];
  if (!role) return false;
  return action === "read" || role === "editor";
}
const alice = { userId: "alice" }, viewer = { userId: "viewer" }, eve = { userId: "eve" };
const code = (expected) => (error) => error instanceof ShortLinkError && error.code === expected;

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const store = extra.store ?? new MemoryShortLinkStore();
  const clicks = [];
  const links = createShortLinks({
    store, authorize, now: () => now, newId: () => `l-${String(++counter).padStart(4, "0")}`,
    blockHosts: ["sho.rt"], onClick: (event) => { clicks.push(event); }, ...extra,
  });
  return { store, links, clicks, advance: (ms) => { now += ms; }, at: () => now };
}

test("alphabet excludes look-alikes and codes have the configured length", async () => {
  assert.equal(ALPHABET.length, 57);
  assert.equal(new Set(ALPHABET).size, 57);
  for (const ch of "0Ol1I") assert.ok(!ALPHABET.includes(ch), `${ch} is excluded`);
  assert.equal(ACCEPT_BELOW, 228);
  const { links } = setup();
  const link = await links.create(alice, { tenantId: "acme", url: "https://example.com/a" });
  assert.equal(link.code.length, 7);
  assert.match(link.code, new RegExp(`^[${ALPHABET}]{7}$`));
  const long = await setup({ codeLength: 12 }).links.create(alice, { tenantId: "acme", url: "https://example.com/a" });
  assert.equal(long.code.length, 12);
  assert.throws(() => setup({ codeLength: 3 }), RangeError);
  assert.throws(() => setup({ allowedSchemes: ["https:", "javascript:"] }), RangeError);
});

test("rejection sampling: bytes at or above 228 are discarded, so every character is equally likely", () => {
  // 228 and 255 are rejected; 0 -> first char, 56 -> last, 57 wraps to first, 227 -> last.
  const fixed = [228, 255, 0, 56, 57, 227];
  let offset = 0;
  const bytes = (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = fixed[offset++] ?? 0; return out; };
  assert.equal(randomCode(4, bytes), ALPHABET[0] + ALPHABET[56] + ALPHABET[0] + ALPHABET[56]);
  // Feeding every byte value once: the 228 accepted bytes map onto each character exactly 4 times.
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  let used = false;
  const once = () => { if (used) return new Uint8Array(8).fill(255); used = true; return all; };
  const counts = new Map();
  // Draw 228 characters from one pass of 0..255: bytes 0..227 are all accepted, 228..255 never reached.
  const text = randomCode(228, (n) => { assert.ok(n >= 228); return once(); });
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  assert.equal(counts.size, 57);
  assert.ok([...counts.values()].every((n) => n === 4), "uniform: no modulo bias");
  // A source that only returns rejected bytes fails instead of spinning.
  assert.throws(() => randomCode(4, (n) => new Uint8Array(n).fill(250)), /rejected/);
});

test("URL validation: schemes, credentials, blocked hosts and redirect loops", async () => {
  const { links } = setup();
  const make = (url) => links.create(alice, { tenantId: "acme", url });
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://example.com/x", "vbscript:x"]) {
    await assert.rejects(make(bad), code("scheme-not-allowed"), bad);
  }
  await assert.rejects(make("JAVASCRIPT:alert(1)"), code("scheme-not-allowed"));
  await assert.rejects(make("not a url"), code("invalid-url"));
  await assert.rejects(make(""), code("invalid-url"));
  await assert.rejects(make(42), code("invalid-url"));
  await assert.rejects(make("https://example.com/" + "a".repeat(2100)), code("invalid-url"));
  await assert.rejects(make("https://user:pass@example.com/"), code("credentials-not-allowed"));
  await assert.rejects(make("https://user@example.com/"), code("credentials-not-allowed"));
  // Own short domain (loop), its subdomains, case and trailing-dot variants.
  await assert.rejects(make("https://sho.rt/abc"), code("blocked-host"));
  await assert.rejects(make("https://WWW.Sho.RT./abc"), code("blocked-host"));
  assert.equal((await make("https://notsho.rt/abc")).url, "https://notsho.rt/abc");
  assert.equal((await make("HTTPS://Example.COM/Path?q=1")).url, "https://example.com/Path?q=1");
  assert.equal((await make("http://example.com")).url, "http://example.com/");
});

test("isSafeDestination can refuse a destination", async () => {
  const seen = [];
  const { links } = setup({ isSafeDestination: async (url) => { seen.push(url.hostname); return url.hostname !== "malware.test"; } });
  await assert.rejects(links.create(alice, { tenantId: "acme", url: "https://malware.test/x" }), code("unsafe-destination"));
  await links.create(alice, { tenantId: "acme", url: "https://ok.test/x" });
  assert.deepEqual(seen, ["malware.test", "ok.test"]);
  const link = await links.create(alice, { tenantId: "acme", url: "https://ok.test/y" });
  await assert.rejects(links.update(alice, link.id, { url: "https://malware.test/z" }), code("unsafe-destination"));
});

test("collisions retry, then fail with exhausted", async () => {
  // Every draw yields the same code, so the second link collides each time.
  const constant = (n) => new Uint8Array(n).fill(5);
  const { links } = setup({ randomBytes: constant, maxAttempts: 3 });
  const first = await links.create(alice, { tenantId: "acme", url: "https://example.com/1" });
  assert.equal(first.code, ALPHABET[5].repeat(7));
  await assert.rejects(links.create(alice, { tenantId: "acme", url: "https://example.com/2" }), code("exhausted"));
  // Two collisions, then a fresh code: succeeds on the third attempt.
  let call = 0;
  const flaky = (n) => new Uint8Array(n).fill(call++ < 2 ? 5 : 6);
  const store = new MemoryShortLinkStore();
  const s2 = setup({ store, randomBytes: flaky, maxAttempts: 3 });
  await store.insert({ ...first, id: "pre" });
  call = 0;
  const link = await s2.links.create(alice, { tenantId: "acme", url: "https://example.com/3" });
  assert.equal(link.code, ALPHABET[6].repeat(7));
  assert.equal(call, 3);
});

test("custom slugs: shape, reserved words and uniqueness", async () => {
  const { links } = setup();
  const make = (slug, tenantId = "acme", actor = alice) => links.create(actor, { tenantId, url: "https://example.com/", slug });
  assert.equal((await make("launch-2026_v2")).code, "launch-2026_v2");
  for (const bad of ["ab", "x".repeat(65), "has space", "a/b", "dots.no", "é-ok", ""]) await assert.rejects(make(bad), code("invalid-slug"), bad);
  for (const word of ["api", "ADMIN", "Login"]) await assert.rejects(make(word), code("reserved-slug"), word);
  assert.ok(RESERVED_SLUGS.includes("api"));
  await assert.rejects(make("launch-2026_v2"), code("slug-taken"));
  // Codes are global (the redirect route has no tenant), so another tenant cannot claim it either.
  await assert.rejects(make("launch-2026_v2", "globex", eve), code("slug-taken"));
  const custom = setup({ reservedSlugs: ["pricing"] }).links;
  await assert.rejects(custom.create(alice, { tenantId: "acme", url: "https://e.com/", slug: "pricing" }), code("reserved-slug"));
  assert.equal((await custom.create(alice, { tenantId: "acme", url: "https://e.com/", slug: "api" })).code, "api");
});

test("resolve: counts clicks, expiry, disable and max clicks", async () => {
  const { links, clicks, advance, at } = setup();
  const link = await links.create(alice, { tenantId: "acme", url: "https://example.com/x", expiresAt: at() + 60_000, maxClicks: 2 });
  const first = await links.resolve(link.code, { referrer: "https://news.example.org/post/1?secret=1", country: "us" });
  assert.deepEqual(first, { status: 302, url: "https://example.com/x", linkId: link.id });
  assert.deepEqual(clicks[0], { linkId: link.id, at: at(), referrerHost: "news.example.org", country: "US" });
  assert.ok(!JSON.stringify(clicks).includes("secret"), "only the referrer host is kept");
  advance(1000);
  await links.resolve(link.code, { referrer: "not a url", country: "nowhere" });
  assert.deepEqual(clicks[1], { linkId: link.id, at: at() });
  assert.deepEqual(await links.resolve(link.code), { status: 410, reason: "max-clicks" });
  assert.deepEqual(await links.stats(alice, link.id), { clicks: 2, lastClickAt: at() });
  assert.deepEqual(await links.resolve("nope123"), { status: 404, reason: "not-found" });
  assert.deepEqual(await links.resolve("../etc"), { status: 404, reason: "not-found" });

  const timed = await links.create(alice, { tenantId: "acme", url: "https://example.com/t", expiresAt: at() + 5000 });
  advance(5000);
  assert.deepEqual(await links.resolve(timed.code), { status: 410, reason: "expired" });
  await assert.rejects(links.create(alice, { tenantId: "acme", url: "https://e.com/", expiresAt: at() }), code("invalid-expiry"));
  await assert.rejects(links.create(alice, { tenantId: "acme", url: "https://e.com/", maxClicks: 0 }), code("invalid-max-clicks"));
  await assert.rejects(links.create(alice, { tenantId: "acme", url: "https://e.com/", maxClicks: 1.5 }), code("invalid-max-clicks"));

  const open = await links.create(alice, { tenantId: "acme", url: "https://example.com/o" });
  await links.update(alice, open.id, { disabled: true });
  assert.deepEqual(await links.resolve(open.code), { status: 410, reason: "disabled" });
  await links.update(alice, open.id, { disabled: false, expiresAt: null });
  assert.equal((await links.resolve(open.code)).status, 302);
  // reportGone: false hides why a link stopped working.
  const quiet = setup({ reportGone: false });
  const q = await quiet.links.create(alice, { tenantId: "acme", url: "https://e.com/", maxClicks: 1 });
  await quiet.links.resolve(q.code);
  assert.equal((await quiet.links.resolve(q.code)).status, 404);
  // A failing onClick never breaks the redirect.
  const noisy = setup({ onClick: () => { throw new Error("analytics down"); } });
  const n = await noisy.links.create(alice, { tenantId: "acme", url: "https://e.com/" });
  assert.equal((await noisy.links.resolve(n.code)).status, 302);
});

test("concurrent resolves never exceed maxClicks (memory store)", async () => {
  const { links } = setup();
  const link = await links.create(alice, { tenantId: "acme", url: "https://example.com/", maxClicks: 5 });
  const results = await Promise.all(Array.from({ length: 20 }, () => links.resolve(link.code)));
  assert.equal(results.filter((r) => r.status === 302).length, 5);
  assert.equal((await links.stats(alice, link.id)).clicks, 5);
});

test("tenant isolation and authorization", async () => {
  const { links, advance } = setup();
  const link = await links.create(alice, { tenantId: "acme", url: "https://example.com/" });
  await assert.rejects(links.create(viewer, { tenantId: "acme", url: "https://example.com/" }), code("forbidden"));
  await assert.rejects(links.create(eve, { tenantId: "acme", url: "https://example.com/" }), code("forbidden"));
  await assert.rejects(links.create(alice, { tenantId: "../acme", url: "https://example.com/" }), code("invalid-tenant"));
  assert.equal((await links.get(viewer, link.id)).id, link.id);
  await assert.rejects(links.get(eve, link.id), code("forbidden"));
  await assert.rejects(links.stats(eve, link.id), code("forbidden"));
  await assert.rejects(links.update(viewer, link.id, { disabled: true }), code("forbidden"));
  await assert.rejects(links.update(eve, link.id, { disabled: true }), code("forbidden"));
  await assert.rejects(links.remove(eve, link.id), code("forbidden"));
  await assert.rejects(links.list(eve, { tenantId: "acme" }), code("forbidden"));
  await assert.rejects(links.get(alice, "missing"), code("not-found"));
  await assert.rejects(links.update(alice, link.id, { code: "x" }), code("invalid-patch"));
  await assert.rejects(links.update(alice, link.id, {}), code("invalid-patch"));
  await assert.rejects(links.update(alice, link.id, { disabled: "yes" }), code("invalid-patch"));
  await assert.rejects(links.update(alice, link.id, { url: "javascript:x" }), code("scheme-not-allowed"));
  assert.equal((await links.update(alice, link.id, { url: "https://example.com/new" })).url, "https://example.com/new");
  // Pagination: newest first, 1..100.
  await links.create(eve, { tenantId: "globex", url: "https://globex.test/" });
  for (let i = 0; i < 4; i++) { advance(1000); await links.create(alice, { tenantId: "acme", url: `https://example.com/${i}` }); }
  const page1 = await links.list(viewer, { tenantId: "acme", limit: 3 });
  assert.deepEqual(page1.links.map((l) => l.url), ["https://example.com/3", "https://example.com/2", "https://example.com/1"]);
  const page2 = await links.list(viewer, { tenantId: "acme", limit: 3, cursor: page1.nextCursor });
  assert.deepEqual(page2.links.map((l) => l.url), ["https://example.com/0", "https://example.com/new"]);
  assert.equal(page2.nextCursor, null);
  await assert.rejects(links.list(viewer, { tenantId: "acme", limit: 101 }), code("invalid-limit"));
  await assert.rejects(links.list(viewer, { tenantId: "acme", cursor: "!!" }), code("invalid-cursor"));
  await links.remove(alice, link.id);
  await assert.rejects(links.get(alice, link.id), code("not-found"));
  assert.deepEqual(await links.resolve(link.code), { status: 404, reason: "not-found" });
});

test("redirect handler: 302 headers, 404, 410 and methods", async () => {
  const { links } = setup();
  const link = await links.create(alice, { tenantId: "acme", url: "https://example.com/dest", maxClicks: 1 });
  const redirect = createRedirectHandler(links, { prefix: "/s", country: (request) => request.headers.get("x-country") });
  const ok = await redirect(new Request(`https://sho.rt/s/${link.code}`, { headers: { "x-country": "DE", referer: "https://ref.test/a" } }));
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("location"), "https://example.com/dest");
  assert.equal(ok.headers.get("cache-control"), "private, max-age=0");
  assert.equal(ok.headers.get("referrer-policy"), "no-referrer-when-downgrade");
  assert.equal((await redirect(new Request(`https://sho.rt/s/${link.code}`))).status, 410);
  assert.equal((await redirect(new Request("https://sho.rt/s/unknown1"))).status, 404);
  assert.equal((await redirect(new Request("https://sho.rt/s/a/b"))).status, 404);
  assert.equal((await redirect(new Request("https://sho.rt/other/x"))).status, 404);
  const post = await redirect(new Request(`https://sho.rt/s/${link.code}`, { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
  assert.equal((await links.stats(alice, link.id)).clicks, 1, "only GET counts");
  const root = createRedirectHandler(links);
  const l2 = await links.create(alice, { tenantId: "acme", url: "https://example.com/r" });
  assert.equal((await root(new Request(`https://sho.rt/${l2.code}`))).status, 302);
});

test("management handler: routes, auth, origin check, no-store and error mapping", async () => {
  const { links } = setup();
  const users = { "token-alice": alice, "token-eve": eve };
  const handler = createManagementHandler({
    links, prefix: "/api/links", allowedOrigins: ["https://app.test"], maxRequestBytes: 1024,
    authenticate: async (request) => users[request.headers.get("authorization") ?? ""] ?? null,
  });
  const call = (method, path, body, { token = "token-alice", origin = "https://app.test", type = "application/json" } = {}) =>
    handler(new Request(`https://app.test/api/links${path}`, {
      method, headers: { authorization: token, origin, "content-type": type }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }));
  const created = await call("POST", "", { tenantId: "acme", url: "https://example.com/", slug: "promo", maxClicks: 10 });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  const { link } = await created.json();
  assert.equal(link.code, "promo");
  assert.equal((await call("POST", "", { tenantId: "acme", url: "https://example.com/", slug: "promo" })).status, 409);
  const bad = await call("POST", "", { tenantId: "acme", url: "javascript:alert(1)" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "scheme-not-allowed");
  assert.equal((await call("POST", "", { tenantId: "acme", url: "https://e.com/" }, { origin: "https://evil.test" })).status, 403);
  assert.equal((await call("POST", "", { tenantId: "acme", url: "https://e.com/" }, { token: "nobody" })).status, 401);
  assert.equal((await call("POST", "", { tenantId: "acme", url: "https://e.com/" }, { token: "token-eve" })).status, 403);
  assert.equal((await call("POST", "", "{not json")).status, 400);
  assert.equal((await call("POST", "", { tenantId: "acme", url: "https://e.com/" + "a".repeat(2000) })).status, 413);
  assert.equal((await call("POST", "", { tenantId: "acme", url: "https://e.com/" }, { type: "text/plain" })).status, 400);

  const list = await call("GET", "?tenantId=acme&limit=10");
  assert.equal(list.status, 200);
  assert.equal((await list.json()).links.length, 1);
  assert.equal((await call("GET", "?tenantId=acme&limit=abc")).status, 400);
  assert.equal((await call("GET", `/${link.id}`)).status, 200);
  assert.equal((await call("GET", `/${link.id}`, undefined, { token: "token-eve" })).status, 403);
  const patched = await call("PATCH", `/${link.id}`, { disabled: true, expiresAt: null });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).link.disabled, true);
  assert.equal((await call("PATCH", `/${link.id}`, { clicks: 0 })).status, 400);
  const stats = await call("GET", `/${link.id}/stats`);
  assert.deepEqual(await stats.json(), { stats: { clicks: 0, lastClickAt: null } });
  assert.equal((await call("GET", `/${link.id}/other`)).status, 404);
  assert.equal((await call("PUT", `/${link.id}`, {})).status, 405);
  assert.equal((await call("DELETE", `/${link.id}`, undefined, { origin: "" })).status, 403);
  const deleted = await call("DELETE", `/${link.id}`);
  assert.deepEqual(await deleted.json(), { deleted: true });
  assert.equal((await call("GET", `/${link.id}`)).status, 404);
  assert.equal((await handler(new Request("https://app.test/elsewhere"))).status, 404);
});
