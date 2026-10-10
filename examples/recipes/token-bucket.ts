// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: pure token-bucket rate limiter with an injected clock and integer millitokens. Original source; copy and adapt.
// State is a plain value you store per key (memory, Redis hash, database row); take() returns the
// next state. Integer math avoids float drift. A clock that goes backwards refills nothing. For a
// shared limit across servers, apply take() atomically in the store (a transaction or script).

export interface BucketState { readonly tokensMilli: number; readonly lastMs: number }
export interface TakeResult { readonly allowed: boolean; readonly state: BucketState; readonly retryAfterMs: number }

function positiveInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
}

function checkClock(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs)) throw new RangeError("nowMs must be an integer of milliseconds");
}

function capacityMilli(capacity: number): number {
  positiveInt(capacity, "capacity");
  const milli = capacity * 1000;
  if (!Number.isSafeInteger(milli)) throw new RangeError("capacity is too large");
  return milli;
}

/** A full bucket at nowMs. */
export function newBucket(capacity: number, nowMs: number): BucketState {
  checkClock(nowMs);
  return { tokensMilli: capacityMilli(capacity), lastMs: nowMs };
}

/**
 * Refills by (nowMs - lastMs) * ratePerSecond millitokens (capped at capacity), then takes `cost`
 * tokens if available. When denied the state is unchanged apart from the refill and
 * retryAfterMs is the wait until enough tokens accrue.
 */
export function take(state: BucketState, nowMs: number, cost: number, capacity: number, ratePerSecond: number): TakeResult {
  checkClock(nowMs);
  const cap = capacityMilli(capacity);
  positiveInt(ratePerSecond, "ratePerSecond");
  positiveInt(cost, "cost");
  if (cost > capacity) throw new RangeError("cost exceeds capacity and could never be allowed");
  const { tokensMilli, lastMs } = state;
  if (!Number.isSafeInteger(tokensMilli) || tokensMilli < 0 || tokensMilli > cap) throw new RangeError("state.tokensMilli is out of range");
  checkClock(lastMs);
  let tokens = tokensMilli;
  let last = lastMs;
  if (nowMs > lastMs) {
    const elapsed = nowMs - lastMs;
    const room = cap - tokens;
    tokens = elapsed >= Math.ceil(room / ratePerSecond) ? cap : tokens + elapsed * ratePerSecond;
    last = nowMs;
  }
  const need = cost * 1000;
  if (tokens >= need) return { allowed: true, state: { tokensMilli: tokens - need, lastMs: last }, retryAfterMs: 0 };
  return { allowed: false, state: { tokensMilli: tokens, lastMs: last }, retryAfterMs: Math.ceil((need - tokens) / ratePerSecond) };
}
