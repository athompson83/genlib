// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: deterministic percentage rollouts and weighted variants. Original source; copy and adapt.
// Uses FNV-1a (fast, stable, NOT cryptographic). The same subject always lands in the same
// bucket for a flag; raising the percentage only adds subjects. Flags are UX/release
// controls, never authorization: enforce permissions separately on the server.

export interface RolloutFlag {
  key: string;
  /** Global kill switch. False turns the flag off for everyone, including allow-listed subjects. */
  enabled: boolean;
  /** 0-100; up to two decimals (basis-point resolution). */
  percentage: number;
  /** Change to reshuffle who is included without renaming the flag. */
  salt?: string;
  allow?: readonly string[];
  deny?: readonly string[];
}

export interface Variant<N extends string = string> { name: N; weight: number }

/** 32-bit FNV-1a over UTF-8 bytes. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Stable bucket 0..9999 for a subject under a flag. */
export function bucketOf(flagKey: string, subjectId: string, salt = ""): number {
  if (!flagKey || !subjectId) throw new RangeError("flagKey and subjectId are required");
  return fnv1a32(`${salt}:${flagKey}:${subjectId}`) % 10_000;
}

function basisPoints(percentage: number): number {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new RangeError("percentage must be 0-100");
  return Math.round(percentage * 100);
}

export type FlagReason = "disabled" | "denied" | "allowed" | "in-rollout" | "out-of-rollout";

/** Evaluates a flag and says why, for logs and support tooling. */
export function evaluateFlag(flag: RolloutFlag, subjectId: string): { on: boolean; reason: FlagReason; bucket?: number } {
  if (!flag.enabled) return { on: false, reason: "disabled" };
  if (flag.deny?.includes(subjectId)) return { on: false, reason: "denied" };
  if (flag.allow?.includes(subjectId)) return { on: true, reason: "allowed" };
  const bucket = bucketOf(flag.key, subjectId, flag.salt);
  const on = bucket < basisPoints(flag.percentage);
  return { on, reason: on ? "in-rollout" : "out-of-rollout", bucket };
}

export const isEnabled = (flag: RolloutFlag, subjectId: string): boolean => evaluateFlag(flag, subjectId).on;

/**
 * Assigns a weighted variant (A/B test arm). Weights are non-negative integers.
 * Changing weights moves some subjects between arms; freeze weights while an experiment runs.
 */
export function chooseVariant<N extends string>(experimentKey: string, subjectId: string, variants: readonly Variant<N>[], salt = ""): N {
  const total = variants.reduce((sum, v) => {
    if (!Number.isSafeInteger(v.weight) || v.weight < 0) throw new RangeError("Variant weights must be non-negative integers");
    return sum + v.weight;
  }, 0);
  if (total <= 0) throw new RangeError("At least one variant needs a positive weight");
  const point = fnv1a32(`${salt}:${experimentKey}:variant:${subjectId}`) % total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (point < acc) return v.name;
  }
  throw new Error("unreachable");
}
