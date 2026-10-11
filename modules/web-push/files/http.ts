// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for browser push subscriptions. Mount it under one path prefix with
// your framework's catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET    {prefix}/vapid-public-key                        -> 200 {publicKey}       (no sign-in needed)
//   POST   {prefix}/subscriptions  PushSubscription JSON    -> 201 {subscription: {endpoint, createdAt}}
//   DELETE {prefix}/subscriptions  {endpoint}               -> 200 {removed}         (only the caller's own)
// Sending is server code: call webPush.send from your own jobs, never from a public route.
import { WebPushError } from "./push.js";
import type { WebPush } from "./push.js";

export interface WebPushHttpOptions {
  readonly webPush: WebPush;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<{ readonly userId: string } | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in characters. Default 8,192. */
  readonly maxRequestBytes?: number;
}

const STATUS: Record<string, number> = { "endpoint-not-allowed": 422 };

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function createWebPushHandler(options: WebPushHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 8_192;
  const { webPush } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new WebPushError("bad-request", "Expected application/json");
    const body = await request.text();
    if (body.length > maxRequest) throw new WebPushError("bad-request", "Body too large");
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebPushError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.startsWith(prefix + "/") ? url.pathname.slice(prefix.length) : null;
    try {
      if (path === "/vapid-public-key") {
        if (request.method !== "GET") return json(405, { error: "method-not-allowed" });
        return json(200, { publicKey: webPush.vapidPublicKey });
      }
      if (path !== "/subscriptions") return json(404, { error: "not-found" });
      if (request.method !== "POST" && request.method !== "DELETE") return json(405, { error: "method-not-allowed" });
      if (!origins.has(request.headers.get("origin") ?? "")) return json(403, { error: "forbidden", message: "Origin not allowed" });
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      const body = await readBody(request);
      if (request.method === "POST") {
        const stored = await webPush.subscribe(user.userId, body);
        return json(201, { subscription: { endpoint: stored.endpoint, createdAt: stored.createdAt } });
      }
      const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
      return json(200, { removed: await webPush.unsubscribe(endpoint, user.userId) });
    } catch (error) {
      if (error instanceof WebPushError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
