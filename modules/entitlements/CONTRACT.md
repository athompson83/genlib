# Plan entitlements and usage credits · 0.1.0

## What installs

Two original Apache-2.0 TypeScript files under `entitlements/`:

- `plans.ts`: `createEntitlements` for plan features, numeric limits, subscription-status fallback and grace.
- `credits.ts`: `createCredits`, an append-only usage-credit ledger; `CreditError`; the `CreditStore` interface; `MemoryCreditStore` for tests.

There is no billing provider, database or HTTP route inside. Entitlement checks belong in your own request handlers, next to the action they protect.

## When to use it

- **Plans:** a SaaS app whose features or quantities (seats, projects, API keys) depend on the subscription.
- **Credits:** usage-based products (AI calls, renders, SMS, exports) where customers buy or receive credits and each action spends some.

Use your billing provider for prices, invoices and tax. Use this module to decide, at request time, whether the account may do the thing.

## Integration points

| Point | What the application supplies |
| --- | --- |
| Plan table | Feature flags and limits per plan, and the fallback plan for canceled, unpaid and post-grace past_due accounts |
| `Account` | `{accountId, plan, status, pastDueSince?, overrides?}` from your billing state (for example a Stripe subscription synced by webhook), never from the request |
| Current usage | Counted from your data in the same transaction that creates the resource, passed to `canUse` |
| `CreditStore` | `read(accountId)` returns the entries and version; `append(accountId, entry, expectedVersion)` writes only if the version is unchanged. Use a unique `(account_id, version)` key |
| Idempotency keys | A stable key per business event: payment intent id for a grant, job id for a debit or hold |

```ts
import { createEntitlements } from "./genlib/entitlements/plans.js";
import { createCredits } from "./genlib/entitlements/credits.js";

const entitlements = createEntitlements({
  plans: {
    free: { features: { export: false }, limits: { seats: 1, projects: 3 } },
    pro: { features: { export: true }, limits: { seats: 10, projects: Infinity } },
  },
  fallbackPlan: "free",
});
if (!entitlements.canUse(account, "projects", await countProjects(tx, account.accountId)).allowed) return upgradeRequired();

const credits = createCredits({ store });
const hold = await credits.reserve(account.accountId, 50, { key: `render:${jobId}`, ttlMs: 10 * 60_000 });
const used = await render(job);
await credits.capture(account.accountId, hold.id, used);
```

## Behavior

**Plans**
- `check(account, feature)` and `canUse(account, key, current, add)` return `{allowed, plan}`, or `{allowed: false, reason}` with reason `not-in-plan`, `limit-reached` or `unknown-plan`.
- A limit the plan does not mention is 0.
- `active` and `trialing` use the account's plan. `past_due` keeps it for `graceMs` (default 7 days) after `pastDueSince`. `canceled`, `unpaid` and post-grace `past_due` use the fallback plan.
- Per-account overrides apply only while the account's own plan applies. They never upgrade the fallback plan.

**Credits**
- The balance is replayed from the ledger, so every change is auditable.
- Grants may expire; spending draws on the earliest-expiring credits first, and unused expired credits are forfeited.
- `debit` and `reserve` fail with `insufficient` rather than going negative.
- Repeating a key with the same type and amount returns the original entry. A different amount fails with `key-reused`.
- Holds:
  - `reserve` sets credits aside until `capture` (charge up to the held amount, return the rest), `release`, or the TTL (1 second to 24 hours).
  - A captured or released hold is closed: a retried capture fails with `hold-closed` and charges nothing.
- Every write re-reads the ledger and appends conditionally on its version. On a concurrent write it decides again, so five simultaneous 30-credit debits against 100 credits charge exactly three.

## Verify

`npm run build && node --test tests/entitlements.test.mjs` covers:

- plan features and limits, overrides, grace and fallback
- idempotency keys and key reuse
- non-negative balances
- expiry order
- hold capture, release and expiry
- concurrent debits
- persistent append conflicts

In the receiving app, run the concurrent-debit case against your real store. Also test that canceling a subscription removes paid features.

## If something fails

- Concurrent debits overdraw → `append` is not conditional. It must fail when another entry took the version (a unique `(account_id, version)` constraint does this).
- Frequent `conflict` errors → one account is written by many workers at once. Batch usage, or reserve once per job instead of debiting per item.
- Users keep paid features after canceling → the `Account` passed in is stale. Sync status from your billing webhooks.

## Limits

This module does not create subscriptions, process payments, compute tax or refunds, or sync provider state. Very long ledgers should be snapshotted in your store. Pricing, refunds and consuming-application acceptance remain project responsibilities.
