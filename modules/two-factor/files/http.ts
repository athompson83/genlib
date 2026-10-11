// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for two-factor authentication. Mount it under one path prefix with your
// framework's catch-all route. Every route needs `authenticate(request)`, which reports the session stage: a full
// "signed-in" session for settings routes, or "second-factor-pending" (password accepted) for /verify and /recovery.
//   GET  {prefix}/status                      -> 200 {enabled, pending, recoveryCodesRemaining}
//   POST {prefix}/enroll                      -> 200 {secret, otpauthUri, expiresAt}
//   POST {prefix}/enroll/confirm   {code}     -> 200 {recoveryCodes}
//   POST {prefix}/verify           {code}     -> 200 {ok: true}            (onVerified may add headers, e.g. a cookie)
//   POST {prefix}/recovery         {code}     -> 200 {ok: true, remaining}
//   POST {prefix}/recovery-codes/regenerate   -> 200 {recoveryCodes}      (step-up)
//   POST {prefix}/disable                     -> 204                      (step-up)
// Every response carries cache-control: no-store.
import { TwoFactorError } from "./core.js";
import type { TwoFactor, TwoFactorErrorCode } from "./core.js";

export interface TwoFactorSession {
  readonly userId: string;
  /**
   * "second-factor-pending" after the password was accepted but before a code: such a session may only call /verify
   * and /recovery. Every other route (status, enroll, regenerate, disable) needs "signed-in"; otherwise a stolen
   * password alone could regenerate recovery codes or turn 2FA off.
   */
  readonly stage: "signed-in" | "second-factor-pending";
  /** Label in the authenticator app, usually the email; must not contain ":". Defaults to the user id with ":" replaced by "-". */
  readonly accountName?: string;
  /** When the user last proved their password (epoch ms); required for disable and regenerate. */
  readonly authenticatedAt?: number;
}

export interface TwoFactorHttpOptions {
  readonly twoFactor: TwoFactor;
  readonly prefix: string;
  /** Exact allowed origins; POSTs without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Resolves the signed-in (or second-factor-pending) user from your session; null answers 401. */
  readonly authenticate: (request: Request) => TwoFactorSession | null | Promise<TwoFactorSession | null>;
  /** Return false to refuse with 429. Called with `ip:<address>` and `user:<id>` on every POST. */
  readonly rateLimit?: (key: string) => boolean | Promise<boolean>;
  /** The client address from trusted server context. */
  readonly clientIp?: (request: Request) => string | null | undefined;
  /** Called after a successful /verify or /recovery; return headers (such as set-cookie) to add to the response. */
  readonly onVerified?: (event: { userId: string; method: "totp" | "recovery-code" }, request: Request) => void | Record<string, string> | Promise<void | Record<string, string>>;
  /** Largest accepted JSON body in bytes. Default 4,096. */
  readonly maxRequestBytes?: number;
}

const BASE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra, ...BASE_HEADERS } });

const STATUS: Record<TwoFactorErrorCode, number> = {
  "invalid-code": 400, "bad-request": 400, "rate-limited": 429, "not-enabled": 409, "already-enabled": 409,
  "no-pending-enrollment": 409, "reauthentication-required": 403, "secret-unreadable": 500,
};

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new TwoFactorError("bad-request", "Body too large");
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
      throw new TwoFactorError("bad-request", "Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createTwoFactorHandler(options: TwoFactorHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 4096;
  const { twoFactor } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new TwoFactorError("bad-request", "Expected application/json");
    const text = await readBounded(request, maxRequest);
    const value: unknown = text === "" ? {} : JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TwoFactorError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  const codeOf = (body: Record<string, unknown>): string => (typeof body.code === "string" ? body.code : "");

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const route = url.pathname.slice(prefix.length).replace(/^\/+/, "");
    try {
      if (request.method === "GET" && route === "status") {
        const session = await options.authenticate(request);
        if (!session) return json(401, { error: "unauthenticated" });
        if (session.stage !== "signed-in") return json(403, { error: "second-factor-required" });
        return json(200, await twoFactor.status(session.userId));
      }
      if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
      if (!origins.has(request.headers.get("origin") ?? "")) return json(403, { error: "forbidden", message: "Origin not allowed" });
      const known = ["enroll", "enroll/confirm", "verify", "recovery", "recovery-codes/regenerate", "disable"];
      if (!known.includes(route)) return json(404, { error: "not-found" });
      const session = await options.authenticate(request);
      if (!session) return json(401, { error: "unauthenticated" });
      const signInRoute = route === "verify" || route === "recovery";
      if (!signInRoute && session.stage !== "signed-in") return json(403, { error: "second-factor-required" });
      const body = await readBody(request);
      if (options.rateLimit) {
        const ip = options.clientIp?.(request) ?? "unknown";
        for (const key of [`ip:${ip}`, `user:${session.userId}`]) {
          if (!(await options.rateLimit(key))) return json(429, { error: "rate-limited" });
        }
      }
      const { userId } = session;
      const auth = session.authenticatedAt === undefined ? {} : { authenticatedAt: session.authenticatedAt };
      switch (route) {
        case "enroll":
          // The label is display-only; user ids often contain ":" (the otpauth issuer separator), so swap it out.
          return json(200, await twoFactor.beginEnrollment(userId, { accountName: session.accountName ?? (userId.replace(/:/g, "-").slice(0, 200) || "account") }));
        case "enroll/confirm":
          return json(200, await twoFactor.confirmEnrollment(userId, codeOf(body)));
        case "verify": {
          const result = await twoFactor.verify(userId, codeOf(body));
          const headers = (await options.onVerified?.({ userId, method: result.method }, request)) ?? {};
          return json(200, { ok: true }, headers);
        }
        case "recovery": {
          const result = await twoFactor.verifyRecoveryCode(userId, codeOf(body));
          const headers = (await options.onVerified?.({ userId, method: result.method }, request)) ?? {};
          return json(200, { ok: true, remaining: result.remaining }, headers);
        }
        case "recovery-codes/regenerate":
          return json(200, await twoFactor.regenerateRecoveryCodes(userId, auth));
        default:
          await twoFactor.disable(userId, auth);
          return new Response(null, { status: 204, headers: BASE_HEADERS });
      }
    } catch (error) {
      if (error instanceof TwoFactorError) {
        const extra: Record<string, string> = error.retryAfterMs === undefined ? {} : { "retry-after": String(Math.ceil(error.retryAfterMs / 1000)) };
        const status = STATUS[error.code];
        // Never echo details of a server-side failure.
        if (status === 500) return json(500, { error: "server-error" });
        return json(status, { error: error.code, message: error.message }, extra);
      }
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
