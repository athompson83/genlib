// SPDX-License-Identifier: Apache-2.0
// Original Genlib transport, following common-api-clients' bounded, explicit Fetch contract.
export type FetchLike = typeof globalThis.fetch;
export type PublicDataErrorCode = "INVALID_CONFIG" | "INVALID_INPUT" | "AUTHENTICATION" | "DENIED"
  | "ABORTED" | "TIMEOUT" | "NETWORK" | "HTTP" | "REDIRECT" | "INVALID_RESPONSE"
  | "REQUEST_TOO_LARGE" | "RESPONSE_TOO_LARGE";
const messages: Record<PublicDataErrorCode, string> = {
  INVALID_CONFIG: "Public data client configuration is invalid.", INVALID_INPUT: "Public data request input is invalid.",
  AUTHENTICATION: "Public data credential resolution failed.", DENIED: "Public data operation was not authorized.",
  ABORTED: "Public data request was cancelled.", TIMEOUT: "Public data request exceeded its deadline.",
  NETWORK: "Public data request could not be completed.", HTTP: "Public data provider returned an unsuccessful status.",
  REDIRECT: "Public data redirects are not allowed.", INVALID_RESPONSE: "Public data provider returned an unexpected response.",
  REQUEST_TOO_LARGE: "Public data request exceeded its size limit.", RESPONSE_TOO_LARGE: "Public data response exceeded its size limit.",
};
/** Does not retain request URLs, credentials, response bodies, abort reasons or raw causes. */
export class PublicDataError extends Error {
  readonly code: PublicDataErrorCode;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  constructor(code: PublicDataErrorCode, status?: number, retryAfterMs?: number) {
    const safe = Object.hasOwn(messages, code) ? code : "INVALID_CONFIG";
    super(messages[safe]); this.name = "PublicDataError"; this.code = safe;
    this.status = Number.isInteger(status) && status! >= 100 && status! <= 599 ? status : undefined;
    this.retryAfterMs = Number.isFinite(retryAfterMs) && retryAfterMs! >= 0 ? retryAfterMs : undefined;
  }
}
export interface PublicDataOptions {
  /** Trusted server configuration, never an origin supplied by request JSON. */
  origin?: string;
  fetch?: FetchLike;
  /** Total deadline, including credential callbacks, response reads and retry waits. */
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRequestBytes?: number;
  /** Default 0; maximum 2. Only 429/502/503/504 responses to these read operations retry. */
  maxRetries?: number;
  /** Do not retry earlier than Retry-After; a longer provider delay returns an error. */
  maxRetryDelayMs?: number;
  /** Optional application authorization before any credentials or outbound request. */
  authorize?: (operation: Readonly<{ provider: string; path: string; method: "GET" | "POST" }>, signal: AbortSignal) => boolean | Promise<boolean>;
}
export type SecretProvider = (signal: AbortSignal) => string | Promise<string>;
export interface ReadOptions {
  signal?: AbortSignal | undefined;
  /** Supply validators from your application's matching cached representation. */
  cache?: { etag?: string; lastModified?: string } | undefined;
}
export interface ResponseMetadata {
  provider: string;
  source: string;
  attribution: string;
  retrievedAt: string;
  status: number;
  attempts: number;
  cache: {
    cacheControl: string | null; etag: string | null; lastModified: string | null;
    expires: string | null; ageSeconds: number | null;
  };
  rateLimit: Readonly<Record<string, string>>;
}
export type DataResult<T> =
  | { notModified: false; data: T; meta: ResponseMetadata }
  | { notModified: true; data: null; meta: ResponseMetadata };
interface TransportConfiguration extends PublicDataOptions {
  origin: string;
  provider: string;
  source: string;
  attribution: string;
  headers?: HeadersInit;
  /** Called once per operation within its deadline. No environment/credential discovery. */
  credentials?: (signal: AbortSignal) => Promise<{ headers?: HeadersInit; query?: Record<string, string> }>;
}
interface RequestConfiguration extends ReadOptions {
  /** POST is used only by documented read-only OSV/vPIC batch/query operations. */
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
}
export function inputText(value: unknown, max = 1024): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new PublicDataError("INVALID_INPUT");
  return value.trim();
}
export function inputInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new PublicDataError("INVALID_INPUT");
  return value;
}
export function coordinate(value: unknown, latitude: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > (latitude ? 90 : 180)) throw new PublicDataError("INVALID_INPUT");
  return value;
}
export function dateInput(value: unknown): string {
  const s = inputText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new PublicDataError("INVALID_INPUT");
  return s;
}
export function segment(value: unknown): string {
  const s = inputText(value);
  if (s === "." || s === ".." || s.includes("\\")) throw new PublicDataError("INVALID_INPUT");
  return encodeURIComponent(s);
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicDataError("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
export function array(value: unknown, maximum = 10000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new PublicDataError("INVALID_RESPONSE");
  return value;
}
export function string(value: unknown): string {
  if (typeof value !== "string") throw new PublicDataError("INVALID_RESPONSE");
  return value;
}
export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new PublicDataError("INVALID_RESPONSE");
  return value;
}
export function nullableString(value: unknown): string | null { return value == null ? null : string(value); }
export function nullableNumber(value: unknown): number | null { return value == null ? null : number(value); }
export function strings(value: unknown, maximum = 1000): string[] { return array(value, maximum).map(string); }
export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new PublicDataError("INVALID_RESPONSE");
  return value;
}
export function secret(value: unknown): string {
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,16384}$/u.test(value)) throw new PublicDataError("AUTHENTICATION");
  return value;
}
export function applicationAgent(value: unknown): string {
  try { return inputText(value, 512); } catch { throw new PublicDataError("INVALID_CONFIG"); }
}
export function queryPath(path: string, values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
  const suffix = query.toString(); return suffix ? `${path}?${suffix}` : path;
}
function configNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new PublicDataError("INVALID_CONFIG");
  return result;
}
function httpsOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || /[\s\\]/u.test(value)) throw new Error();
    return parsed.origin;
  } catch { throw new PublicDataError("INVALID_CONFIG"); }
}
function requestUrl(origin: string, path: string): URL {
  if (typeof path !== "string" || path.length > 16384 || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/u.test(path)
    || path.split("?")[0]!.split("/").some(p => /^(?:\.|%2e){1,2}$/iu.test(p))) throw new PublicDataError("INVALID_INPUT");
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.hash || url.username || url.password) throw new Error();
    return url;
  } catch { throw new PublicDataError("INVALID_INPUT"); }
}
function header(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  return value !== null && value.length <= 2048 && !/[\r\n]/u.test(value) ? value : null;
}
function retryDelay(headers: Headers): number | undefined {
  const raw = header(headers, "retry-after");
  if (raw === null) return undefined;
  const ms = /^\d+$/u.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}
function metadata(response: Response, config: TransportConfiguration, attempts: number): ResponseMetadata {
  const rateLimit: Record<string, string> = {};
  for (const name of ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "x-rate-limit-limit", "x-rate-limit-remaining", "x-rate-limit-interval", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-concurrency-limit", "retry-after"]) {
    const value = header(response.headers, name); if (value !== null) rateLimit[name] = value;
  }
  const age = header(response.headers, "age");
  return { provider: config.provider, source: config.source, attribution: config.attribution,
    retrievedAt: new Date().toISOString(), status: response.status, attempts,
    cache: { cacheControl: header(response.headers, "cache-control"), etag: header(response.headers, "etag"),
      lastModified: header(response.headers, "last-modified"), expires: header(response.headers, "expires"),
      ageSeconds: age !== null && /^\d+$/u.test(age) && Number.isSafeInteger(Number(age)) ? Number(age) : null },
    rateLimit: Object.freeze(rateLimit) };
}
/** No cache store, network traffic or credential access occurs until request() is called. */
export function createPublicDataTransport(configuration: TransportConfiguration) {
  if (typeof window !== "undefined" && typeof document !== "undefined") throw new PublicDataError("INVALID_CONFIG");
  const origin = httpsOrigin(configuration.origin);
  const fetcher = configuration.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new PublicDataError("INVALID_CONFIG");
  const timeoutMs = configNumber(configuration.timeoutMs, 15000, 1, 120000);
  const maxResponseBytes = configNumber(configuration.maxResponseBytes, 1048576, 1, 8388608);
  const maxRequestBytes = configNumber(configuration.maxRequestBytes, 262144, 1, 8388608);
  const maxRetries = configNumber(configuration.maxRetries, 0, 0, 2);
  const maxRetryDelayMs = configNumber(configuration.maxRetryDelayMs, 5000, 0, 10000);
  let baseHeaders: Headers;
  try { baseHeaders = new Headers(configuration.headers); } catch { throw new PublicDataError("INVALID_CONFIG"); }
  const config = { ...configuration }; // Immutable references/strings for metadata and credentials.

  async function request<T>(path: string, parse: (value: unknown) => T, options: RequestConfiguration = {}): Promise<DataResult<T>> {
    const url = requestUrl(origin, path);
    const method = options.method ?? "GET", body = options.body, signal = options.signal;
    if (!["GET", "POST"].includes(method) || (method === "GET" && body !== undefined)) throw new PublicDataError("INVALID_INPUT");
    if (body !== undefined && (typeof body !== "string" || new TextEncoder().encode(body).byteLength > maxRequestBytes)) throw new PublicDataError("REQUEST_TOO_LARGE");
    const headers = new Headers(baseHeaders);
    if (options.contentType) headers.set("content-type", inputText(options.contentType, 200));
    const etag = options.cache?.etag, lastModified = options.cache?.lastModified;
    if (method !== "GET" && (etag !== undefined || lastModified !== undefined)) throw new PublicDataError("INVALID_INPUT");
    if (etag !== undefined) headers.set("if-none-match", inputText(etag, 2048));
    if (lastModified !== undefined) headers.set("if-modified-since", inputText(lastModified, 200));
    if (signal?.aborted) throw new PublicDataError("ABORTED");
    const controller = new AbortController();
    let timedOut = false, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, response: Response | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const callerAbort = () => controller.abort();
    signal?.addEventListener("abort", callerAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const abortError = () => new PublicDataError(timedOut ? "TIMEOUT" : "ABORTED");
    const checkAbort = () => { if (controller.signal.aborted) throw abortError(); };
    let onAbort: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(abortError()); controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const run = async (): Promise<DataResult<T>> => {
      checkAbort();
      if (config.authorize) {
        let allowed = false;
        try { allowed = await config.authorize(Object.freeze({ provider: config.provider, path, method }), controller.signal); }
        catch { checkAbort(); throw new PublicDataError("DENIED"); }
        checkAbort(); if (allowed !== true) throw new PublicDataError("DENIED");
      }
      if (config.credentials) {
        try {
          const resolved = await config.credentials(controller.signal); checkAbort();
          for (const [key, value] of new Headers(resolved.headers)) headers.set(key, value);
          for (const [key, value] of Object.entries(resolved.query ?? {})) url.searchParams.set(key, value);
        } catch (error) {
          checkAbort();
          if (error instanceof PublicDataError && error.code === "DENIED") throw error;
          throw new PublicDataError("AUTHENTICATION");
        }
      }
      for (const name of ["cookie", "host", "proxy-authorization", "connection", "content-length", "transfer-encoding"]) if (headers.has(name)) throw new PublicDataError("INVALID_CONFIG");
      if (!headers.has("accept")) headers.set("accept", "application/json");
      for (let attempt = 1; ; attempt += 1) {
        checkAbort();
        response = await fetcher(url, { method, headers: new Headers(headers), ...(body === undefined ? {} : { body }),
          redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); checkAbort(); }
        if (response.redirected || (response.url && new URL(response.url).origin !== origin)) throw new PublicDataError("REDIRECT");
        if (response.status === 304) {
          if (method !== "GET" || (etag === undefined && lastModified === undefined)) throw new PublicDataError("INVALID_RESPONSE");
          return { notModified: true, data: null, meta: metadata(response, config, attempt) };
        }
        if (response.status >= 300 && response.status <= 399) throw new PublicDataError("REDIRECT");
        if (!response.ok) {
          const retryAfterMs = retryDelay(response.headers), delay = retryAfterMs ?? 200 * 2 ** (attempt - 1);
          if (attempt <= maxRetries && [429, 502, 503, 504].includes(response.status) && delay <= maxRetryDelayMs) {
            void response.body?.cancel().catch(() => {}); response = undefined;
            await new Promise<void>(resolve => { retryTimer = setTimeout(resolve, delay); });
            continue;
          }
          throw new PublicDataError("HTTP", response.status, retryAfterMs);
        }
        const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
        if (!type || (type !== "application/json" && !/^application\/[a-z0-9.+-]+\+json$/u.test(type)) || !response.body) throw new PublicDataError("INVALID_RESPONSE");
        const length = response.headers.get("content-length");
        if (length !== null && /^\d+$/u.test(length) && Number(length) > maxResponseBytes) throw new PublicDataError("RESPONSE_TOO_LARGE");
        reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        for (;;) {
          checkAbort(); const item = await reader.read(); checkAbort(); if (item.done) break;
          size += item.value.byteLength; if (size > maxResponseBytes) throw new PublicDataError("RESPONSE_TOO_LARGE");
          chunks.push(item.value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let parsed: T;
        try { parsed = parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
        catch { throw new PublicDataError("INVALID_RESPONSE"); }
        return { notModified: false, data: parsed, meta: metadata(response, config, attempt) };
      }
    };
    try { return await Promise.race([run(), cancelled]); }
    catch (error) {
      if (controller.signal.aborted) throw abortError();
      if (error instanceof PublicDataError) throw new PublicDataError(error.code, error.status, error.retryAfterMs);
      throw new PublicDataError("NETWORK");
    } finally {
      clearTimeout(timer); clearTimeout(retryTimer);
      signal?.removeEventListener("abort", callerAbort); controller.signal.removeEventListener("abort", onAbort!);
      if (reader) void reader.cancel().catch(() => {}); else if (response) void response.body?.cancel().catch(() => {});
      controller.abort();
    }
  }
  return Object.freeze({ request });
}
