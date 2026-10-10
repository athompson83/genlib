// SPDX-License-Identifier: Apache-2.0
// Fetch-standard retry wrapper. Retries only operations that are safe to repeat.
import {
  abortReason, abortableWait, backoffDelay, throwIfAborted, validateAttempts, validateBackoff, withTimeout,
  type BackoffOptions, type SleepFn,
} from "./retry.js";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface FetchRetryOptions extends BackoffOptions {
  /** Total attempts including the first request. 1–20. Default 3. */
  attempts?: number;
  /** Optional per-attempt deadline in milliseconds; a timed-out attempt counts as retryable. */
  attemptTimeoutMs?: number;
  /** Overall cancellation. Defaults to init.signal. Never retried. */
  signal?: AbortSignal | undefined;
  sleep?: SleepFn;
  /** Clock used to interpret HTTP-date Retry-After values. Default Date.now. */
  now?: () => number;
}

export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Parses Retry-After as delta-seconds or an HTTP date. Returns milliseconds (>= 0),
 * or undefined when absent or malformed.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > 64) return undefined;
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) ? seconds * 1000 : undefined;
  }
  if (!/^[A-Za-z]{3,9},? /.test(text)) return undefined;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** True when this request may be repeated: an idempotent method or an Idempotency-Key header. */
export function isRetryableRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const request = input instanceof Request ? input : undefined;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (IDEMPOTENT_METHODS.has(method)) return true;
  // When init.headers is present Fetch uses it instead of the Request's headers.
  const key = new Headers(init?.headers ?? request?.headers).get("idempotency-key");
  return typeof key === "string" && key.trim().length > 0;
}

function isNetworkError(error: unknown): boolean {
  // Fetch reports network failures as TypeError; per-attempt deadlines abort with TimeoutError.
  return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")
    || (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError");
}

async function discard(response: Response): Promise<void> {
  try {
    if (response.body && !response.bodyUsed) await response.body.cancel();
  } catch {
    // The body is being thrown away; cancellation failure does not change the retry decision.
  }
}

/**
 * Sends `fetch(input, init)` and retries network errors and 408/425/429/500/502/503/504
 * responses for idempotent methods or requests carrying an Idempotency-Key header. Other
 * requests, and requests whose body is a one-shot stream, are sent exactly once.
 * The last response is returned as-is (including a retryable status) once attempts run out.
 */
export async function fetchWithRetry(
  fetch: FetchLike,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: FetchRetryOptions,
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  validateAttempts(attempts);
  validateBackoff(options);
  const signal = options.signal ?? init?.signal ?? undefined;
  const now = options.now ?? Date.now;
  const streamBody = typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream;
  const replayable = !streamBody && isRetryableRequest(input, init);
  const maxAttempts = replayable ? attempts : 1;

  const send = (attemptSignal: AbortSignal | undefined): Promise<Response> => {
    // A Request body can only be read once; clone the untouched original for each attempt.
    const target = input instanceof Request ? input.clone() : input;
    const attemptInit: RequestInit = { ...init };
    if (attemptSignal) attemptInit.signal = attemptSignal;
    return fetch(target, attemptInit);
  };

  for (let attempt = 1; ; attempt += 1) {
    throwIfAborted(signal);
    let response: Response;
    try {
      response = options.attemptTimeoutMs === undefined
        ? await send(signal)
        : await withTimeout(attemptSignal => send(attemptSignal), options.attemptTimeoutMs, signal);
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (attempt >= maxAttempts || !isNetworkError(error)) throw error;
      await abortableWait(backoffDelay(attempt, options), signal, options.sleep);
      continue;
    }
    if (attempt >= maxAttempts || !RETRYABLE_STATUSES.has(response.status)) return response;
    const hinted = parseRetryAfter(response.headers.get("retry-after"), now());
    const delay = hinted === undefined ? backoffDelay(attempt, options) : Math.min(hinted, options.maxDelayMs);
    await discard(response);
    await abortableWait(delay, signal, options.sleep);
  }
}
