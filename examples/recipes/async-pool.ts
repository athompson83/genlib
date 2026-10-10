// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: bounded-concurrency async map with AbortSignal support. Original source; copy and adapt.
// This recipe never retries. Work functions must honour `signal` to stop real I/O (pass it to fetch).

export type Worker<T, R> = (item: T, index: number, signal: AbortSignal) => Promise<R>;
export interface PoolOptions { concurrency: number; signal?: AbortSignal }

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function validate(concurrency: number): void {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("concurrency must be a positive integer");
}

/**
 * Maps items with at most `concurrency` workers in flight and returns results in input order.
 * The first failure (or an external abort) aborts the shared signal, starts no new items,
 * and rejects with that error once in-flight workers have settled.
 */
export async function mapPool<T, R>(items: Iterable<T>, worker: Worker<T, R>, options: PoolOptions): Promise<R[]> {
  validate(options.concurrency);
  const list = Array.from(items);
  const results = new Array<R>(list.length);
  const controller = new AbortController();
  const external = options.signal;
  const onAbort = () => controller.abort(external ? abortReason(external) : undefined);
  if (external?.aborted) throw abortReason(external);
  external?.addEventListener("abort", onAbort, { once: true });
  let next = 0;
  let failure: { error: unknown } | undefined;

  const run = async () => {
    while (!controller.signal.aborted && next < list.length) {
      const index = next++;
      try {
        results[index] = await worker(list[index] as T, index, controller.signal);
      } catch (error) {
        if (!failure) failure = { error };
        controller.abort(error);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(options.concurrency, list.length) }, run));
  } finally {
    external?.removeEventListener("abort", onAbort);
  }
  if (failure) throw failure.error;
  if (controller.signal.aborted) throw abortReason(controller.signal);
  return results;
}

/** Like mapPool but never short-circuits on failure; returns one settled result per item. */
export async function mapPoolSettled<T, R>(items: Iterable<T>, worker: Worker<T, R>, options: PoolOptions): Promise<PromiseSettledResult<R>[]> {
  validate(options.concurrency);
  const list = Array.from(items);
  const results = new Array<PromiseSettledResult<R>>(list.length);
  const signal = options.signal ?? new AbortController().signal;
  let next = 0;
  const run = async () => {
    while (next < list.length) {
      const index = next++;
      if (signal.aborted) { results[index] = { status: "rejected", reason: abortReason(signal) }; continue; }
      try {
        results[index] = { status: "fulfilled", value: await worker(list[index] as T, index, signal) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, list.length) }, run));
  return results;
}
