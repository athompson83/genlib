// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: idempotency-key store interface, in-memory implementation and handler wrapper. Original source; copy and adapt.
// Makes a client's repeated POST (double click, network retry) execute once. This recipe
// never retries anything itself. The memory store is per-process: production needs a shared
// store with an atomic "insert if absent" (unique index, Redis SET NX) and the same states.
// Scope keys per user/tenant and route so one caller cannot replay another caller's result.

export type BeginResult<R> =
  | { state: "started" }
  | { state: "in-progress" }
  | { state: "completed"; response: R }
  | { state: "mismatch" }; // same key, different request body

export interface IdempotencyStore<R> {
  /** Atomically claims `key`, or reports what already happened under it. */
  begin(key: string, fingerprint: string): Promise<BeginResult<R>>;
  complete(key: string, response: R): Promise<void>;
  /** Releases a claim so the client may try again (use only when no effect happened). */
  release(key: string): Promise<void>;
}

interface Record_<R> { fingerprint: string; status: "in-progress" | "completed"; response?: R; expiresAt: number }

export class MemoryIdempotencyStore<R> implements IdempotencyStore<R> {
  readonly #records = new Map<string, Record_<R>>();
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.#now = options.now ?? Date.now;
  }

  async begin(key: string, fingerprint: string): Promise<BeginResult<R>> {
    if (!/^[\x21-\x7e]{8,255}$/.test(key)) throw new RangeError("Idempotency key must be 8-255 visible ASCII characters");
    const now = this.#now();
    const existing = this.#records.get(key);
    if (existing && existing.expiresAt > now) {
      if (existing.fingerprint !== fingerprint) return { state: "mismatch" };
      return existing.status === "completed" ? { state: "completed", response: existing.response as R } : { state: "in-progress" };
    }
    this.#records.set(key, { fingerprint, status: "in-progress", expiresAt: now + this.#ttlMs });
    return { state: "started" };
  }

  async complete(key: string, response: R): Promise<void> {
    const record = this.#records.get(key);
    if (!record) throw new Error("Unknown idempotency key");
    record.status = "completed";
    record.response = response;
    record.expiresAt = this.#now() + this.#ttlMs;
  }

  async release(key: string): Promise<void> {
    if (this.#records.get(key)?.status === "in-progress") this.#records.delete(key);
  }
}

export class IdempotencyConflict extends Error {
  constructor(readonly reason: "in-progress" | "mismatch") {
    super(reason === "in-progress" ? "A request with this idempotency key is still running" : "Idempotency key reused with a different request");
    this.name = "IdempotencyConflict"; // map to HTTP 409 (in-progress) or 422 (mismatch)
  }
}

/**
 * Runs `handler` once per key and replays its stored response afterwards.
 * If the handler throws, the claim is released only when `releaseOnError(error)` says no
 * external effect can have happened (default: always). For payments or emails whose effect
 * is uncertain after a failure, return false and reconcile with the provider instead.
 */
export async function withIdempotency<R>(
  store: IdempotencyStore<R>, key: string, fingerprint: string, handler: () => Promise<R>,
  options: { releaseOnError?: (error: unknown) => boolean } = {},
): Promise<{ response: R; replayed: boolean }> {
  const claim = await store.begin(key, fingerprint);
  if (claim.state === "completed") return { response: claim.response, replayed: true };
  if (claim.state !== "started") throw new IdempotencyConflict(claim.state);
  let response: R;
  try {
    response = await handler();
  } catch (error) {
    if (options.releaseOnError?.(error) ?? true) await store.release(key);
    throw error;
  }
  await store.complete(key, response);
  return { response, replayed: false };
}
