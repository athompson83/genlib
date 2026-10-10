// SPDX-License-Identifier: Apache-2.0
// Runtime-neutral retry and timeout helpers. No timers run at import time.

export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;
export type RandomFn = () => number;
export type RetryDecision = boolean | { delayMs: number };

export interface BackoffOptions {
  /** Delay before the first retry, in milliseconds. 0–3600000. */
  baseDelayMs: number;
  /** Upper bound for any single wait, in milliseconds. 0–3600000 and >= baseDelayMs. */
  maxDelayMs: number;
  /** "full" (default) waits a uniform random time in [0, cap); "none" waits exactly cap. */
  jitter?: "full" | "none";
  /** Injected for deterministic tests. Must return a number in [0, 1). */
  random?: RandomFn;
}

export interface RetryOptions extends BackoffOptions {
  /** Total attempts including the first call. 1–20. */
  attempts: number;
  /**
   * Decide whether a failure is retried. Return a `{ delayMs }` object to override the
   * backoff delay (still capped by maxDelayMs). Defaults to retrying every error.
   * Aborts of `signal` are never retried, whatever this returns.
   */
  shouldRetry?: (error: unknown, attempt: number) => RetryDecision | Promise<RetryDecision>;
  /** Cancels the current wait and prevents further attempts. */
  signal?: AbortSignal | undefined;
  /** Injected for deterministic tests. Defaults to a setTimeout-based abortable sleep. */
  sleep?: SleepFn;
}

const MAX_DELAY = 3_600_000;

function invalid(message: string): never {
  throw new RangeError(message);
}

export function validateBackoff(options: BackoffOptions): void {
  const { baseDelayMs, maxDelayMs, jitter } = options;
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0 || baseDelayMs > MAX_DELAY) invalid("baseDelayMs must be 0–3600000.");
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs || maxDelayMs > MAX_DELAY) invalid("maxDelayMs must be >= baseDelayMs and <= 3600000.");
  if (jitter !== undefined && jitter !== "full" && jitter !== "none") invalid("jitter must be \"full\" or \"none\".");
}

export function validateAttempts(attempts: number): void {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 20) invalid("attempts must be an integer 1–20.");
}

/** Delay before retry number `retry` (1 = the wait after the first failed attempt). */
export function backoffDelay(retry: number, options: BackoffOptions): number {
  const exponent = Math.min(Math.max(retry - 1, 0), 52);
  const cap = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** exponent);
  if (options.jitter === "none") return cap;
  const sample = (options.random ?? Math.random)();
  const unit = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON) : 0;
  return Math.floor(unit * cap);
}

export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

/** setTimeout-based sleep that rejects with the signal's reason when aborted. */
export const defaultSleep: SleepFn = (ms, signal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(abortReason(signal)); return; }
  const onAbort = () => { clearTimeout(timer); reject(abortReason(signal!)); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});

/**
 * Waits using the (possibly injected) sleep, but always settles as soon as `signal` aborts,
 * even if an injected sleep ignores its signal argument.
 */
export function abortableWait(ms: number, signal: AbortSignal | undefined, sleep: SleepFn = defaultSleep): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    sleep(ms, signal).then(
      () => { signal.removeEventListener("abort", onAbort); resolve(); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

/**
 * Calls `fn` up to `attempts` times with exponential backoff. The final failure is rethrown
 * unchanged. `fn` receives the 1-based attempt number and the caller signal.
 */
export async function retry<T>(
  fn: (attempt: number, signal: AbortSignal | undefined) => Promise<T> | T,
  options: RetryOptions,
): Promise<T> {
  validateAttempts(options.attempts);
  validateBackoff(options);
  const { signal } = options;
  for (let attempt = 1; ; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await fn(attempt, signal);
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (attempt >= options.attempts) throw error;
      const decision = options.shouldRetry ? await options.shouldRetry(error, attempt) : true;
      if (decision === false) throw error;
      const delay = typeof decision === "object" && Number.isFinite(decision.delayMs)
        ? Math.min(Math.max(decision.delayMs, 0), options.maxDelayMs)
        : backoffDelay(attempt, options);
      await abortableWait(delay, signal, options.sleep);
    }
  }
}

/**
 * Runs `fn` with a signal that aborts after `ms` milliseconds (reason: DOMException
 * "TimeoutError") or when the optional parent `signal` aborts (its reason is kept).
 * Settles promptly on abort even if `fn` ignores its signal; `fn` may keep running.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T> | T,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  if (!Number.isFinite(ms) || ms < 1 || ms > MAX_DELAY) invalid("timeout must be 1–3600000 milliseconds.");
  throwIfAborted(signal);
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(abortReason(signal!));
  signal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortReason(controller.signal));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => fn(controller.signal)), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onParentAbort);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}
