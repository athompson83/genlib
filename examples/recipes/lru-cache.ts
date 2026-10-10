// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: in-process LRU cache with optional TTL and in-flight load de-duplication. Original source; copy and adapt.
// Per-process only: not shared across servers or serverless instances. Never cache one
// user's authorized data under a key that another user can request.

export interface LruOptions {
  maxEntries: number;
  /** Default time-to-live in milliseconds; omit for no expiry. */
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  onEvict?: (key: unknown, reason: "capacity" | "expired" | "deleted") => void;
}

interface Entry<V> { value: V; expiresAt: number }

export class LruCache<K, V> {
  readonly #map = new Map<K, Entry<V>>();
  readonly #inflight = new Map<K, Promise<V>>();
  readonly #options: LruOptions;
  readonly #now: () => number;

  constructor(options: LruOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) throw new RangeError("maxEntries must be a positive integer");
    if (options.ttlMs !== undefined && !(options.ttlMs > 0)) throw new RangeError("ttlMs must be > 0");
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  get size(): number { return this.#map.size; }

  #live(key: K): Entry<V> | undefined {
    const entry = this.#map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#map.delete(key);
      this.#options.onEvict?.(key, "expired");
      return undefined;
    }
    return entry;
  }

  /** Returns the value and marks it most recently used. */
  get(key: K): V | undefined {
    const entry = this.#live(key);
    if (!entry) return undefined;
    this.#map.delete(key);
    this.#map.set(key, entry);
    return entry.value;
  }

  /** Reads without changing recency. */
  peek(key: K): V | undefined { return this.#live(key)?.value; }
  has(key: K): boolean { return this.#live(key) !== undefined; }

  set(key: K, value: V, ttlMs: number | undefined = this.#options.ttlMs): this {
    if (ttlMs !== undefined && !(ttlMs > 0)) throw new RangeError("ttlMs must be > 0");
    this.#map.delete(key);
    this.#map.set(key, { value, expiresAt: ttlMs === undefined ? Infinity : this.#now() + ttlMs });
    while (this.#map.size > this.#options.maxEntries) {
      const oldest = this.#map.keys().next();
      if (oldest.done) break;
      this.#map.delete(oldest.value);
      this.#options.onEvict?.(oldest.value, "capacity");
    }
    return this;
  }

  delete(key: K): boolean {
    const existed = this.#map.delete(key);
    if (existed) this.#options.onEvict?.(key, "deleted");
    return existed;
  }

  clear(): void { this.#map.clear(); }

  /** Returns a cached value or runs `load` once per key even under concurrent callers. Failures are not cached. */
  async getOrLoad(key: K, load: () => Promise<V>, ttlMs?: number): Promise<V> {
    const hit = this.#live(key);
    if (hit) return this.get(key) as V;
    const pending = this.#inflight.get(key);
    if (pending) return pending;
    const promise = load().then(
      (value) => { this.#inflight.delete(key); this.set(key, value, ttlMs ?? this.#options.ttlMs); return value; },
      (error: unknown) => { this.#inflight.delete(key); throw error; },
    );
    this.#inflight.set(key, promise);
    return promise;
  }
}
