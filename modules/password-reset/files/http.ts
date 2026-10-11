// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for password reset. Mount it under one path prefix with your
// framework's catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers). No sign-in:
// these routes serve signed-out users.
//   POST {prefix}/request   {email}            -> 202 {ok: true}   (same body whether or not the account exists)
//   GET  {prefix}/verify?token=...             -> 200 {valid, expiresAt?}
//   POST {prefix}/complete  {token, password}  -> 204, or 400 {error: "invalid-token" | "weak-password", problems?}
// Every response carries cache-control: no-store and referrer-policy: no-referrer, because the token is in the
// link's query string.
import { normalizeEmail, PasswordResetError } from "./core.js";
import type { PasswordReset, RequestResult } from "./core.js";

export interface PasswordResetHttpOptions {
  readonly reset: PasswordReset;
  readonly prefix: string;
  /** Exact allowed origins; POSTs without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /**
   * Return false to refuse with 429. Called with `ip:<address>` and `email:<normalized lowercase email>` on
   * /request, and `ip:<address>` on /complete. Back it with the rate-limit module or your gateway's limiter.
   */
  readonly rateLimit?: (key: string) => boolean | Promise<boolean>;
  /** The client address from trusted server context (your proxy's verified header or the socket). */
  readonly clientIp?: (request: Request) => string | null | undefined;
  /** Server-side observer of request outcomes (log `serverError`); never echo it to the client. */
  readonly onRequestResult?: (result: RequestResult) => void;
  /** Largest accepted JSON body in bytes. Default 4,096. */
  readonly maxRequestBytes?: number;
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store", "referrer-policy": "no-referrer" };

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });
const empty = (status: number): Response => new Response(null, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });

const text = (value: unknown): string => (typeof value === "string" ? value : "");

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new PasswordResetError("bad-request", "Body too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new PasswordResetError("bad-request", "Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createPasswordResetHandler(options: PasswordResetHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 4096;
  const { reset } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new PasswordResetError("bad-request", "Expected application/json");
    const value: unknown = JSON.parse(await readBounded(request, maxRequest));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PasswordResetError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  async function limited(keys: string[]): Promise<boolean> {
    if (!options.rateLimit) return false;
    for (const key of keys) if (!(await options.rateLimit(key))) return true;
    return false;
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const rest = url.pathname.slice(prefix.length).replace(/^\/+/, "");
    const ip = options.clientIp?.(request) ?? "unknown";
    try {
      if (request.method === "GET" && rest === "verify") {
        return json(200, await reset.verify(url.searchParams.get("token") ?? ""));
      }
      if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
      if (!origins.has(request.headers.get("origin") ?? "")) return json(403, { error: "forbidden", message: "Origin not allowed" });
      if (rest === "request") {
        const email = text((await readBody(request)).email);
        const keys = [`ip:${ip}`];
        const normalized = normalizeEmail(email.slice(0, 320));
        if (normalized) keys.push(`email:${normalized.toLowerCase()}`);
        if (await limited(keys)) return json(429, { error: "rate-limited" });
        const result = await reset.request(email, ip === "unknown" ? {} : { ip });
        options.onRequestResult?.(result);
        // Identical for unknown accounts, malformed addresses and failed delivery.
        return json(202, { ok: true });
      }
      if (rest === "complete") {
        if (await limited([`ip:${ip}`])) return json(429, { error: "rate-limited" });
        const body = await readBody(request);
        await reset.complete(text(body.token), text(body.password));
        return empty(204);
      }
      return json(404, { error: "not-found" });
    } catch (error) {
      if (error instanceof PasswordResetError) {
        return json(400, { error: error.code, message: error.message, ...(error.problems.length ? { problems: error.problems } : {}) });
      }
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
