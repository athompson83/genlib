// SPDX-License-Identifier: Apache-2.0
// This module intentionally has no environment, filesystem, cookie, or credential discovery.

export type FetchLike = typeof globalThis.fetch;
export type ApiErrorCode =
  | "INVALID_CONFIG" | "INVALID_INPUT" | "AUTHENTICATION" | "DENIED"
  | "ABORTED" | "TIMEOUT" | "NETWORK" | "HTTP" | "REDIRECT"
  | "REQUEST_TOO_LARGE" | "RESPONSE_TOO_LARGE" | "INVALID_RESPONSE";

const messages: Record<ApiErrorCode, string> = {
  INVALID_CONFIG: "API client configuration is invalid.",
  INVALID_INPUT: "API request input is invalid.",
  AUTHENTICATION: "API credential resolution failed.",
  DENIED: "The application did not authorize this operation.",
  ABORTED: "API request was cancelled.",
  TIMEOUT: "API request exceeded its time limit.",
  NETWORK: "API request could not be completed.",
  HTTP: "API provider returned an unsuccessful HTTP status.",
  REDIRECT: "API redirects are not allowed.",
  REQUEST_TOO_LARGE: "API request exceeded its size limit.",
  RESPONSE_TOO_LARGE: "API response exceeded its size limit.",
  INVALID_RESPONSE: "API provider returned an unexpected response.",
};

/** Safe to map to application errors. Never includes URL, body, credentials, or a raw cause. */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | undefined;
  constructor(code: ApiErrorCode, status?: number) {
    const safeCode = Object.hasOwn(messages, code) ? code : "INVALID_CONFIG";
    super(messages[safeCode]);
    this.name = "ApiClientError";
    this.code = safeCode;
    this.status = Number.isInteger(status) && status! >= 100 && status! <= 599 ? status : undefined;
  }
}

export interface TransportOptions {
  /** A trusted Fetch implementation. It must honor redirect:error and the AbortSignal. */
  fetch?: FetchLike;
  /** Total milliseconds including credentials, Fetch, and reading the response. 1–120000. */
  timeoutMs?: number;
  /** Decoded response byte ceiling, not a Content-Length assumption. 1–8388608. */
  maxResponseBytes?: number;
  /** UTF-8 request body byte ceiling. 1–8388608. */
  maxRequestBytes?: number;
}

export interface HttpClientOptions extends TransportOptions {
  /** Trusted HTTPS origin only, without userinfo, path, query, or fragment. */
  origin: string;
  /** Resolve credentials within the operation deadline. Never derive these from request JSON. */
  headers?: HeadersInit | ((signal: AbortSignal) => HeadersInit | Promise<HeadersInit>);
}

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: HeadersInit;
  body?: string;
  signal?: AbortSignal | undefined;
}

export type TokenProvider = (signal: AbortSignal) => string | Promise<string>;

/** Labels are documentation aids; deliberately do not echo inputs or labels into errors. */
export function boundedString(value: unknown, _label: string, maxLength = 1024): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || value.includes("\0")) {
    throw new ApiClientError("INVALID_INPUT");
  }
  return value;
}

export function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ApiClientError("INVALID_INPUT");
  }
  return value;
}

export function pathSegment(value: unknown): string {
  const segment = boundedString(value, "path segment", 1024);
  if (segment === "." || segment === ".." || /[/\\\u0000-\u001f\u007f]/u.test(segment)) {
    throw new ApiClientError("INVALID_INPUT");
  }
  return encodeURIComponent(segment);
}

export function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ApiClientError("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, key: string): string {
  const result = requireRecord(value)[key];
  if (typeof result !== "string") throw new ApiClientError("INVALID_RESPONSE");
  return result;
}

/** Strict header token validation; it does not validate the token's signature or permissions. */
export function credential(value: unknown): string {
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,16384}$/u.test(value)) {
    throw new ApiClientError("AUTHENTICATION");
  }
  return value;
}

export function idempotencyKey(value: unknown): string {
  const key = boundedString(value, "idempotency key", 255);
  if (!/^[A-Za-z0-9._:-]+$/u.test(key)) throw new ApiClientError("INVALID_INPUT");
  return key;
}

function configurationInteger(value: number | undefined, fallback: number, maximum: number): number {
  const actual = value ?? fallback;
  if (!Number.isSafeInteger(actual) || actual < 1 || actual > maximum) throw new ApiClientError("INVALID_CONFIG");
  return actual;
}

function checkedOrigin(value: string): string {
  try {
    const origin = new URL(value);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.origin === "null" || /[\u0000-\u0020\\]/u.test(value)) {
      throw new Error();
    }
    return origin.origin;
  } catch {
    throw new ApiClientError("INVALID_CONFIG");
  }
}

function checkedUrl(origin: string, path: string): URL {
  if (typeof path !== "string" || path.length > 16384 || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/u.test(path)) {
    throw new ApiClientError("INVALID_INPUT");
  }
  try {
    const url = new URL(path, origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.hash) throw new Error();
    // Reject dot segments, including their URL-encoded forms; never normalize them into another route.
    if (path.split("?")[0]!.split("/").some(segment => /^(?:\.|%2e){1,2}$/iu.test(segment))) throw new Error();
    return url;
  } catch {
    throw new ApiClientError("INVALID_INPUT");
  }
}

/**
 * One explicit request, no automatic retries. Generic T is a caller assertion, not runtime
 * validation: provider adapters below validate the fields they return.
 */
export function createHttpClient(options: HttpClientOptions) {
  const origin = checkedOrigin(options.origin);
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new ApiClientError("INVALID_CONFIG");
  const timeoutMs = configurationInteger(options.timeoutMs, 15000, 120000);
  const maxResponseBytes = configurationInteger(options.maxResponseBytes, 1048576, 8388608);
  const maxRequestBytes = configurationInteger(options.maxRequestBytes, 262144, 8388608);
  const resolveHeaders = options.headers;

  async function request<T = unknown>(path: string, requestOptions: HttpRequestOptions = {}): Promise<T> {
    const url = checkedUrl(origin, path);
    // Capture every caller-owned request option before resolving asynchronous credentials.
    // Validation and Fetch must use the same immutable body and copied header values.
    const method = requestOptions.method ?? "GET";
    const body = requestOptions.body;
    const callerSignal = requestOptions.signal;
    let requestHeaders: Headers;
    try { requestHeaders = new Headers(requestOptions.headers); }
    catch { throw new ApiClientError("INVALID_INPUT"); }
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) || (method === "GET" && body !== undefined)) {
      throw new ApiClientError("INVALID_INPUT");
    }
    if (body !== undefined && (typeof body !== "string" || body.length > maxRequestBytes || new TextEncoder().encode(body).byteLength > maxRequestBytes)) {
      throw new ApiClientError("REQUEST_TOO_LARGE");
    }
    const controller = new AbortController();
    let timedOut = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    const onCallerAbort = () => controller.abort(); // Never forward potentially sensitive caller reasons.
    if (callerSignal?.aborted) throw new ApiClientError("ABORTED");
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let abortListener: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(new ApiClientError(timedOut ? "TIMEOUT" : "ABORTED"));
      controller.signal.addEventListener("abort", abortListener, { once: true });
    });
    const checkAbort = () => { if (controller.signal.aborted) throw new ApiClientError(timedOut ? "TIMEOUT" : "ABORTED"); };
    const run = async (): Promise<T> => {
      checkAbort();
      let headers: Headers;
      try {
        headers = new Headers(typeof resolveHeaders === "function" ? await resolveHeaders(controller.signal) : resolveHeaders);
      } catch (error) {
        checkAbort();
        if (error instanceof ApiClientError) throw new ApiClientError(error.code, error.status);
        throw new ApiClientError("AUTHENTICATION");
      }
      checkAbort();
      try {
        for (const [name, value] of requestHeaders) headers.set(name, value);
      } catch {
        throw new ApiClientError("INVALID_INPUT");
      }
      // A proxy hop or client cookie must not be smuggled in through configured headers.
      for (const forbidden of ["host", "cookie", "proxy-authorization", "connection", "content-length", "transfer-encoding"]) {
        if (headers.has(forbidden)) throw new ApiClientError("INVALID_CONFIG");
      }
      if (!headers.has("accept")) headers.set("accept", "application/json");
      response = await fetcher(url, {
        method, headers, redirect: "error", credentials: "omit", cache: "no-store",
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        checkAbort();
      }
      // Fetch enforces this before sending credentials to a second origin. These checks also
      // reject a nonconforming injected Fetch result, though cannot undo its network behavior.
      if (response.redirected || (response.status >= 300 && response.status <= 399) || (response.url && new URL(response.url).origin !== origin)) {
        throw new ApiClientError("REDIRECT");
      }
      if (!response.ok) throw new ApiClientError("HTTP", response.status);
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (!contentType || (contentType !== "application/json" && !/^application\/[a-z0-9.+-]+\+json$/u.test(contentType))) {
        throw new ApiClientError("INVALID_RESPONSE");
      }
      // Streaming is authoritative: compressed or untrusted Content-Length headers cannot bypass this limit.
      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
        throw new ApiClientError("RESPONSE_TOO_LARGE");
      }
      if (!response.body) throw new ApiClientError("INVALID_RESPONSE");
      reader = response.body.getReader();
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        checkAbort();
        const chunk = await reader.read();
        checkAbort();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxResponseBytes) throw new ApiClientError("RESPONSE_TOO_LARGE");
        chunks.push(chunk.value);
      }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as T;
      } catch {
        throw new ApiClientError("INVALID_RESPONSE");
      }
    };
    try {
      return await Promise.race([run(), cancelled]);
    } catch (error) {
      if (controller.signal.aborted) throw new ApiClientError(timedOut ? "TIMEOUT" : "ABORTED");
      if (error instanceof ApiClientError) throw new ApiClientError(error.code, error.status);
      // Do not retain raw Fetch/provider errors, stack causes, response bodies, or URLs.
      throw new ApiClientError("NETWORK");
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      // Don't wait for a remote body or custom reader to acknowledge cancellation.
      if (reader) void reader.cancel().catch(() => {});
      else if (response) void response.body?.cancel().catch(() => {});
      controller.abort();
    }
  }
  return Object.freeze({ request });
}
