// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for email signup. Mount it under one path prefix with your
// framework's catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   POST {prefix}/signup   {email, password}  -> 202 {ok: true}  (same body whether or not the email is registered)
//                                             or 400 {error: "invalid-email" | "weak-password", problems?}
//   POST {prefix}/resend   {email}            -> 202 {ok: true}  (same body for every outcome)
//   POST {prefix}/confirm  {token}            -> 200 {verified: true}, or 400 {error: "invalid-token"}
// The emailed link should open your page, which POSTs the token to /confirm (link scanners issue GETs).
// Every response carries cache-control: no-store and referrer-policy: no-referrer.
// createVerifiedGate returns a 403 for signed-in accounts that have not confirmed their email.
import { normalizeEmail, SignupError } from "./core.js";
import type { EmailSignup, PublicResult } from "./core.js";

export interface EmailSignupHttpOptions {
  readonly signup: EmailSignup;
  readonly prefix: string;
  /** Exact allowed origins; POSTs without a matching Origin header are refused with 403. */
  readonly allowedOrigins: readonly string[];
  /**
   * Return false to refuse with 429. Called with `ip:<address>` on every route and `email:<normalized email>` on
   * /signup and /resend. Back it with the rate-limit module or your gateway's limiter.
   */
  readonly rateLimit?: (key: string) => boolean | Promise<boolean>;
  /** The client address from trusted server context (your proxy's verified header or the socket). */
  readonly clientIp?: (request: Request) => string | null | undefined;
  /** Server-side observer of signup/resend outcomes (log `serverError`); never echo it to the client. */
  readonly onResult?: (route: "signup" | "resend", result: PublicResult) => void;
  /** Largest accepted JSON body in bytes. Default 4,096. */
  readonly maxRequestBytes?: number;
}

const SECURITY_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...SECURITY_HEADERS } });
const text = (value: unknown): string => (typeof value === "string" ? value : "");

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new SignupError("bad-request", "Body too large");
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
      throw new SignupError("bad-request", "Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createEmailSignupHandler(options: EmailSignupHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 4096;
  const { signup } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new SignupError("bad-request", "Expected application/json");
    const value: unknown = JSON.parse(await readBounded(request, maxRequest));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SignupError("bad-request", "Expected a JSON object");
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
    if (rest !== "signup" && rest !== "resend" && rest !== "confirm") return json(404, { error: "not-found" });
    if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
    if (!origins.has(request.headers.get("origin") ?? "")) return json(403, { error: "forbidden", message: "Origin not allowed" });
    const ip = options.clientIp?.(request) ?? "unknown";
    try {
      const body = await readBody(request);
      if (rest === "confirm") {
        if (await limited([`ip:${ip}`])) return json(429, { error: "rate-limited" });
        await signup.confirm(text(body.token));
        return json(200, { verified: true });
      }
      const email = text(body.email);
      const keys = [`ip:${ip}`];
      const normalized = normalizeEmail(email);
      if (normalized) keys.push(`email:${normalized}`);
      if (await limited(keys)) return json(429, { error: "rate-limited" });
      const result = rest === "signup" ? await signup.signup(email, text(body.password)) : await signup.resend(email);
      options.onResult?.(rest, result);
      // Identical for new and registered emails, rate-limited resends and failed delivery.
      return json(202, { ok: true });
    } catch (error) {
      if (error instanceof SignupError) {
        return json(400, { error: error.code, message: error.message, ...(error.problems.length ? { problems: error.problems } : {}) });
      }
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}

export interface VerifiedGateOptions {
  readonly signup: EmailSignup;
  /** The signed-in account id from your session (never from the request body), or null when signed out. */
  readonly accountId: (request: Request) => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * Returns a guard for gated routes: null when the signed-in account is verified, otherwise a 401 (signed out) or
 * 403 {error: "email-unverified"} response to return as is.
 */
export function createVerifiedGate(options: VerifiedGateOptions): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const accountId = await options.accountId(request);
    if (!accountId) return json(401, { error: "unauthenticated" });
    if (!(await options.signup.isVerified(accountId))) {
      return json(403, { error: "email-unverified", message: "Verify your email address to use this feature" });
    }
    return null;
  };
}
