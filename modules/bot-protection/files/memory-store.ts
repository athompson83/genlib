// SPDX-License-Identifier: Apache-2.0
// Replay store for single-use proof-of-work challenges. Implement ReplayStore on Redis (SET NX PX), a
// database unique key or a Durable Object for more than one server process.

export interface ReplayStore {
  /**
   * Record `id` as used until `expiresAt` (epoch milliseconds). Return true the first time an id is
   * consumed and false if it was already seen (or the store refuses to record it). Must be atomic.
   */
  consume(id: string, expiresAt: number): Promise<boolean>;
}

export interface MemoryReplayStoreOptions {
  /** Clock in epoch milliseconds. Default Date.now. */
  readonly now?: () => number;
  /** Most ids held at once. When full after pruning expired ids, consume fails closed. Default 100,000. */
  readonly maxEntries?: number;
}

/** In-process replay store for tests, prototypes and single-instance servers. Not shared between processes. */
export class MemoryReplayStore implements ReplayStore {
  readonly #seen = new Map<string, number>();
  readonly #now: () => number;
  readonly #max: number;

  constructor(options: MemoryReplayStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#max = options.maxEntries ?? 100_000;
    if (!Number.isSafeInteger(this.#max) || this.#max < 1) throw new TypeError("maxEntries must be a positive integer");
  }

  get size(): number { return this.#seen.size; }

  async consume(id: string, expiresAt: number): Promise<boolean> {
    const now = this.#now();
    const existing = this.#seen.get(id);
    if (existing !== undefined && existing > now) return false;
    if (expiresAt <= now) return false;
    if (existing === undefined && this.#seen.size >= this.#max) {
      this.prune();
      if (this.#seen.size >= this.#max) return false;
    }
    this.#seen.set(id, expiresAt);
    return true;
  }

  /** Drop ids whose expiry has passed. Called automatically when the store is full. */
  prune(): void {
    const now = this.#now();
    for (const [id, expiresAt] of this.#seen) if (expiresAt <= now) this.#seen.delete(id);
  }
}
