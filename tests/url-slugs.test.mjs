// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createUrlSlugs, slugify, isCanonicalSlug, slugScope, SlugError, DEFAULT_RESERVED_SLUGS } from "../.build/modules/url-slugs/files/core.js";
import { MemorySlugStore } from "../.build/modules/url-slugs/files/memory-store.js";
import { createSlugResolveHandler } from "../.build/modules/url-slugs/files/http.js";

function setup(options = {}) {
  let now = 1_000_000;
  const store = options.store ?? new MemorySlugStore();
  const slugs = createUrlSlugs({ store, now: () => now, ...options });
  return { store, slugs, advance: (ms) => { now += ms; } };
}

test("slugify lowercases, transliterates Latin diacritics, joins apostrophes and collapses punctuation", () => {
  assert.equal(slugify("Héllo, Wörld!"), "hello-world");
  assert.equal(slugify("Crème Brûlée — à la carte"), "creme-brulee-a-la-carte");
  assert.equal(slugify("Straße Æther Œuvre Łódź Þing Ørsted"), "strasse-aether-oeuvre-lodz-thing-orsted");
  assert.equal(slugify("Việt Nam ǅemal"), "viet-nam-dzemal");
  assert.equal(slugify("Don't stop · it’s ALL   good???"), "dont-stop-its-all-good");
  assert.equal(slugify("Tom & Jerry"), "tom-and-jerry");
  assert.equal(slugify("  --Already--slugged--  "), "already-slugged");
  assert.equal(slugify("ﬁle Ｗｉｄｅ"), "file-wide");
  assert.equal(slugify("Snake case", { separator: "_" }), "snake_case");
});

test("slugify unicode mode keeps letters and digits of other scripts", () => {
  assert.equal(slugify("Привет, Мир!", { unicode: true }), "привет-мир");
  assert.equal(slugify("東京 2026 café", { unicode: true }), "東京-2026-cafe");
  assert.equal(slugify("Привет, Мир!"), "item", "ASCII mode drops other scripts and falls back");
  assert.equal(slugify("Йога Ёлка", { unicode: true }), "йога-ёлка", "Cyrillic letters keep their marks");
  assert.equal(slugify("हिन्दी भाषा", { unicode: true }), "हिन्दी-भाषा", "Devanagari vowel signs are kept");
  assert.equal(slugify("Ünïcödé Straße", { unicode: true }), "unicode-strasse", "Latin diacritics are still transliterated");
});

test("slugify truncates at a word boundary and hard-cuts a single overlong word", () => {
  assert.equal(slugify("The quick brown fox jumps over the lazy dog", { maxLength: 20 }), "the-quick-brown-fox");
  assert.equal(slugify("The quick brown fox jumps", { maxLength: 19 }), "the-quick-brown-fox");
  assert.equal(slugify("The quick brown fox jumps", { maxLength: 18 }), "the-quick-brown");
  assert.equal(slugify("Supercalifragilistic word", { maxLength: 10 }), "supercalif");
  const long = slugify("word ".repeat(100));
  assert.ok(long.length <= 80 && !long.endsWith("-"));
});

test("slugify returns the configured fallback when nothing usable remains", () => {
  assert.equal(slugify("🙂🙂 !!! ¿?"), "item");
  assert.equal(slugify("", { fallback: "untitled" }), "untitled");
  const { slugs } = setup({ fallback: "post" });
  assert.equal(slugs.slugify("🔥🔥"), "post");
  assert.throws(() => createUrlSlugs({ store: new MemorySlugStore(), fallback: "Not A Slug" }), RangeError);
  assert.equal(isCanonicalSlug("hello-world"), true);
  assert.equal(isCanonicalSlug("Hello-World"), false);
  assert.equal(isCanonicalSlug("hello--world"), false);
});

test("a taken slug gets the first free numeric suffix", async () => {
  const { slugs } = setup();
  assert.deepEqual(await slugs.create("blog", "p1", "Post"), { slug: "post" });
  assert.deepEqual(await slugs.create("blog", "p2", "Post"), { slug: "post-2" });
  assert.deepEqual(await slugs.create("blog", "p3", "post!"), { slug: "post-3" });
  await slugs.remove("blog", "p2");
  assert.deepEqual(await slugs.create("blog", "p4", "Post"), { slug: "post-2" }, "first free, not next highest");
});

test("suffixes stay within maxLength by trimming the base at a word boundary", async () => {
  const { slugs } = setup({ maxLength: 12 });
  assert.equal((await slugs.create("s", "a", "alpha beta gamma")).slug, "alpha-beta");
  assert.equal((await slugs.create("s", "b", "alpha beta gamma")).slug, "alpha-beta-2");
  assert.equal((await slugs.create("s", "c", "alpha beta gamma")).slug, "alpha-beta-3");
  for (let i = 0; i < 8; i++) await slugs.create("s", `d${i}`, "alpha beta gamma");
  assert.equal((await slugs.create("s", "e", "alpha beta gamma")).slug, "alpha-12", "two-digit suffix trims the base to fit");
});

test("ten concurrent creates of the same title get distinct slugs (memory store)", async () => {
  const { slugs } = setup();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => slugs.create("blog", `e${i}`, "Hello World")));
  const values = results.map((r) => r.slug).sort();
  assert.equal(new Set(values).size, 10);
  assert.deepEqual(values, ["hello-world", ...Array.from({ length: 9 }, (_, i) => `hello-world-${i + 2}`)].sort());
});

test("an entity can hold only one current slug; a second create fails with entity-exists", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "First");
  await assert.rejects(slugs.create("blog", "p1", "Second"), (e) => e instanceof SlugError && e.code === "entity-exists");
  const both = await Promise.allSettled([slugs.create("blog", "p9", "A"), slugs.create("blog", "p9", "B")]);
  assert.equal(both.filter((r) => r.status === "fulfilled").length, 1);
});

test("reserved words and route names are refused as exact slugs and skipped when derived", async () => {
  const { slugs } = setup();
  for (const word of ["new", "edit", "api", "admin"]) assert.ok(DEFAULT_RESERVED_SLUGS.includes(word));
  await assert.rejects(slugs.create("blog", "p1", "admin", { exact: true }), { code: "reserved-slug" });
  await assert.rejects(slugs.create("blog", "p1", "new", { exact: true }), { code: "reserved-slug" });
  assert.equal((await slugs.create("blog", "p1", "Admin")).slug, "admin-2");
  assert.equal((await slugs.create("blog", "p2", "API")).slug, "api-2");
  await assert.rejects(slugs.rename("blog", "p2", "edit", { exact: true }), { code: "reserved-slug" });
  assert.equal((await slugs.resolve("blog", "admin")).status, "not-found");
});

test("the reserved list is configurable", async () => {
  const { slugs } = setup({ reserved: [...DEFAULT_RESERVED_SLUGS, "Posts", "feed"] });
  await assert.rejects(slugs.create("blog", "p1", "posts", { exact: true }), { code: "reserved-slug" });
  assert.equal((await slugs.create("blog", "p1", "Feed")).slug, "feed-2");
  const open = setup({ reserved: [] }).slugs;
  assert.equal((await open.create("blog", "p1", "admin", { exact: true })).slug, "admin");
});

test("exact slugs must be free and canonical", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "taken");
  await assert.rejects(slugs.create("blog", "p2", "taken", { exact: true }), { code: "slug-taken" });
  assert.equal((await slugs.create("blog", "p2", "my-custom-slug", { exact: true })).slug, "my-custom-slug");
  for (const bad of ["My Custom Slug", "my--slug", "-lead", "Upper", "café\u0301", "🙂", ""]) {
    await assert.rejects(slugs.create("blog", "p3", bad, { exact: true }), { code: "invalid-slug" }, JSON.stringify(bad));
  }
  await assert.rejects(slugs.rename("blog", "p2", "Not Canonical", { exact: true }), { code: "invalid-slug" });
  assert.equal(await slugs.current("blog", "p3"), null, "nothing was stored for refused input");
});

test("rename keeps history and old slugs resolve to a permanent redirect to the current slug", async () => {
  const { slugs, advance } = setup();
  await slugs.create("blog", "p1", "First title");
  advance(1000);
  assert.deepEqual(await slugs.rename("blog", "p1", "Second title"), { slug: "second-title", previous: "first-title", changed: true });
  assert.deepEqual(await slugs.resolve("blog", "first-title"), { status: "redirect", entityId: "p1", slug: "second-title", from: "first-title" });
  assert.deepEqual(await slugs.resolve("blog", "second-title"), { status: "ok", entityId: "p1", slug: "second-title" });
  assert.deepEqual((await slugs.history("blog", "p1")).map((h) => [h.slug, h.retiredAt !== undefined]), [["first-title", true], ["second-title", false]]);
  assert.deepEqual(await slugs.rename("blog", "p1", "Second Title"), { slug: "second-title", previous: "second-title", changed: false });
});

test("redirect chains collapse to the current slug and renaming back never loops", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "a");
  await slugs.rename("blog", "p1", "b");
  await slugs.rename("blog", "p1", "c");
  assert.deepEqual(await slugs.resolve("blog", "a"), { status: "redirect", entityId: "p1", slug: "c", from: "a" });
  assert.deepEqual(await slugs.resolve("blog", "b"), { status: "redirect", entityId: "p1", slug: "c", from: "b" });
  // Back to an old slug: it is reclaimed (no suffix) and becomes current again.
  assert.equal((await slugs.rename("blog", "p1", "a")).slug, "a");
  assert.equal((await slugs.resolve("blog", "a")).status, "ok");
  for (const old of ["b", "c"]) assert.deepEqual(await slugs.resolve("blog", old), { status: "redirect", entityId: "p1", slug: "a", from: old });
  // Every slug ever used resolves in at most one hop to an ok result.
  const titles = ["a", "b", "c", "d", "b", "a", "e", "c"];
  for (const title of titles) {
    await slugs.rename("blog", "p1", title);
    for (const seen of ["a", "b", "c", "d", "e"]) {
      const first = await slugs.resolve("blog", seen);
      if (first.status === "not-found") continue;
      assert.equal(first.slug, title);
      assert.equal((await slugs.resolve("blog", first.slug)).status, "ok");
    }
  }
});

test("old slugs stay owned: another entity cannot take them, so a redirect cannot be hijacked", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "launch");
  await slugs.rename("blog", "p1", "launch day");
  assert.equal((await slugs.create("blog", "p2", "launch")).slug, "launch-2");
  await assert.rejects(slugs.rename("blog", "p2", "launch", { exact: true }), { code: "slug-taken" });
  assert.equal((await slugs.resolve("blog", "launch")).slug, "launch-day");
});

test("rename suffixes when the new title is taken by another entity and fails for unknown entities", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "Alpha");
  await slugs.create("blog", "p2", "Beta");
  assert.equal((await slugs.rename("blog", "p2", "Alpha")).slug, "alpha-2");
  await assert.rejects(slugs.rename("blog", "missing", "x"), { code: "not-found" });
});

test("concurrent renames of one entity leave exactly one current slug", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "start");
  await Promise.all(["one", "two", "three", "four"].map((t) => slugs.rename("blog", "p1", t)));
  const current = (await slugs.history("blog", "p1")).filter((h) => h.retiredAt === undefined);
  assert.equal(current.length, 1);
  for (const t of ["start", "one", "two", "three", "four"]) assert.equal((await slugs.resolve("blog", t)).slug, current[0].slug);
});

test("resolve redirects a differently cased slug to the canonical one and rejects junk", async () => {
  const { slugs } = setup();
  await slugs.create("blog", "p1", "Hello World");
  assert.deepEqual(await slugs.resolve("blog", "Hello-World"), { status: "redirect", entityId: "p1", slug: "hello-world", from: "Hello-World" });
  for (const junk of ["", "hello world", "../etc", "x".repeat(1000), 42]) assert.equal((await slugs.resolve("blog", junk)).status, "not-found");
});

test("slugs are scoped per tenant and collection", async () => {
  const { slugs } = setup();
  assert.equal((await slugs.create("tenant-a:posts", "p1", "Welcome")).slug, "welcome");
  assert.equal((await slugs.create("tenant-b:posts", "p1", "Welcome")).slug, "welcome", "same slug in another tenant");
  assert.equal((await slugs.create("tenant-a:pages", "x1", "Welcome")).slug, "welcome", "same slug in another collection");
  await slugs.rename("tenant-a:posts", "p1", "Hello");
  assert.equal((await slugs.resolve("tenant-b:posts", "welcome")).status, "ok", "rename in tenant A does not touch tenant B");
  assert.equal((await slugs.resolve("tenant-b:posts", "hello")).status, "not-found", "tenant B cannot see tenant A's slug");
  assert.equal((await slugs.resolve("tenant-a:posts", "welcome")).status, "redirect");
  assert.deepEqual(await slugs.resolve("tenant-a:pages", "welcome"), { status: "ok", entityId: "x1", slug: "welcome" });
  await assert.rejects(slugs.create("", "p1", "x"), { code: "invalid-scope" });
  assert.notEqual(slugScope("a:b", "c"), slugScope("a", "b:c"), "scope parts cannot run into each other");
  assert.equal((await slugs.create(slugScope("a:b", "c"), "p1", "Same")).slug, "same");
  assert.equal((await slugs.create(slugScope("a", "b:c"), "p1", "Same")).slug, "same");
});

test("option validation", () => {
  const store = new MemorySlugStore();
  assert.throws(() => createUrlSlugs({ store, maxLength: 3 }), RangeError);
  assert.throws(() => createUrlSlugs({ store, separator: "." }), RangeError);
  assert.throws(() => createUrlSlugs({ store, maxAttempts: 0 }), RangeError);
});

function httpSetup(extra = {}) {
  const { slugs } = setup();
  const handler = createSlugResolveHandler({
    slugs, prefix: "/posts",
    scopeFor: (request) => {
      const tenant = request.headers.get("x-tenant");
      return tenant ? `${tenant}:posts` : null;
    },
    ...extra,
  });
  const get = (path, tenant = "t1", method = "GET") => handler(new Request(`https://app.example.com${path}`, { method, headers: tenant ? { "x-tenant": tenant } : {} }));
  return { slugs, handler, get };
}

test("HTTP adapter: 200 for the current slug, 301 with Location for an old slug, 404 otherwise", async () => {
  const { slugs, get } = httpSetup();
  await slugs.create("t1:posts", "p1", "Old Name");
  await slugs.rename("t1:posts", "p1", "New Name");
  const ok = await get("/posts/new-name");
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { entityId: "p1", slug: "new-name" });
  const moved = await get("/posts/old-name?ref=mail");
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get("location"), "/posts/new-name?ref=mail");
  assert.match(moved.headers.get("cache-control"), /max-age=3600/);
  assert.equal((await get("/posts/nothing")).status, 404);
  assert.equal((await get("/posts/new-name", "t2")).status, 404, "other tenant");
  assert.equal((await get("/posts/new-name", null)).status, 403, "no scope");
  assert.equal((await get("/elsewhere/new-name")).status, 404);
  const head = await get("/posts/new-name", "t1", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await get("/posts/new-name", "t1", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal((await get("/posts/%E0%A4%A")).status, 400, "malformed percent-encoding");
});

test("HTTP adapter: routes and statusFor overrides work, with route params passed to scopeFor", async () => {
  const { slugs } = setup();
  await slugs.create("t1:docs", "d1", "Intro");
  await slugs.rename("t1:docs", "d1", "Getting started");
  const handler = createSlugResolveHandler({
    slugs, prefix: "/api",
    routes: { resolve: "/:collection/by-slug/:slug" },
    statusFor: { "not-found": 410, forbidden: 401 },
    redirectStatus: 308,
    scopeFor: (_request, params) => (params.collection === "secret" ? null : `t1:${params.collection}`),
  });
  const get = (path) => handler(new Request(`https://app.example.com${path}`));
  const moved = await get("/api/docs/by-slug/intro");
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.get("location"), "/api/docs/by-slug/getting-started");
  assert.equal((await get("/api/docs/by-slug/getting-started")).status, 200);
  assert.equal((await get("/api/docs/by-slug/missing")).status, 410);
  assert.equal((await get("/api/secret/by-slug/intro")).status, 401);
  assert.equal((await get("/api/docs/intro")).status, 410, "unmatched route uses the not-found mapping");
  const custom = createSlugResolveHandler({
    slugs, scopeFor: () => "t1:docs",
    locationFor: ({ slug }) => `https://docs.example.com/${slug}`,
  });
  const res = await custom(new Request("https://app.example.com/intro"));
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://docs.example.com/getting-started");
});

function codePointSweep() {
  const points = [];
  for (let cp = 0x20; cp <= 0xffff; cp++) if (cp < 0xd800 || cp > 0xdfff) points.push(cp);
  for (let cp = 0x10000; cp <= 0x30000; cp += 7) points.push(cp);
  for (const cp of [0x1d6a4, 0x1d400, 0x1f600, 0x20000]) points.push(cp);
  return points;
}

test("slugify is idempotent for every BMP code point and a sample above, in ASCII and unicode modes", () => {
  const bad = { ascii: [], unicode: [] };
  for (const cp of codePointSweep()) {
    const char = String.fromCodePoint(cp);
    for (const mode of ["ascii", "unicode"]) {
      const options = { unicode: mode === "unicode", fallback: "" };
      for (const text of ["a" + char + "b", char, "Ä" + char, char + char + " x"]) {
        const once = slugify(text, options);
        if (slugify(once, options) !== once || (once !== "" && !isCanonicalSlug(once, options))) bad[mode].push(cp.toString(16));
      }
    }
  }
  assert.deepEqual(bad, { ascii: [], unicode: [] });
  assert.equal(slugify("Cafe\u0301", { unicode: true }), "cafe");
  assert.equal(slugify("STRAẞE", { unicode: true }), "strasse");
  assert.equal(slugify("STRAẞE"), "strasse");
});

test("every created slug resolves as current, in ASCII and unicode modes", async () => {
  const titles = ["Cafe\u0301 au lait", "STRAẞE", "ᴭther", "ℏbar", "𝚤dea", "b\u0308x", "Ｆｕｌｌ ｗｉｄｔｈ", "Привет мир", "हिन्दी", "東京 2026", "Ǆungla"];
  for (const cp of codePointSweep().filter((_, i) => i % 97 === 0)) titles.push("Title " + String.fromCodePoint(cp) + " end");
  for (const unicode of [false, true]) {
    const { slugs } = setup({ unicode });
    let n = 0;
    for (const title of titles) {
      const { slug } = await slugs.create("s", `e${n++}`, title);
      assert.deepEqual(await slugs.resolve("s", slug), { status: "ok", entityId: `e${n - 1}`, slug }, `${JSON.stringify(title)} unicode=${unicode}`);
    }
  }
});
