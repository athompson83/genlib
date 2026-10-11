// SPDX-License-Identifier: Apache-2.0
// Plan entitlements: which features an account has and how much of each limited resource it may use.
// Decisions come from the account's plan plus per-account overrides, and subscription status decides which
// plan applies (canceled or unpaid accounts fall back to a free plan after an optional grace period).
// Enforce on the server for every request; client-side checks only shape the UI.

export interface PlanDefinition {
  readonly features: Readonly<Record<string, boolean>>;
  /** Maximum counts (seats, projects, API keys ...). Omitted means 0; use Infinity for unlimited. */
  readonly limits: Readonly<Record<string, number>>;
}

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid";

export interface Account {
  readonly accountId: string;
  readonly plan: string;
  readonly status: SubscriptionStatus;
  /** When past_due started (ms); grace is measured from here. */
  readonly pastDueSince?: number;
  /** Per-account exceptions negotiated outside the plan. */
  readonly overrides?: Partial<PlanDefinition>;
}

export interface EntitlementOptions {
  readonly plans: Readonly<Record<string, PlanDefinition>>;
  /** Plan used for canceled/unpaid accounts and past_due accounts after grace. */
  readonly fallbackPlan: string;
  /** How long past_due keeps the paid plan. Default 7 days. */
  readonly graceMs?: number;
  readonly now?: () => number;
}

export type Decision = { allowed: true; plan: string } | { allowed: false; plan: string; reason: "not-in-plan" | "limit-reached" | "unknown-plan" };

const KEY = /^[a-z][a-z0-9_.-]{0,63}$/;

function validatePlan(name: string, plan: PlanDefinition): void {
  if (!KEY.test(name)) throw new RangeError(`Invalid plan name: ${name}`);
  for (const key of Object.keys(plan.features)) if (!KEY.test(key)) throw new RangeError(`Invalid feature key: ${key}`);
  for (const [key, value] of Object.entries(plan.limits)) {
    if (!KEY.test(key)) throw new RangeError(`Invalid limit key: ${key}`);
    if (!(value === Infinity || (Number.isSafeInteger(value) && value >= 0))) throw new RangeError(`Limit ${key} must be a non-negative integer or Infinity`);
  }
}

export function createEntitlements(options: EntitlementOptions) {
  for (const [name, plan] of Object.entries(options.plans)) validatePlan(name, plan);
  if (!options.plans[options.fallbackPlan]) throw new RangeError("fallbackPlan must be one of the plans");
  const graceMs = options.graceMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now;

  /** The plan that currently applies, after subscription status and grace. */
  function effectivePlan(account: Account): string {
    if (account.status === "active" || account.status === "trialing") return account.plan;
    if (account.status === "past_due" && account.pastDueSince !== undefined && now() - account.pastDueSince < graceMs) return account.plan;
    return options.fallbackPlan;
  }

  function resolved(account: Account): { name: string; plan: PlanDefinition | undefined } {
    const name = effectivePlan(account);
    const base = options.plans[name];
    if (!base) return { name, plan: undefined };
    // Overrides apply only while the account's own plan applies; a fallback plan is never upgraded by them.
    const overrides = name === account.plan ? account.overrides : undefined;
    return { name, plan: { features: { ...base.features, ...overrides?.features }, limits: { ...base.limits, ...overrides?.limits } } };
  }

  return {
    effectivePlan,

    /** Is this feature on for the account right now? */
    check(account: Account, feature: string): Decision {
      const { name, plan } = resolved(account);
      if (!plan) return { allowed: false, plan: name, reason: "unknown-plan" };
      return plan.features[feature] === true ? { allowed: true, plan: name } : { allowed: false, plan: name, reason: "not-in-plan" };
    },

    /** The limit for a counted resource (0 when the plan does not mention it). */
    limit(account: Account, key: string): number {
      return resolved(account).plan?.limits[key] ?? 0;
    },

    /**
     * May the account go from `current` to `current + add` of a counted resource? Count `current` from your own
     * data inside the same transaction that creates the resource, or two concurrent requests can both pass.
     */
    canUse(account: Account, key: string, current: number, add = 1): Decision {
      if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(add) || add < 1) throw new RangeError("current must be >= 0 and add >= 1");
      const { name, plan } = resolved(account);
      if (!plan) return { allowed: false, plan: name, reason: "unknown-plan" };
      return current + add <= (plan.limits[key] ?? 0) ? { allowed: true, plan: name } : { allowed: false, plan: name, reason: "limit-reached" };
    },
  };
}

export type Entitlements = ReturnType<typeof createEntitlements>;
