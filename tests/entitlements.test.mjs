// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createEntitlements } from "../.build/modules/entitlements/files/plans.js";
import { createCredits, CreditError, MemoryCreditStore } from "../.build/modules/entitlements/files/credits.js";

const DAY = 86_400_000;
const plans = {
  free: { features: { export: false }, limits: { seats: 1, projects: 3 } },
  pro: { features: { export: true, sso: false }, limits: { seats: 10, projects: Infinity } },
};
const code = (expected) => (error) => error instanceof CreditError && error.code === expected;

test("features and limits follow the plan, overrides and subscription status", () => {
  let now = 10 * DAY;
  const e = createEntitlements({ plans, fallbackPlan: "free", graceMs: 3 * DAY, now: () => now });
  const pro = { accountId: "a", plan: "pro", status: "active" };
  assert.deepEqual(e.check(pro, "export"), { allowed: true, plan: "pro" });
  assert.deepEqual(e.check(pro, "sso"), { allowed: false, plan: "pro", reason: "not-in-plan" });
  assert.equal(e.check(pro, "unknown-feature").allowed, false);
  assert.equal(e.canUse(pro, "projects", 1_000_000).allowed, true);
  assert.deepEqual(e.canUse(pro, "seats", 10), { allowed: false, plan: "pro", reason: "limit-reached" });
  assert.equal(e.limit(pro, "unmentioned"), 0);
  // A negotiated override applies on the account's own plan.
  const big = { ...pro, overrides: { limits: { seats: 50 }, features: { sso: true } } };
  assert.equal(e.canUse(big, "seats", 40, 5).allowed, true);
  assert.equal(e.check(big, "sso").allowed, true);
  // past_due keeps pro inside grace, then falls back to free; overrides do not upgrade the fallback.
  const late = { ...big, status: "past_due", pastDueSince: now - DAY };
  assert.equal(e.effectivePlan(late), "pro");
  now += 3 * DAY;
  assert.equal(e.effectivePlan(late), "free");
  assert.equal(e.check(late, "sso").allowed, false);
  assert.equal(e.limit(late, "seats"), 1);
  for (const status of ["canceled", "unpaid"]) assert.equal(e.effectivePlan({ ...pro, status }), "free");
  assert.equal(e.effectivePlan({ ...pro, status: "past_due" }), "free", "past_due without a start date has no grace");
  assert.equal(e.check({ accountId: "x", plan: "gold", status: "active" }, "export").reason, "unknown-plan");
  assert.throws(() => e.canUse(pro, "seats", -1), RangeError);
  assert.throws(() => createEntitlements({ plans, fallbackPlan: "nope" }), RangeError);
  assert.throws(() => createEntitlements({ plans: { free: { features: {}, limits: { seats: -2 } } }, fallbackPlan: "free" }), RangeError);
});

function credits() {
  let now = 1_000_000, id = 0;
  const store = new MemoryCreditStore();
  return { store, c: createCredits({ store, now: () => now, newId: () => `e${++id}` }), advance: (ms) => { now += ms; }, at: () => now };
}

test("grants, debits and idempotency keys: retries never charge twice and balances never go negative", async () => {
  const { c } = credits();
  await c.grant("acct", 100, { key: "purchase-1" });
  const first = await c.debit("acct", 30, { key: "job-1" });
  const retry = await c.debit("acct", 30, { key: "job-1" });
  assert.equal(retry.id, first.id);
  assert.equal((await c.balance("acct")).available, 70);
  await assert.rejects(c.debit("acct", 31, { key: "job-1" }), code("key-reused"));
  await assert.rejects(c.debit("acct", 71, { key: "job-2" }), code("insufficient"));
  assert.equal((await c.balance("acct")).available, 70);
  await c.grant("acct", 100, { key: "purchase-1" }); // replayed grant adds nothing
  assert.equal((await c.balance("acct")).available, 70);
  await assert.rejects(c.debit("acct", 0, { key: "z" }), code("invalid"));
  await assert.rejects(c.debit("acct", 1.5, { key: "z" }), code("invalid"));
  await assert.rejects(c.debit("acct", 1, { key: "" }), code("invalid"));
});

test("expiring grants are consumed first and forfeited after expiry", async () => {
  const { c, advance, at } = credits();
  await c.grant("acct", 50, { key: "monthly", expiresAt: at() + 30 * DAY });
  await c.grant("acct", 100, { key: "bought" });
  await c.debit("acct", 20, { key: "d1" });
  const balance = await c.balance("acct");
  assert.equal(balance.available, 130);
  assert.deepEqual(balance.expiring, [{ amount: 30, expiresAt: at() + 30 * DAY }]);
  advance(30 * DAY);
  assert.equal((await c.balance("acct")).available, 100, "the unused 30 monthly credits expired; purchased ones remain");
  await assert.rejects(c.grant("acct", 5, { key: "old", expiresAt: at() - 1 }), code("invalid"));
});

test("holds reserve credits, capture charges part and returns the rest, release and expiry return all", async () => {
  const { c, advance } = credits();
  await c.grant("acct", 100, { key: "g" });
  const hold = await c.reserve("acct", 40, { key: "render-1", ttlMs: 60_000 });
  assert.deepEqual((await c.balance("acct")), { available: 60, held: 40, expiring: [] });
  await assert.rejects(c.debit("acct", 61, { key: "x" }), code("insufficient"), "held credits are not spendable");
  await c.capture("acct", hold.id, 25);
  assert.deepEqual(await c.balance("acct"), { available: 75, held: 0, expiring: [] });
  await assert.rejects(c.capture("acct", hold.id, 25), code("hold-closed"), "a retried capture cannot charge twice");
  const second = await c.reserve("acct", 10, { key: "render-2", ttlMs: 60_000 });
  assert.equal(await c.release("acct", second.id), true);
  assert.equal(await c.release("acct", second.id), false);
  assert.equal((await c.balance("acct")).available, 75);
  const third = await c.reserve("acct", 30, { key: "render-3", ttlMs: 1000 });
  advance(1000);
  assert.deepEqual(await c.balance("acct"), { available: 75, held: 0, expiring: [] }, "an expired hold returns its credits");
  await assert.rejects(c.capture("acct", third.id, 1), code("hold-closed"));
  await assert.rejects(c.capture("acct", "nope", 1), code("unknown-hold"));
  const fourth = await c.reserve("acct", 5, { key: "render-4", ttlMs: 60_000 });
  await assert.rejects(c.capture("acct", fourth.id, 6), code("invalid"));
});

test("concurrent debits cannot overdraw: the version check makes one of them re-decide", async () => {
  const { c } = credits();
  await c.grant("acct", 100, { key: "g" });
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => c.debit("acct", 30, { key: `job-${i}` })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
  assert.ok(results.filter(r => r.status === "rejected").every(r => r.reason.code === "insufficient"));
  assert.equal((await c.balance("acct")).available, 10);
});

test("a store that keeps losing the race surfaces a conflict instead of writing blindly", async () => {
  const store = new MemoryCreditStore();
  const racing = { read: (id) => store.read(id), append: async () => false };
  const c = createCredits({ store: racing, maxRetries: 2 });
  await assert.rejects(c.grant("acct", 1, { key: "g" }), code("conflict"));
});
