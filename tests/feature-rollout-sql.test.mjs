// SPDX-License-Identifier: Apache-2.0
// feature-rollout on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, a flag write
// and its audit row commit together or not at all, the audit table rejects UPDATE/DELETE, and assignments, exposures
// and conversions are idempotent under concurrent calls.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createFeatureFlags, evaluateFlag, validateFlagInput, FeatureFlagError } from "../.build/modules/feature-rollout/files/core.js";
import { createSqlFeatureFlagStore } from "../.build/modules/feature-rollout/files/sql-store.js";

const schema = readFileSync(new URL("../modules/feature-rollout/files/schema.sql", import.meta.url), "utf8");
const executor = (db) => ({ query: (text, params) => db.query(text, params) });
const ADMIN = { id: "ops-1" };
const code = (expected) => (error) => error instanceof FeatureFlagError && error.code === expected;

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(schema); // idempotent re-apply
  let now = 1_000_000;
  let ids = 0;
  const exposures = [];
  const make = () => createFeatureFlags({
    store: createSqlFeatureFlagStore(executor(db)), now: () => now, newId: () => `a${++ids}`, cacheTtlMs: 2000,
    authorize: (actor) => actor.id === ADMIN.id, onExposure: (e) => exposures.push(e),
  });
  return { db, flags: make(), make, exposures, advance: (ms) => { now += ms; } };
}

test("SQL store: audited CRUD with optimistic versions; the audit table is append-only", async () => {
  const { db, flags, advance } = await setup();
  await flags.admin.create(ADMIN, { key: "billing-v2", rolloutPercent: 5, allowTenants: ["acme"] });
  await assert.rejects(flags.admin.create(ADMIN, { key: "billing-v2" }), code("exists"));
  advance(10);
  await flags.admin.update(ADMIN, "billing-v2", { rolloutPercent: 25 }, { expectedVersion: 1 });
  await assert.rejects(flags.admin.update(ADMIN, "billing-v2", { rolloutPercent: 50 }, { expectedVersion: 1 }), code("conflict"));
  await assert.rejects(flags.admin.update({ id: "intruder" }, "billing-v2", { rolloutPercent: 100 }), code("forbidden"));
  const stored = await flags.admin.get(ADMIN, "billing-v2");
  assert.equal(stored.version, 2);
  assert.equal(stored.rolloutPercent, 25);
  assert.deepEqual(stored.allowTenants, ["acme"]);
  advance(10);
  await flags.admin.remove(ADMIN, "billing-v2", { expectedVersion: 2 });
  const audit = await flags.admin.audit(ADMIN, { flagKey: "billing-v2" });
  assert.deepEqual(audit.map((e) => [e.action, e.actor, e.at]), [["delete", "ops-1", 1_000_020], ["update", "ops-1", 1_000_010], ["create", "ops-1", 1_000_000]]);
  assert.equal(audit[1].before.rolloutPercent, 5);
  assert.equal(audit[1].after.rolloutPercent, 25);
  assert.equal(audit[0].after, null);
  const count = async () => (await db.query("SELECT count(*)::int AS n FROM feature_flag_audit")).rows[0].n;
  assert.equal(await count(), 3, "refused writes left no audit rows");
  await assert.rejects(db.query("UPDATE feature_flag_audit SET actor = 'someone-else'"), /append-only/);
  await assert.rejects(db.query("DELETE FROM feature_flag_audit"), /append-only/);
  assert.equal(await count(), 3);
});

test("SQL store: four concurrent updates at the same version: one wins, one audit row", async () => {
  const { db, flags } = await setup();
  await flags.admin.create(ADMIN, { key: "race" });
  const results = await Promise.allSettled([1, 2, 3, 4].map((n) => flags.admin.update(ADMIN, "race", { rolloutPercent: n * 10 }, { expectedVersion: 1 })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM feature_flag_audit WHERE action = 'update'")).rows[0].n, 1);
  assert.equal((await db.query("SELECT version FROM feature_flags WHERE key = 'race'")).rows[0].version, 2);
});

test("SQL store: runtime config reaches a second instance after the TTL and notifies subscribers", async () => {
  const { flags, make, advance } = await setup();
  const other = make();
  const events = [];
  other.subscribe((e) => events.push(e));
  await flags.admin.create(ADMIN, { key: "ship-it", rolloutPercent: 0 });
  assert.equal((await other.evaluate("ship-it", { userId: "u" })).on, false);
  await flags.admin.update(ADMIN, "ship-it", { rolloutPercent: 100 });
  assert.equal((await other.evaluate("ship-it", { userId: "u" })).on, false, "cached");
  advance(2000);
  assert.equal((await other.evaluate("ship-it", { userId: "u" })).on, true);
  assert.deepEqual(events, [{ changed: ["ship-it"] }]);
  await flags.admin.update(ADMIN, "ship-it", { enabled: false });
  await other.refresh();
  assert.equal((await other.evaluate("ship-it", { userId: "u" })).reason, "disabled", "kill switch");
});

test("SQL store: exposures once per unit under concurrency, stitching, stable assignments and analysis", async () => {
  const { db, flags, exposures } = await setup();
  await flags.admin.create(ADMIN, { key: "checkout", rolloutPercent: 100, variants: [{ name: "control", weight: 1 }, { name: "one-page", weight: 1 }] });
  const first = await Promise.all(Array.from({ length: 4 }, () => flags.expose("checkout", { anonymousId: "visitor-1" })));
  assert.equal(first.filter((r) => r.firstExposure).length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM feature_flag_exposures")).rows[0].n, 1);
  // Sign-in keeps the anonymous variant, even for a user id that would hash differently.
  const flag = validateFlagInput({ key: "checkout", variants: [{ name: "control", weight: 1 }, { name: "one-page", weight: 1 }] });
  const user = Array.from({ length: 50 }, (_, i) => `member-${i}`).find((id) => evaluateFlag(flag, { userId: id }).variant !== first[0].variant);
  const signedIn = await flags.expose("checkout", { anonymousId: "visitor-1", userId: user });
  assert.equal(signedIn.variant, first[0].variant);
  assert.equal(signedIn.firstExposure, false);
  assert.equal((await flags.evaluate("checkout", { userId: user })).variant, first[0].variant);
  assert.equal(await flags.stitch("visitor-1", user), 0, "already stitched by expose");
  // Expose a population, then change weights: exposed subjects keep their variants.
  const assigned = new Map();
  for (let i = 0; i < 300; i++) assigned.set(`u${i}`, (await flags.expose("checkout", { userId: `u${i}` })).variant);
  await flags.admin.update(ADMIN, "checkout", { rolloutPercent: 0, variants: [{ name: "control", weight: 0 }, { name: "one-page", weight: 1 }] });
  for (const [id, variant] of assigned) {
    const r = await flags.evaluate("checkout", { userId: id });
    assert.equal(r.variant, variant);
    assert.equal(r.reason, "assigned");
  }
  // Conversions: once per unit, attributed to the exposure variant.
  for (const [id, variant] of assigned) {
    if (variant === "one-page" || Number(id.slice(1)) % 5 === 0) await flags.trackConversion("checkout", { userId: id });
  }
  assert.equal((await flags.trackConversion("checkout", { userId: "u0" })).reason, "duplicate");
  assert.equal((await flags.trackConversion("checkout", { userId: "stranger" })).reason, "not-exposed");
  const report = await flags.analyze("checkout");
  const total = report.variants.reduce((sum, v) => sum + v.exposures, 0);
  assert.equal(total, 301, "300 users plus the stitched visitor counted once");
  const onePage = report.variants.find((v) => v.variant === "one-page");
  assert.equal(onePage.conversions, onePage.exposures - (first[0].variant === "one-page" ? 1 : 0), "only the never-converting visitor is missing");
  assert.ok(onePage.significant && onePage.pValue < 1e-6);
  assert.equal(exposures.length, 301);
});

test("SQL store: removing a variant reassigns explicitly and persists the new variant for the whole unit", async () => {
  const { db, flags } = await setup();
  await flags.admin.create(ADMIN, { key: "menu", variants: [{ name: "a", weight: 1 }, { name: "b", weight: 1 }] });
  let id = 0;
  let r;
  do { r = await flags.expose("menu", { anonymousId: `anon-${++id}` }); } while (r.variant !== "a");
  await flags.stitch(`anon-${id}`, "member");
  await flags.admin.update(ADMIN, "menu", { variants: [{ name: "b", weight: 1 }, { name: "c", weight: 1 }] });
  const moved = await flags.expose("menu", { userId: "member", anonymousId: `anon-${id}` });
  assert.equal(moved.variantSource, "reassigned");
  assert.equal(moved.previousVariant, "a");
  const rows = (await db.query("SELECT subject_key, variant FROM feature_flag_assignments WHERE unit_id = $1 ORDER BY subject_key", [`anon:anon-${id}`])).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.variant === moved.variant), "anonymous and user rows both moved");
  const exposure = (await db.query("SELECT variant FROM feature_flag_exposures WHERE unit_id = $1", [`anon:anon-${id}`])).rows[0];
  assert.equal(exposure.variant, "a", "analysis keeps the variant first shown (intention to treat)");
});

test("SQL store: reruns by a new salt or by remove and create start fresh and analyze() is empty", async () => {
  const { flags } = await setup();
  const variants = [{ name: "A", weight: 1 }, { name: "B", weight: 1 }];
  const ids = Array.from({ length: 1000 }, (_, i) => `p${i}`);
  const run = async () => {
    const before = new Map();
    for (const id of ids) { before.set(id, (await flags.expose("pg-rerun", { userId: id })).variant); await flags.trackConversion("pg-rerun", { userId: id }); }
    return before;
  };
  const check = async (before) => {
    assert.ok((await flags.analyze("pg-rerun")).variants.every((v) => v.exposures === 0 && v.conversions === 0), "rerun analysis starts empty");
    let same = 0;
    for (const id of ids) {
      const r = await flags.expose("pg-rerun", { userId: id });
      assert.equal(r.firstExposure, true);
      assert.equal(r.variantSource, "hash");
      if (r.variant === before.get(id)) same++;
    }
    assert.ok(same > 400 && same < 600, `reshuffled (same ${same}/1000)`);
    assert.equal((await flags.trackConversion("pg-rerun", { userId: ids[0] })).reason, "counted");
    const after = await flags.analyze("pg-rerun");
    assert.equal(after.variants.reduce((s, v) => s + v.exposures, 0), 1000);
    assert.equal(after.variants.reduce((s, v) => s + v.conversions, 0), 1);
  };
  await flags.admin.create(ADMIN, { key: "pg-rerun", variants });
  let before = await run();
  await flags.admin.update(ADMIN, "pg-rerun", { salt: "rerun-2" });
  await check(before);
  before = await run();
  await flags.admin.remove(ADMIN, "pg-rerun");
  await flags.admin.create(ADMIN, { key: "pg-rerun", variants, salt: "rerun-3" });
  await check(before);
});
