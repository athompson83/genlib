// SPDX-License-Identifier: Apache-2.0
// feature-rollout: deterministic flags with gradual rollout, kill switch, user/tenant targeting, runtime config with
// a TTL cache and change notification, audited admin changes, weighted experiments with sticky assignments, exposure
// logging, anonymous-to-user stitching, analysis with a two-proportion z-test, and the Fetch adapter.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeatureFlags, evaluateFlag, validateFlagInput, bucketOf, fnv1a32, stableHash, twoProportionZTest, FeatureFlagError,
} from "../.build/modules/feature-rollout/files/core.js";
import { MemoryFeatureFlagStore } from "../.build/modules/feature-rollout/files/memory-store.js";
import { createFeatureFlagHandler } from "../.build/modules/feature-rollout/files/http.js";

const ADMIN = { id: "admin-1" };
const VIEWER = { id: "viewer-1" };

function setup(extra = {}) {
  let now = 1_000_000;
  let ids = 0;
  const store = extra.store ?? new MemoryFeatureFlagStore();
  const exposures = [];
  const errors = [];
  const options = {
    store,
    now: () => now,
    newId: () => `id${++ids}`,
    authorize: (actor, action) => actor.id === ADMIN.id || (actor.id === VIEWER.id && (action === "read" || action === "audit")),
    onExposure: (event) => exposures.push(event),
    onError: (error) => errors.push(error),
    ...extra.options,
  };
  const flags = createFeatureFlags(options);
  return { store, flags, exposures, errors, options, advance: (ms) => { now += ms; }, clock: () => now };
}

const code = (expected) => (error) => error instanceof FeatureFlagError && error.code === expected;
const users = (n, prefix = "user") => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

// Pure evaluation ------------------------------------------------------------------------------------------------

test("sticky bucketing: the same flag and user always give the same bucket, result and variant", async () => {
  const flag = validateFlagInput({ key: "new-checkout", rolloutPercent: 50, variants: [{ name: "a", weight: 1 }, { name: "b", weight: 1 }] });
  for (const id of users(200)) {
    const first = evaluateFlag(flag, { userId: id });
    for (let i = 0; i < 3; i++) assert.deepEqual(evaluateFlag(flag, { userId: id }), first);
    // The bucket is FNV-1a 32 + fmix32 over "key:subject" modulo 10,000.
    assert.equal(first.bucket, stableHash(`new-checkout:${id}`) % 10000);
    assert.equal(bucketOf("new-checkout", id), first.bucket);
  }
  // Two service instances with separate caches agree for every subject.
  const { flags: one } = setup({ store: new MemoryFeatureFlagStore([flag]) });
  const { flags: two } = setup({ store: new MemoryFeatureFlagStore([flag]) });
  for (const id of users(50)) {
    assert.deepEqual(await one.evaluate("new-checkout", { userId: id }), await two.evaluate("new-checkout", { userId: id }));
  }
  // FNV-1a 32 reference vectors.
  assert.equal(fnv1a32(""), 0x811c9dc5);
  assert.equal(fnv1a32("a"), 0xe40c292c);
  assert.equal(fnv1a32("foobar"), 0xbf9cf968);
});

test("monotonic rollout: raising the percentage only adds users and nobody already enabled is dropped", () => {
  const ids = users(4000);
  let previous = new Set();
  for (const pct of [0, 1, 5, 10.5, 25, 50, 75, 99.99, 100]) {
    const flag = validateFlagInput({ key: "search-v2", rolloutPercent: pct });
    const on = new Set(ids.filter((id) => evaluateFlag(flag, { userId: id }).on));
    for (const id of previous) assert.ok(on.has(id), `${id} dropped when raising to ${pct}%`);
    const share = on.size / ids.length;
    assert.ok(Math.abs(share - pct / 100) < 0.03, `share ${share} at ${pct}%`);
    previous = on;
  }
  assert.equal(previous.size, ids.length);
});

test("targeting precedence: kill switch > user deny > user allow > tenant deny > tenant allow > rollout, with reasons", () => {
  const base = { key: "beta", rolloutPercent: 100, denyUsers: ["mallory"], allowUsers: ["alice", "mallory"], denyTenants: ["acme"], allowTenants: ["globex"] };
  const flag = validateFlagInput(base);
  const reason = (subject, f = flag) => { const r = evaluateFlag(f, subject); return `${r.on}:${r.reason}`; };
  assert.equal(reason({ userId: "mallory" }), "false:user-deny", "deny beats allow for the same user");
  assert.equal(reason({ userId: "alice", tenantId: "acme" }), "true:user-allow", "a user allow beats a tenant deny");
  assert.equal(reason({ userId: "bob", tenantId: "acme" }), "false:tenant-deny");
  assert.equal(reason({ userId: "bob", tenantId: "globex" }), "true:tenant-allow");
  assert.equal(reason({ userId: "bob" }), "true:rollout");
  assert.equal(reason({}), "false:no-subject");
  const zero = validateFlagInput({ ...base, rolloutPercent: 0 });
  assert.equal(reason({ userId: "alice" }, zero), "true:user-allow", "allow overrides a 0% rollout");
  assert.equal(reason({ userId: "bob", tenantId: "globex" }, zero), "true:tenant-allow");
  assert.equal(reason({ userId: "bob" }, zero), "false:excluded");
  const killed = validateFlagInput({ ...base, enabled: false });
  for (const subject of [{ userId: "alice" }, { userId: "bob", tenantId: "globex" }, { userId: "bob" }]) {
    assert.equal(reason(subject, killed), "false:disabled", "kill switch turns the flag off for everyone");
  }
});

test("tenant targeting: bucketBy tenant rolls a whole organization in or out together", () => {
  const flag = validateFlagInput({ key: "org-reports", rolloutPercent: 30, bucketBy: "tenant" });
  const tenants = users(1000, "org");
  let enabledTenants = 0;
  for (const tenantId of tenants) {
    const results = ["u1", "u2", "u3", "u4"].map((userId) => evaluateFlag(flag, { userId: `${tenantId}-${userId}`, tenantId }));
    assert.ok(results.every((r) => r.on === results[0].on), "every member of a tenant gets the same answer");
    assert.equal(results[0].bucket, bucketOf("org-reports", tenantId));
    if (results[0].on) enabledTenants++;
  }
  assert.ok(Math.abs(enabledTenants / tenants.length - 0.3) < 0.05);
  assert.equal(evaluateFlag(flag, { userId: "solo" }).reason, "no-subject", "tenant bucketing needs a tenant id");
  // Raising the tenant rollout only adds tenants.
  const wider = validateFlagInput({ key: "org-reports", rolloutPercent: 60, bucketBy: "tenant" });
  for (const tenantId of tenants) {
    if (evaluateFlag(flag, { tenantId }).on) assert.ok(evaluateFlag(wider, { tenantId }).on);
  }
});

test("config validation rejects invalid keys, percentages, variant weights, duplicates and unknown fields", () => {
  const bad = [
    [{ key: "has space" }, "key"],
    [{ key: "" }, "key"],
    [{ key: "x".repeat(101) }, "key"],
    [{ key: "ok", rolloutPercent: 101 }, "rolloutPercent"],
    [{ key: "ok", rolloutPercent: -1 }, "rolloutPercent"],
    [{ key: "ok", rolloutPercent: 10.123 }, "rolloutPercent"],
    [{ key: "ok", rolloutPercent: "50" }, "rolloutPercent"],
    [{ key: "ok", variants: [{ name: "a", weight: -1 }] }, "variants"],
    [{ key: "ok", variants: [{ name: "a", weight: 1.5 }] }, "variants"],
    [{ key: "ok", variants: [{ name: "a", weight: 0 }, { name: "b", weight: 0 }] }, "variants"],
    [{ key: "ok", variants: [{ name: "a", weight: 1 }, { name: "a", weight: 1 }] }, "variants"],
    [{ key: "ok", variants: [{ name: "", weight: 1 }] }, "variants"],
    [{ key: "ok", bucketBy: "device" }, "bucketBy"],
    [{ key: "ok", allowUsers: ["", "x"] }, "allowUsers"],
    [{ key: "ok", enabled: "yes" }, "enabled"],
    [{ key: "ok", rollout: 50 }, "rollout"],
  ];
  for (const [input, field] of bad) {
    assert.throws(() => validateFlagInput(input), (error) => code("invalid-flag")(error) && error.problems.some((p) => p.startsWith(field)),
      `${JSON.stringify(input)} should be rejected for ${field}`);
  }
  const ok = validateFlagInput({ key: "valid.key_1-2", rolloutPercent: 12.5, variants: [{ name: "control", weight: 0 }, { name: "treatment", weight: 3 }] });
  assert.equal(ok.enabled, true);
  assert.equal(ok.bucketBy, "user");
  assert.deepEqual(ok.allowUsers, []);
});

test("explainable: every evaluation reports reason, bucket, version and variant source", async () => {
  const { flags } = setup({ store: new MemoryFeatureFlagStore([validateFlagInput({ key: "explain", rolloutPercent: 40, variants: [{ name: "a", weight: 1 }] })]) });
  const result = await flags.evaluate("explain", { userId: "u-1" });
  assert.deepEqual(Object.keys(result).sort(), ["bucket", "flagKey", "on", "reason", "variant", "variantSource", "version"].sort());
  assert.equal(result.bucket, bucketOf("explain", "u-1"));
  assert.equal(result.reason, result.bucket < 4000 ? "rollout" : "excluded");
  assert.deepEqual(await flags.evaluate("missing", { userId: "u-1" }),
    { flagKey: "missing", on: false, reason: "not-found", bucket: null, variant: null, variantSource: null, version: null });
});

// Runtime config ---------------------------------------------------------------------------------------------------

test("runtime config: changes reach other instances after the TTL without a deploy, and subscribers are notified", async () => {
  // Two server instances share one store and one fake clock.
  const store = new MemoryFeatureFlagStore();
  let now = 1_000_000;
  const shared = { store, now: () => now, cacheTtlMs: 5000, authorize: (actor) => actor.id === ADMIN.id };
  const fa = createFeatureFlags(shared);
  const fb = createFeatureFlags(shared);
  const events = [];
  fb.subscribe((event) => events.push(event));
  await fa.admin.create(ADMIN, { key: "dark-mode", rolloutPercent: 0 });
  assert.equal((await fb.evaluate("dark-mode", { userId: "u" })).reason, "excluded");
  await fa.admin.update(ADMIN, "dark-mode", { rolloutPercent: 100 });
  assert.equal((await fa.evaluate("dark-mode", { userId: "u" })).on, true, "the writing instance refreshes at once");
  now += 4999;
  assert.equal((await fb.evaluate("dark-mode", { userId: "u" })).on, false, "cached until the TTL passes");
  assert.equal(events.length, 0);
  now += 1;
  assert.equal((await fb.evaluate("dark-mode", { userId: "u" })).on, true, "picked up from the store after the TTL");
  assert.deepEqual(events, [{ changed: ["dark-mode"] }]);
  await fa.admin.remove(ADMIN, "dark-mode");
  await fb.refresh();
  assert.deepEqual(events.at(-1), { changed: ["dark-mode"] });
  assert.equal((await fb.evaluate("dark-mode", { userId: "u" })).reason, "not-found");
});

test("runtime config: one store read per TTL window, concurrent loads share one read, and a failing store serves the last good config", async () => {
  const inner = new MemoryFeatureFlagStore([validateFlagInput({ key: "cached", rolloutPercent: 100 })]);
  let reads = 0;
  let fail = false;
  const store = new Proxy(inner, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "listFlags") return async () => { reads++; if (fail) throw new Error("db down"); return value.call(target); };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const { flags, errors, advance } = setup({ store, options: { cacheTtlMs: 1000 } });
  await Promise.all(users(20).map((id) => flags.evaluate("cached", { userId: id })));
  assert.equal(reads, 1, "concurrent first evaluations share one load");
  advance(999);
  await flags.evaluate("cached", { userId: "x" });
  assert.equal(reads, 1);
  advance(1);
  fail = true;
  assert.equal((await flags.evaluate("cached", { userId: "x" })).on, true, "stale config served when the store fails");
  assert.equal(reads, 2);
  assert.equal(errors.length, 1);
  await flags.evaluate("cached", { userId: "x" });
  assert.equal(reads, 2, "the failed reload backs off for one TTL");
  const cold = setup({ store, options: { cacheTtlMs: 1000 } });
  await assert.rejects(cold.flags.evaluate("cached", { userId: "x" }), /db down/, "no cached config: the error surfaces");
  assert.throws(() => createFeatureFlags({ store, cacheTtlMs: -1 }), RangeError);
});

// Admin and audit --------------------------------------------------------------------------------------------------

test("audited changes: only authorized actors change flags, and each change records who, when, before and after", async () => {
  const { flags, advance, clock } = setup();
  await assert.rejects(flags.admin.create(VIEWER, { key: "pricing" }), code("forbidden"));
  await assert.rejects(flags.admin.create({ id: "" }, { key: "pricing" }), code("forbidden"));
  const created = await flags.admin.create(ADMIN, { key: "pricing", rolloutPercent: 10 });
  assert.equal(created.version, 1);
  assert.equal(created.updatedBy, "admin-1");
  const createdAt = clock();
  advance(1000);
  const updated = await flags.admin.update(ADMIN, "pricing", { rolloutPercent: 20, enabled: false }, { expectedVersion: 1 });
  assert.equal(updated.version, 2);
  await assert.rejects(flags.admin.update(ADMIN, "pricing", { rolloutPercent: 30 }, { expectedVersion: 1 }), code("conflict"));
  await assert.rejects(flags.admin.update(VIEWER, "pricing", { rolloutPercent: 30 }), code("forbidden"));
  await assert.rejects(flags.admin.update(ADMIN, "pricing", { key: "renamed" }), code("invalid-flag"));
  await assert.rejects(flags.admin.update(ADMIN, "pricing", JSON.parse('{"__proto__": {"enabled": true}}')), code("invalid-flag"));
  await assert.rejects(flags.admin.update(ADMIN, "nope", { rolloutPercent: 1 }), code("not-found"));
  await assert.rejects(flags.admin.create(ADMIN, { key: "pricing" }), code("exists"));
  advance(1000);
  await flags.admin.remove(ADMIN, "pricing");
  const audit = await flags.admin.audit(VIEWER, { flagKey: "pricing" });
  assert.deepEqual(audit.map((e) => e.action), ["delete", "update", "create"], "newest first");
  const [del, upd, cre] = audit;
  assert.equal(cre.actor, "admin-1");
  assert.equal(cre.at, createdAt);
  assert.equal(cre.before, null);
  assert.equal(cre.after.rolloutPercent, 10);
  assert.equal(upd.before.rolloutPercent, 10);
  assert.equal(upd.after.rolloutPercent, 20);
  assert.equal(upd.after.enabled, false);
  assert.equal(upd.at, createdAt + 1000);
  assert.equal(del.before.version, 2);
  assert.equal(del.after, null);
  // Refused changes left no audit entries; the log is append-only: returned entries are copies.
  assert.equal(audit.length, 3);
  audit[0].actor = "tampered";
  assert.equal((await flags.admin.audit(ADMIN, { flagKey: "pricing" }))[0].actor, "admin-1");
  // Without an authorize hook every admin operation is refused.
  const locked = setup({ options: { authorize: undefined } });
  await assert.rejects(locked.flags.admin.list(ADMIN), code("forbidden"));
});

test("concurrent updates with the same expected version: exactly one wins and one audit entry is written", async () => {
  const { flags } = setup();
  await flags.admin.create(ADMIN, { key: "race" });
  const results = await Promise.allSettled([10, 20, 30, 40].map((pct) => flags.admin.update(ADMIN, "race", { rolloutPercent: pct }, { expectedVersion: 1 })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => code("conflict")(r.reason)));
  assert.equal((await flags.admin.audit(ADMIN, { flagKey: "race" })).length, 2);
});

// Experiments ------------------------------------------------------------------------------------------------------

test("deterministic assignment: a subject gets the same variant on every visit and on every instance sharing its id", async () => {
  const flag = validateFlagInput({ key: "hero", variants: [{ name: "control", weight: 1 }, { name: "big", weight: 1 }, { name: "video", weight: 1 }] });
  const one = setup({ store: new MemoryFeatureFlagStore([flag]) });
  const two = setup({ store: new MemoryFeatureFlagStore([flag]) });
  for (const id of users(300)) {
    const v = (await one.flags.evaluate("hero", { userId: id })).variant;
    assert.ok(["control", "big", "video"].includes(v));
    assert.equal((await one.flags.evaluate("hero", { userId: id })).variant, v);
    assert.equal((await two.flags.evaluate("hero", { userId: id })).variant, v, "another device/instance agrees");
  }
});

test("weighted variants: weights are honored and a zero-weight variant is never assigned", () => {
  const flag = validateFlagInput({ key: "weights", variants: [{ name: "a", weight: 1 }, { name: "off", weight: 0 }, { name: "b", weight: 3 }] });
  const counts = { a: 0, b: 0, off: 0 };
  for (const id of users(20000)) counts[evaluateFlag(flag, { userId: id }).variant]++;
  assert.equal(counts.off, 0);
  assert.ok(Math.abs(counts.a / 20000 - 0.25) < 0.015, `a share ${counts.a / 20000}`);
  assert.ok(Math.abs(counts.b / 20000 - 0.75) < 0.015);
});

test("experiment independence: assignments in two experiments are uncorrelated because hashing is salted by key", () => {
  const variants = [{ name: "a", weight: 1 }, { name: "b", weight: 1 }];
  const one = validateFlagInput({ key: "exp-one", variants });
  const two = validateFlagInput({ key: "exp-two", variants });
  const resalted = validateFlagInput({ key: "exp-one", variants, salt: "rerun-2" });
  const ids = users(10000);
  const agree = (x, y) => ids.filter((id) => evaluateFlag(x, { userId: id }).variant === evaluateFlag(y, { userId: id }).variant).length / ids.length;
  assert.ok(Math.abs(agree(one, two) - 0.5) < 0.02, "independent experiments agree about half the time");
  assert.ok(Math.abs(agree(one, resalted) - 0.5) < 0.02, "a new salt reshuffles a rerun");
  // Joint cells are each about a quarter.
  const cells = new Map();
  for (const id of ids) {
    const k = `${evaluateFlag(one, { userId: id }).variant}${evaluateFlag(two, { userId: id }).variant}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  for (const n of cells.values()) assert.ok(Math.abs(n / ids.length - 0.25) < 0.02);
});

test("exposure logging: recorded once per subject per experiment, idempotent across repeats and concurrency", async () => {
  const flag = validateFlagInput({ key: "cta", variants: [{ name: "blue", weight: 1 }, { name: "green", weight: 1 }] });
  const other = validateFlagInput({ key: "nav", variants: [{ name: "x", weight: 1 }] });
  const off = validateFlagInput({ key: "off-exp", enabled: false, variants: [{ name: "x", weight: 1 }] });
  const { flags, store, exposures } = setup({ store: new MemoryFeatureFlagStore([flag, other, off]) });
  const results = await Promise.all(Array.from({ length: 5 }, () => flags.expose("cta", { userId: "u1" })));
  assert.equal(results.filter((r) => r.firstExposure).length, 1, "exactly one first exposure under concurrency");
  assert.ok(results.every((r) => r.variant === results[0].variant));
  await flags.expose("cta", { userId: "u1" });
  await flags.expose("nav", { userId: "u1" });
  assert.equal(exposures.length, 2, "one event per subject per experiment");
  assert.deepEqual(exposures[0], { flagKey: "cta", runId: "", unitId: "user:u1", variant: results[0].variant, at: 1_000_000 });
  assert.equal(store.dumpExposures().length, 2);
  // Evaluating without exposing logs nothing; a subject who is not shown the experiment is not exposed.
  await flags.evaluate("cta", { userId: "u2" });
  const notShown = await flags.expose("off-exp", { userId: "u2" });
  assert.equal(notShown.firstExposure, false);
  assert.equal(store.dumpExposures().length, 2);
});

test("anonymous to user: a visitor keeps the anonymous assignment after signing in, on every device", async () => {
  const flag = validateFlagInput({ key: "onboarding", variants: [{ name: "short", weight: 1 }, { name: "long", weight: 1 }] });
  // Pick an anonymous id and a user id whose hashes would give different variants.
  const anon = "anon-7";
  const anonVariant = evaluateFlag(flag, { anonymousId: anon }).variant;
  const user = users(100).find((id) => evaluateFlag(flag, { userId: id }).variant !== anonVariant);
  const { flags, exposures } = setup({ store: new MemoryFeatureFlagStore([flag]) });
  const before = await flags.expose("onboarding", { anonymousId: anon });
  assert.equal(before.variant, anonVariant);
  const signedIn = await flags.evaluate("onboarding", { anonymousId: anon, userId: user });
  assert.equal(signedIn.variant, anonVariant);
  assert.equal(signedIn.variantSource, "stitched");
  const exposed = await flags.expose("onboarding", { anonymousId: anon, userId: user });
  assert.equal(exposed.variant, anonVariant);
  assert.equal(exposed.firstExposure, false, "the same unit is not counted twice after sign-in");
  // Another device with a fresh anonymous id, signed in as the same user.
  const otherDevice = await flags.evaluate("onboarding", { anonymousId: "anon-other-device", userId: user });
  assert.equal(otherDevice.variant, anonVariant);
  assert.equal(otherDevice.variantSource, "stored");
  assert.equal(exposures.length, 1);
  assert.equal(exposures[0].unitId, `anon:${anon}`);
  // Explicit stitching copies every anonymous assignment to the user without overwriting the user's own.
  const second = validateFlagInput({ key: "pricing-page", variants: [{ name: "a", weight: 1 }, { name: "b", weight: 1 }] });
  const s = setup({ store: new MemoryFeatureFlagStore([flag, second]) });
  await s.flags.expose("onboarding", { anonymousId: anon });
  await s.flags.expose("pricing-page", { anonymousId: anon });
  assert.equal(await s.flags.stitch(anon, user), 2);
  assert.equal(await s.flags.stitch(anon, user), 0, "stitching is idempotent");
  assert.equal((await s.flags.evaluate("onboarding", { userId: user })).variant, anonVariant);
});

test("stable on change: changing weights, traffic or the variant list does not silently reassign exposed subjects", async () => {
  const { flags } = setup();
  await flags.admin.create(ADMIN, { key: "layout", rolloutPercent: 50, variants: [{ name: "a", weight: 1 }, { name: "b", weight: 1 }] });
  const ids = users(2000);
  const exposed = new Map();
  for (const id of ids) {
    const r = await flags.expose("layout", { userId: id });
    if (r.on) exposed.set(id, r.variant);
  }
  assert.ok(exposed.size > 800 && exposed.size < 1200);
  // Re-weight heavily, add a variant and cut traffic to 10%.
  await flags.admin.update(ADMIN, "layout", { rolloutPercent: 10, variants: [{ name: "a", weight: 9 }, { name: "b", weight: 1 }, { name: "c", weight: 5 }] });
  const fresh = { a: 0, b: 0, c: 0 };
  for (const id of ids) {
    const r = await flags.evaluate("layout", { userId: id });
    if (exposed.has(id)) {
      assert.equal(r.on, true, "an exposed subject stays in the experiment when traffic is cut");
      assert.equal(r.variant, exposed.get(id), "and keeps its variant when weights change");
      assert.equal(r.reason, "assigned");
      assert.equal(r.variantSource, "stored");
    } else assert.equal(r.on, false, "every in-rollout subject at 10% was already exposed at 50%");
  }
  for (const id of users(3000, "newcomer")) {
    const r = await flags.evaluate("layout", { userId: id });
    if (r.on) fresh[r.variant]++;
  }
  assert.ok(fresh.a > 1.4 * fresh.c && fresh.c > 2.5 * fresh.b, `new subjects follow the new 9:1:5 weights ${JSON.stringify(fresh)}`);
  // Setting a variant's weight to zero stops new assignments but keeps existing ones.
  await flags.admin.update(ADMIN, "layout", { variants: [{ name: "a", weight: 0 }, { name: "b", weight: 1 }, { name: "c", weight: 1 }] });
  const keptA = [...exposed].find(([, v]) => v === "a")[0];
  assert.equal((await flags.evaluate("layout", { userId: keptA })).variant, "a");
  // Removing a variant reassigns explicitly (variantSource "reassigned", previousVariant reported), never silently.
  await flags.admin.update(ADMIN, "layout", { variants: [{ name: "b", weight: 1 }, { name: "c", weight: 1 }] });
  const moved = await flags.expose("layout", { userId: keptA });
  assert.equal(moved.variantSource, "reassigned");
  assert.equal(moved.previousVariant, "a");
  assert.ok(["b", "c"].includes(moved.variant));
  assert.equal((await flags.evaluate("layout", { userId: keptA })).variantSource, "stored", "the reassignment is persisted");
  // The kill switch still turns everyone off, including assigned subjects.
  await flags.admin.update(ADMIN, "layout", { enabled: false });
  assert.equal((await flags.evaluate("layout", { userId: keptA })).reason, "disabled");
});

test("analysis: per-variant exposures, conversions and rates with a two-proportion z-test against control", async () => {
  const { flags } = setup();
  await flags.admin.create(ADMIN, { key: "signup-copy", variants: [{ name: "control", weight: 1 }, { name: "bold", weight: 1 }] });
  const ids = users(4000);
  let byVariant = { control: 0, bold: 0 };
  for (const id of ids) {
    const r = await flags.expose("signup-copy", { userId: id });
    byVariant[r.variant]++;
    // Deterministic outcome: bold converts every 4th subject, control every 10th.
    const n = Number(id.split("-")[1]);
    if ((r.variant === "bold" && n % 4 === 0) || (r.variant === "control" && n % 10 === 0)) {
      assert.equal((await flags.trackConversion("signup-copy", { userId: id })).counted, true);
      assert.equal((await flags.trackConversion("signup-copy", { userId: id })).reason, "duplicate");
    }
  }
  assert.equal((await flags.trackConversion("signup-copy", { userId: "never-exposed" })).reason, "not-exposed");
  const report = await flags.analyze("signup-copy");
  assert.equal(report.control, "control");
  const [control, bold] = report.variants;
  assert.equal(control.exposures, byVariant.control);
  assert.equal(bold.exposures, byVariant.bold);
  assert.equal(control.exposures + bold.exposures, 4000);
  assert.ok(Math.abs(control.rate - 0.1) < 0.02 && Math.abs(bold.rate - 0.25) < 0.03);
  assert.equal(control.z, null);
  assert.ok(bold.z > 5 && bold.pValue < 0.001 && bold.significant === true);
  const expected = twoProportionZTest(control.conversions, control.exposures, bold.conversions, bold.exposures);
  assert.equal(bold.z, expected.z);
  // Reference values: 200/1000 vs 250/1000 → z ≈ 2.6774, two-sided p ≈ 0.00742; z = 1.96 ↔ p ≈ 0.05.
  const ref = twoProportionZTest(200, 1000, 250, 1000);
  assert.ok(Math.abs(ref.z - 2.6774) < 1e-3, `z ${ref.z}`);
  assert.ok(Math.abs(ref.pValue - 0.00742) < 1e-4, `p ${ref.pValue}`);
  assert.deepEqual(twoProportionZTest(0, 10, 0, 10), { z: 0, pValue: 1 });
  assert.throws(() => twoProportionZTest(5, 4, 1, 10), RangeError);
  // A flag without variants is not an experiment.
  await flags.admin.create(ADMIN, { key: "plain" });
  assert.equal((await flags.trackConversion("plain", { userId: "u" })).reason, "not-an-experiment");
  await assert.rejects(flags.analyze("plain"), code("bad-request"));
});

// HTTP adapter ------------------------------------------------------------------------------------------------------

function httpSetup(extra = {}) {
  const s = setup();
  const handler = createFeatureFlagHandler({
    flags: s.flags,
    prefix: "/api/flags",
    authenticate: (request) => {
      const token = request.headers.get("authorization");
      return token === "Bearer admin" ? ADMIN : token === "Bearer viewer" ? VIEWER : null;
    },
    subject: (request) => ({ userId: request.headers.get("x-test-user") ?? undefined, tenantId: "t1" }),
    ...extra,
  });
  const call = (method, path, { body, headers = {} } = {}) => handler(new Request(`https://app.example.com${path}`, {
    method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }));
  return { ...s, handler, call };
}
const admin = { authorization: "Bearer admin" };

test("HTTP adapter: admin CRUD, audit and evaluate with default routes and statuses", async () => {
  const { call } = httpSetup();
  let res = await call("POST", "/api/flags/flags", { body: { key: "web-beta", rolloutPercent: 100, variants: [{ name: "a", weight: 1 }] }, headers: admin });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal((await res.json()).flag.version, 1);
  res = await call("POST", "/api/flags/flags", { body: { key: "web-beta" }, headers: admin });
  assert.equal(res.status, 409);
  res = await call("POST", "/api/flags/flags", { body: { key: "bad key" }, headers: admin });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).problems.length > 0);
  res = await call("GET", "/api/flags/flags", { headers: admin });
  assert.equal((await res.json()).flags.length, 1);
  res = await call("GET", "/api/flags/flags/web-beta", { headers: { authorization: "Bearer viewer" } });
  assert.equal(res.status, 200);
  res = await call("PATCH", "/api/flags/flags/web-beta", { body: { rolloutPercent: 0, expectedVersion: 1 }, headers: admin });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).flag.version, 2);
  res = await call("PATCH", "/api/flags/flags/web-beta", { body: { rolloutPercent: 5, expectedVersion: 1 }, headers: admin });
  assert.equal(res.status, 409);
  res = await call("GET", "/api/flags/flags/web-beta/audit", { headers: admin });
  assert.deepEqual((await res.json()).entries.map((e) => e.action), ["update", "create"]);
  res = await call("POST", "/api/flags/evaluate", { body: { keys: ["web-beta", "nope"] }, headers: { "x-test-user": "u1" } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { flags: { "web-beta": { on: false, variant: null, reason: "excluded" }, nope: { on: false, variant: null, reason: "not-found" } } });
  res = await call("DELETE", "/api/flags/flags/web-beta?version=2", { headers: admin });
  assert.equal(res.status, 204);
  res = await call("GET", "/api/flags/flags/web-beta", { headers: admin });
  assert.equal(res.status, 404);
  res = await call("PUT", "/api/flags/flags/web-beta", { headers: admin });
  assert.equal(res.status, 405);
  res = await call("GET", "/elsewhere", { headers: admin });
  assert.equal(res.status, 404);
  res = await call("POST", "/api/flags/flags", { body: "{not json", headers: admin });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid-json");
});

test("HTTP adapter: the client cannot alter flags or choose its subject; admin routes need authentication and authorization", async () => {
  const { call, flags } = httpSetup({ allowedOrigins: ["https://app.example.com"] });
  await flags.admin.create(ADMIN, { key: "secret-feature", rolloutPercent: 0, allowUsers: ["vip"] });
  let res = await call("POST", "/api/flags/flags", { body: { key: "evil" } });
  assert.equal(res.status, 401);
  res = await call("POST", "/api/flags/flags", { body: { key: "evil" }, headers: { authorization: "Bearer viewer", origin: "https://app.example.com" } });
  assert.equal(res.status, 403);
  res = await call("POST", "/api/flags/flags", { body: { key: "evil" }, headers: { ...admin, origin: "https://evil.example" } });
  assert.equal(res.status, 403, "mutations need an allowed Origin when allowedOrigins is set");
  // A body-supplied userId and flag config are ignored: the subject comes from the trusted hook.
  res = await call("POST", "/api/flags/evaluate", { body: { keys: ["secret-feature"], userId: "vip", flag: { rolloutPercent: 100 } }, headers: { "x-test-user": "nobody" } });
  assert.deepEqual((await res.json()).flags["secret-feature"], { on: false, variant: null, reason: "excluded" });
  res = await call("POST", "/api/flags/evaluate", { body: { keys: ["secret-feature"] }, headers: { "x-test-user": "vip" } });
  assert.equal((await res.json()).flags["secret-feature"].on, true);
  res = await call("POST", "/api/flags/evaluate", { body: { keys: Array.from({ length: 101 }, (_, i) => `k${i}`) } });
  assert.equal(res.status, 400);
  res = await call("POST", "/api/flags/evaluate", { body: "x".repeat(70_000), headers: { "x-test-user": "u" } });
  assert.equal(res.status, 400);
});

test("HTTP adapter: evaluate with expose logs exposures once; omitting keys evaluates every flag", async () => {
  const { call, flags, exposures } = httpSetup();
  await flags.admin.create(ADMIN, { key: "exp-a", variants: [{ name: "x", weight: 1 }, { name: "y", weight: 1 }] });
  await flags.admin.create(ADMIN, { key: "flag-b", rolloutPercent: 100 });
  for (let i = 0; i < 3; i++) await call("POST", "/api/flags/evaluate", { body: { keys: ["exp-a"], expose: true }, headers: { "x-test-user": "u9" } });
  assert.equal(exposures.length, 1);
  const res = await call("POST", "/api/flags/evaluate", { body: {}, headers: { "x-test-user": "u9" } });
  assert.deepEqual(Object.keys((await res.json()).flags).sort(), ["exp-a", "flag-b"]);
});

test("HTTP adapter: routes, statusFor and prefix overrides let an app keep its own URL and status conventions", async () => {
  const { call, flags } = httpSetup({
    prefix: "/internal/ff/",
    routes: { evaluate: "GET /decide", getFlag: "GET /admin/flag/:key", updateFlag: "PUT /admin/flag/:key" },
    statusFor: { "not-found": 410, conflict: 412, unauthenticated: 403 },
  });
  await flags.admin.create(ADMIN, { key: "custom", rolloutPercent: 100 });
  let res = await call("GET", "/internal/ff/admin/flag/custom", { headers: admin });
  assert.equal(res.status, 200);
  res = await call("GET", "/internal/ff/admin/flag/missing", { headers: admin });
  assert.equal(res.status, 410);
  res = await call("PUT", "/internal/ff/admin/flag/custom", { body: { rolloutPercent: 5, expectedVersion: 9 }, headers: admin });
  assert.equal(res.status, 412);
  res = await call("GET", "/internal/ff/admin/flag/custom");
  assert.equal(res.status, 403);
  res = await call("GET", "/internal/ff/decide?keys=custom", { headers: { "x-test-user": "u" } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).flags.custom.on, true);
  // Default paths that were overridden no longer match; untouched defaults still work.
  res = await call("POST", "/internal/ff/evaluate", { body: {}, headers: { "x-test-user": "u" } });
  assert.equal(res.status, 404);
  res = await call("GET", "/internal/ff/flags", { headers: admin });
  assert.equal(res.status, 200);
  assert.throws(() => createFeatureFlagHandler({ flags, prefix: "/x", authenticate: () => null, subject: () => ({}), routes: { evaluate: "FETCH decide" } }), RangeError);
  assert.throws(() => createFeatureFlagHandler({ flags, prefix: "/x", authenticate: () => null, subject: () => ({}), statusFor: { conflict: 99 } }), RangeError);
});

// Experiment reruns ------------------------------------------------------------------------------------------------

async function exposeAndConvert(flags, key, ids) {
  const variants = new Map();
  for (const id of ids) {
    variants.set(id, (await flags.expose(key, { userId: id })).variant);
    await flags.trackConversion(key, { userId: id });
  }
  return variants;
}

async function assertFreshRun(flags, key, ids, before) {
  const empty = await flags.analyze(key);
  assert.ok(empty.variants.every((v) => v.exposures === 0 && v.conversions === 0), "analysis of the rerun starts empty");
  let same = 0;
  for (const id of ids) {
    const r = await flags.expose(key, { userId: id });
    assert.equal(r.firstExposure, true, "every subject is exposed afresh in the rerun");
    assert.equal(r.variantSource, "hash", "old assignments are not reused");
    if (r.variant === before.get(id)) same++;
  }
  assert.ok(same > 400 && same < 600, `a rerun reshuffles about half of a 50/50 split (same ${same}/1000)`);
  assert.equal((await flags.trackConversion(key, { userId: ids[0] })).reason, "counted", "old conversions do not block the rerun");
  const after = await flags.analyze(key);
  assert.equal(after.variants.reduce((sum, v) => sum + v.exposures, 0), ids.length);
  assert.equal(after.variants.reduce((sum, v) => sum + v.conversions, 0), 1);
}

test("experiment rerun by a new salt: fresh assignments, exposures and an empty analysis (memory store)", async () => {
  const { flags } = setup();
  await flags.admin.create(ADMIN, { key: "rerun-salt", variants: [{ name: "A", weight: 1 }, { name: "B", weight: 1 }] });
  const ids = users(1000);
  const before = await exposeAndConvert(flags, "rerun-salt", ids);
  await flags.admin.update(ADMIN, "rerun-salt", { salt: "rerun-2" });
  await assertFreshRun(flags, "rerun-salt", ids, before);
  // Changing anything but the salt keeps the run (weights change, assignments stay).
  const kept = (await flags.evaluate("rerun-salt", { userId: ids[1] })).variant;
  await flags.admin.update(ADMIN, "rerun-salt", { variants: [{ name: "A", weight: 5 }, { name: "B", weight: 1 }] });
  assert.equal((await flags.evaluate("rerun-salt", { userId: ids[1] })).variant, kept);
});

test("experiment rerun by remove and create: old rows are not reused or counted (memory store)", async () => {
  const { flags } = setup();
  const variants = [{ name: "A", weight: 1 }, { name: "B", weight: 1 }];
  await flags.admin.create(ADMIN, { key: "rerun-recreate", variants });
  const ids = users(1000);
  const before = await exposeAndConvert(flags, "rerun-recreate", ids);
  await flags.admin.remove(ADMIN, "rerun-recreate");
  await flags.admin.create(ADMIN, { key: "rerun-recreate", variants, salt: "rerun-2" });
  await assertFreshRun(flags, "rerun-recreate", ids, before);
  // Even recreated with the same (empty) salt, the new flag is a new run.
  await flags.admin.remove(ADMIN, "rerun-recreate");
  await flags.admin.create(ADMIN, { key: "rerun-recreate", variants });
  assert.equal((await flags.evaluate("rerun-recreate", { userId: ids[0] })).variantSource, "hash");
  assert.ok((await flags.analyze("rerun-recreate")).variants.every((v) => v.exposures === 0));
});
