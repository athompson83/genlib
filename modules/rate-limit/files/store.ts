// SPDX-License-Identifier: Apache-2.0
// Storage contract for rate-limit state plus a bounded in-memory implementation.

/** What an update function returns: the state to persist and the value handed back to the caller. */
export interface StoreUpdate<S, R> {
  /** New state, or undefined to delete the key. Must be JSON-serializable for shared stores. */
  next: S | undefined;
  /** Milliseconds the state stays meaningful; the store may drop it afterwards. >= 1. */
  ttlMs: number;
  /** Returned from update() unchanged. */
  result: R;
}

/**
 * Asynchronous key/value store for limiter state.
 *
 * Atomicity contract: `update` must behave as one atomic read-modify-write per key. Two
 * concurrent updates of the same key must never both observe the same prior state and both
 * commit. `fn` is synchronous and pure (it reads only its argument), so a shared store may
 * implement this with optimistic concurrency (for example Redis WATCH/MULTI or a
 * compare-and-set loop) and call `fn` more than once, committing exactly one result.
 * Expired state must be presented to `fn` as undefined.
 */
export interface RateLimitStore {
  update<S, R>(key: string, fn: (current: S | undefined) => StoreUpdate<S, R>): Promise<R>;
}

export interface MemoryStoreOptions {
  /** Maximum tracked keys; the least recently used key is evicted beyond this. 1–1000000. Default 10000. */
  maxKeys?: number;
  /** Injected for deterministic tests; use the same clock as the limiter. Default Date.now. */
  clock?: () => number;
}

export interface MemoryStore extends RateLimitStore {
  /** Number of keys currently held (expired keys may linger until touched or evicted). */
  size(): number;
  delete(key: string): void;
  clear(): void;
}

interface Entry { value: unknown; expiresAt: number }

/**
 * Single-process store. State lives in this JavaScript heap only: it is not shared between
 * processes, isolates, serverless instances, or regions, and it resets on restart.
 * Atomic because `fn` runs synchronously on one thread with no await between read and write.
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const maxKeys = options.maxKeys ?? 10_000;
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1 || maxKeys > 1_000_000) {
    throw new RangeError("maxKeys must be an integer 1–1000000.");
  }
  const clock = options.clock ?? Date.now;
  const entries = new Map<string, Entry>();

  return {
    async update<S, R>(key: string, fn: (current: S | undefined) => StoreUpdate<S, R>): Promise<R> {
      const now = clock();
      const existing = entries.get(key);
      const current = existing && existing.expiresAt > now ? existing.value as S : undefined;
      const { next, ttlMs, result } = fn(current);
      entries.delete(key);
      if (next !== undefined) {
        if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new RangeError("ttlMs must be >= 1.");
        entries.set(key, { value: next, expiresAt: now + ttlMs });
        while (entries.size > maxKeys) {
          const oldest = entries.keys().next();
          if (oldest.done) break;
          entries.delete(oldest.value);
        }
      }
      return result;
    },
    size: () => entries.size,
    delete: key => { entries.delete(key); },
    clear: () => { entries.clear(); },
  };
}
