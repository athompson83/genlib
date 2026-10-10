// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Result type plus mapping unknown errors to safe, typed application errors. Original source; copy and adapt.

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const map = <T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> => (r.ok ? ok(fn(r.value)) : r);
export const mapErr = <T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> => (r.ok ? r : err(fn(r.error)));
export const andThen = <T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> => (r.ok ? fn(r.value) : r);
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error("Result was an error", { cause: r.error });
}

/** Collects ok values, or returns the first error. */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) { if (!r.ok) return r; values.push(r.value); }
  return ok(values);
}

export type ErrorCode = "bad_request" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "timeout" | "aborted" | "network" | "unavailable" | "internal";

export interface AppError {
  code: ErrorCode;
  /** Safe to show to end users. */
  message: string;
  status: number;
  /** Whether repeating the same request could succeed. Repeating writes still needs idempotency keys. */
  retryable: boolean;
  /** Original error for server logs only; never serialize to clients. */
  cause?: unknown;
}

const DEFAULTS: Record<ErrorCode, { status: number; retryable: boolean; message: string }> = {
  bad_request: { status: 400, retryable: false, message: "The request was invalid." },
  unauthenticated: { status: 401, retryable: false, message: "Please sign in again." },
  forbidden: { status: 403, retryable: false, message: "You do not have access to this." },
  not_found: { status: 404, retryable: false, message: "We could not find that." },
  conflict: { status: 409, retryable: false, message: "This changed since you loaded it." },
  rate_limited: { status: 429, retryable: true, message: "Too many requests. Try again shortly." },
  timeout: { status: 504, retryable: true, message: "The request timed out." },
  aborted: { status: 499, retryable: false, message: "The request was cancelled." },
  network: { status: 503, retryable: true, message: "A network problem occurred." },
  unavailable: { status: 503, retryable: true, message: "The service is temporarily unavailable." },
  internal: { status: 500, retryable: false, message: "Something went wrong." },
};

export function appError(code: ErrorCode, message?: string, cause?: unknown): AppError {
  const d = DEFAULTS[code];
  return { code, status: d.status, retryable: d.retryable, message: message ?? d.message, ...(cause === undefined ? {} : { cause }) };
}

export function codeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "bad_request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404 || status === 410) return "not_found";
  if (status === 409 || status === 412) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status === 502 || status === 503) return "unavailable";
  return status >= 400 && status < 500 ? "bad_request" : "internal";
}

function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && typeof (value as AppError).code === "string" && (value as AppError).code in DEFAULTS
    && typeof (value as AppError).status === "number" && typeof (value as AppError).message === "string";
}

/** Maps anything thrown to an AppError without leaking internal messages. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === "AbortError") return appError("aborted", undefined, error);
    if (error.name === "TimeoutError") return appError("timeout", undefined, error);
    if (error.name === "TypeError" && /fetch|network/i.test(error.message)) return appError("network", undefined, error);
  }
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  if (typeof status === "number" && status >= 400 && status <= 599) return appError(codeForStatus(status), undefined, error);
  return appError("internal", undefined, error);
}

/** Runs a sync or async function and captures failures as an AppError result. */
export async function attempt<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try { return ok(await fn()); } catch (error) { return err(toAppError(error)); }
}

/** JSON-safe body for API responses: no cause, no stack. */
export const toPublicError = (e: AppError) => ({ error: { code: e.code, message: e.message, retryable: e.retryable } });
