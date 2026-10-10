// SPDX-License-Identifier: Apache-2.0
// Token bucket, fixed window, and sliding window (exact log) rate limiters over a RateLimitStore.
import type { RateLimitStore, StoreUpdate } from "./store.js";

export type RateLimitAlgorithm = "token-bucket" | "fixed-window" | "sliding-window";

export interface RateLimitResult {
  allowed: boolean;
  /** Configured limit (bucket capacity or requests per window). */
  limit: number;
  /** Units still available after this decision. */
  remaining: number;
  /** Epoch milliseconds when the quota is fully restored. */
  resetAt: number;
  /** Milliseconds from the decision until resetAt (>= 0). */
  resetAfterMs: number;
  /** 0 when allowed; otherwise milliseconds until this cost could be allowed. */
  retryAfterMs: number;
}

interface CommonOptions {
  /** Capacity / requests per window. Integer 1–1000000 (sliding-window: 1–10000). */
  limit: number;
  store: RateLimitStore;
  /** Injected for deterministic tests. Default Date.now. */
  clock?: () => number;
  /** Prepended to every key so several limiters can share a store. Default "rl:<algorithm>:". */
  prefix?: string;
}

export type RateLimiterOptions =
  | (CommonOptions & { algorithm: "token-bucket"; refillPerSecond: number })
  | (CommonOptions & { algorithm: "fixed-window" | "sliding-window"; windowMs: number });

export interface RateLimiter {
  /** Consumes `cost` units (default 1) for `key` when allowed. Denied requests consume nothing. */
  consume(key: string, cost?: number): Promise<RateLimitResult>;
}

interface BucketState { tokens: number; at: number }
interface WindowState { start: number; count: number }
type LogState = number[];

function fail(message: string): never {
  throw new RangeError(message);
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, store, algorithm } = options;
  const maxLimit = algorithm === "sliding-window" ? 10_000 : 1_000_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit) fail(`limit must be an integer 1–${maxLimit}.`);
  if (!store || typeof store.update !== "function") fail("store must implement RateLimitStore.");
  const clock = options.clock ?? Date.now;
  const prefix = options.prefix ?? `rl:${algorithm}:`;
  if (typeof prefix !== "string" || prefix.length > 128) fail("prefix must be a string of at most 128 characters.");

  let decide: (now: number, cost: number) => (current: unknown) => StoreUpdate<unknown, RateLimitResult>;

  if (algorithm === "token-bucket") {
    const rate = options.refillPerSecond;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) fail("refillPerSecond must be > 0 and <= 1000000.");
    const perMs = rate / 1000;
    decide = (now, cost) => raw => {
      const state = raw as BucketState | undefined;
      const elapsed = state ? Math.max(0, now - state.at) : 0;
      let tokens = state ? Math.min(limit, state.tokens + elapsed * perMs) : limit;
      const allowed = tokens >= cost;
      if (allowed) tokens -= cost;
      const toFull = Math.ceil((limit - tokens) / perMs);
      const result: RateLimitResult = {
        allowed, limit, remaining: Math.floor(tokens), resetAt: now + toFull, resetAfterMs: toFull,
        retryAfterMs: allowed ? 0 : Math.ceil((cost - tokens) / perMs),
      };
      return { next: toFull > 0 ? { tokens, at: now } : undefined, ttlMs: Math.max(1, toFull), result };
    };
  } else {
    const windowMs = options.windowMs;
    if (!Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 31_536_000_000) fail("windowMs must be an integer 1–31536000000.");
    if (algorithm === "fixed-window") {
      decide = (now, cost) => raw => {
        const start = Math.floor(now / windowMs) * windowMs;
        const state = raw as WindowState | undefined;
        let count = state && state.start === start ? state.count : 0;
        const allowed = count + cost <= limit;
        if (allowed) count += cost;
        const resetAt = start + windowMs;
        const result: RateLimitResult = {
          allowed, limit, remaining: limit - count, resetAt, resetAfterMs: resetAt - now,
          retryAfterMs: allowed ? 0 : resetAt - now,
        };
        return { next: { start, count }, ttlMs: resetAt - now, result };
      };
    } else {
      decide = (now, cost) => raw => {
        const log = ((raw as LogState | undefined) ?? []).filter(at => at > now - windowMs);
        const allowed = log.length + cost <= limit;
        if (allowed) for (let i = 0; i < cost; i += 1) log.push(now);
        const newest = log[log.length - 1];
        const resetAt = newest === undefined ? now : newest + windowMs;
        // The entry whose expiry frees enough room for `cost` more units.
        const freeing = log[log.length + cost - limit - 1];
        const result: RateLimitResult = {
          allowed, limit, remaining: limit - log.length, resetAt, resetAfterMs: resetAt - now,
          retryAfterMs: allowed || freeing === undefined ? 0 : freeing + windowMs - now,
        };
        return { next: log.length > 0 ? log : undefined, ttlMs: Math.max(1, resetAt - now), result };
      };
    }
  }

  return {
    async consume(key: string, cost = 1): Promise<RateLimitResult> {
      if (typeof key !== "string" || key.length === 0 || key.length > 512) fail("key must be a non-empty string of at most 512 characters.");
      if (!Number.isSafeInteger(cost) || cost < 1 || cost > limit) fail("cost must be an integer between 1 and limit.");
      const now = clock();
      return store.update<unknown, RateLimitResult>(prefix + key, decide(now, cost));
    },
  };
}
