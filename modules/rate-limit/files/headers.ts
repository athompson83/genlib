// SPDX-License-Identifier: Apache-2.0
// Fetch-standard helpers that expose a rate-limit decision to HTTP clients.
import type { RateLimitResult } from "./limiter.js";

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/**
 * Sets RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset (delta seconds), plus
 * Retry-After (delta seconds, at least 1) when the request was denied. Returns `headers`.
 */
export function applyRateLimitHeaders(headers: Headers, result: RateLimitResult): Headers {
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(Math.max(0, result.remaining)));
  headers.set("RateLimit-Reset", String(seconds(result.resetAfterMs)));
  if (!result.allowed) headers.set("Retry-After", String(Math.max(1, seconds(result.retryAfterMs))));
  return headers;
}

export interface RateLimitResponseOptions {
  /** Response body. Default: a JSON error object without any request data. */
  body?: BodyInit | null;
  /** Additional headers (for example CORS). Rate-limit headers take precedence. */
  headers?: HeadersInit;
}

/** Builds a 429 Too Many Requests response for a denied decision. */
export function rateLimitResponse(result: RateLimitResult, options: RateLimitResponseOptions = {}): Response {
  const headers = new Headers(options.headers);
  const body = options.body !== undefined ? options.body : JSON.stringify({ error: "rate_limited" });
  if (options.body === undefined) headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  applyRateLimitHeaders(headers, { ...result, allowed: false });
  return new Response(body, { status: 429, headers });
}
