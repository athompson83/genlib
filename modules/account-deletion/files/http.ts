// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for account deletion, mounted under one prefix.
//   GET    {prefix}/{userId|me}                 -> 200 {deletion}   (latest request or null)
//   POST   {prefix}/{userId|me}  {reason?}      -> 202 {deletion}   (schedules deletion, revokes sessions)
//   DELETE {prefix}/{userId|me}                 -> 200 {deletion}   (cancels during the grace period)
// `authenticate(request)` returns the caller with `authenticatedAt` (when they last proved their credentials).
// For cancel, the owner has no session: authenticate from a fresh credential check made by your sign-in flow.
// Responses never include the worker's claim token. The scheduled run is not an HTTP route: call runDue() from
// your scheduler or job queue.
import { AccountDeletionError } from "./core.js";
import type { AccountDeletion, Actor, DeletionRequest } from "./core.js";

export interface AccountDeletionHandlerOptions {
  readonly deletion: AccountDeletion;
  readonly prefix: string;
  /** The caller from trusted server context (session, verified token or fresh credential check), or null. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in bytes. Default 4,096. */
  readonly maxRequestBytes?: number;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "reauth-required": 401, "invalid-user": 400, "invalid-reason": 400, "already-pending": 409,
  "already-deleted": 410, "not-pending": 409, "too-late": 409, "revoke-failed": 503, "invalid-limit": 400,
  "bad-request": 400, "too-large": 413,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The request as callers see it: no lease token. */
export function publicView(request: DeletionRequest | null): Omit<DeletionRequest, "claimToken"> | null {
  if (!request) return null;
  const { claimToken: _hidden, ...rest } = request;
  return rest;
}

const ID = /^[\w.:@-]{1,128}$/;

export function createAccountDeletionHandler(options: AccountDeletionHandlerOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 4096;
  const { deletion } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > maxRequest) throw new AccountDeletionError("too-large", "Body too large");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > maxRequest) throw new AccountDeletionError("too-large", "Body too large");
    if (bytes.length === 0) return {};
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new AccountDeletionError("bad-request", "Expected application/json");
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccountDeletionError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  return async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
    const [target, ...extra] = parts;
    if (target === undefined || extra.length > 0 || !ID.test(target)) return json(404, { error: "not-found" });
    try {
      if (request.method !== "GET" && request.method !== "HEAD" && !origins.has(request.headers.get("origin") ?? "")) {
        return json(403, { error: "forbidden", message: "Origin not allowed" });
      }
      const actor = await options.authenticate(request);
      if (!actor) return json(401, { error: "unauthenticated" });
      const userId = target === "me" ? actor.userId : target;
      if (request.method === "GET") return json(200, { deletion: publicView(await deletion.status(actor, userId)) });
      if (request.method === "POST") {
        const body = await readBody(request);
        const reason = body.reason === undefined ? null : body.reason;
        return json(202, { deletion: publicView(await deletion.request(actor, { userId, reason: reason as string | null })) });
      }
      if (request.method === "DELETE") return json(200, { deletion: publicView(await deletion.cancel(actor, { userId })) });
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof AccountDeletionError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
