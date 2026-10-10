// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: deterministic feature-flag evaluation with a kill switch, deny/allow lists, percentage
// rollout and weighted variants. Original source; copy and adapt. The same flag and user id always give
// the same answer, and raising rolloutPercent only adds users (a user's bucket never changes). Buckets use
// FNV-1a 32 over UTF-8, so every Genlib language agrees. Flags are not authorization: enforce permissions
// separately. Invalid flags throw RangeError.

export interface FlagVariant { name: string; weight: number }
export interface Flag {
  key: string;              // [A-Za-z0-9._-]{1,100}
  enabled?: boolean;        // default true (false = kill switch)
  allow?: string[];
  deny?: string[];
  rolloutPercent?: number;  // 0..100, at most 2 decimals, default 100
  variants?: FlagVariant[]; // positive integer weights
}
export type FlagReason = "disabled" | "deny" | "allow" | "rollout" | "excluded";
export interface FlagResult { on: boolean; reason: FlagReason; bucket: number; variant: string | null }

const KEY = /^[A-Za-z0-9._-]{1,100}$/;

function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

function validate(flag: Flag): number {
  if (typeof flag.key !== "string" || !KEY.test(flag.key)) throw new RangeError("flag key must match [A-Za-z0-9._-]{1,100}");
  const pct = flag.rolloutPercent ?? 100;
  if (typeof pct !== "number" || !(pct >= 0 && pct <= 100) || Math.round(pct * 100) !== pct * 100) {
    throw new RangeError("rolloutPercent must be 0..100 with at most 2 decimals");
  }
  for (const v of flag.variants ?? []) {
    if (typeof v.name !== "string" || v.name === "" || !Number.isInteger(v.weight) || v.weight < 1) {
      throw new RangeError("variants need a non-empty name and a positive integer weight");
    }
  }
  return Math.round(pct * 100);
}

function pickVariant(flag: Flag, userId: string): string | null {
  const variants = flag.variants ?? [];
  if (variants.length === 0) return null;
  let x = fnv1a32(`${flag.key}:variant:${userId}`) % variants.reduce((sum, v) => sum + v.weight, 0);
  for (const v of variants) {
    if (x < v.weight) return v.name;
    x -= v.weight;
  }
  return null;
}

/** Evaluates in order: disabled, deny, allow, rollout bucket, excluded. bucket is always reported. */
export function evaluateFlag(flag: Flag, userId: string): FlagResult {
  const threshold = validate(flag);
  const bucket = fnv1a32(`${flag.key}:${userId}`) % 10000;
  const result = (on: boolean, reason: FlagReason): FlagResult => ({ on, reason, bucket, variant: on ? pickVariant(flag, userId) : null });
  if (flag.enabled === false) return result(false, "disabled");
  if ((flag.deny ?? []).includes(userId)) return result(false, "deny");
  if ((flag.allow ?? []).includes(userId)) return result(true, "allow");
  if (bucket < threshold) return result(true, "rollout");
  return result(false, "excluded");
}
