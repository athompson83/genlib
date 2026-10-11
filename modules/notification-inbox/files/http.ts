// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for the signed-in user's own inbox. Mount it under one
// path prefix with your framework's catch-all route (Next.js route handler, Hono, Remix, Workers,
// Node 22 fetch servers).
//   GET  {prefix}?cursor=&limit=&unread=1  -> 200 {items, nextCursor}
//   GET  {prefix}/count                    -> 200 {unread}
//   POST {prefix}/read      {ids}          -> 200 {updated}
//   POST {prefix}/read-all  {before?}      -> 200 {updated}
//   POST {prefix}/archive   {ids}          -> 200 {updated}
// publish() is deliberately not exposed: notifications are created by trusted server code only.
import { InboxError } from "./core.js";
import type { Actor, Inbox } from "./core.js";

export interface InboxHttpOptions {
  readonly inbox: Inbox;
  readonly prefix: string;
  /**
   * Resolve the signed-in user and their active tenant from trusted server context (session cookie,
   * verified JWT). Return null when signed out. Never take tenantId or userId from the request.
   */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
}

// Every other InboxError code is a 400 (invalid input).
const STATUS: Record<string, number> = { forbidden: 403 };
const ROUTES = new Set(["", "count", "read", "read-all", "archive"]);

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function readBody(request: Request, allowEmpty: boolean): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 8192) throw new InboxError("bad-request", "Body too large");
  if (text.trim() === "" && allowEmpty) return {};
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new InboxError("bad-request", "Expected application/json");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InboxError("bad-request", "Expected a JSON object");
  return value as Record<string, unknown>;
}

function parseLimit(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  if (!/^\d{1,3}$/.test(value)) throw new InboxError("invalid-limit", "limit must be a whole number");
  return Number(value);
}

export function createInboxHandler(options: InboxHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const { inbox } = options;
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const rest = url.pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "");
    try {
      if (request.method !== "GET" && request.method !== "HEAD" && !origins.has(request.headers.get("origin") ?? "")) {
        return json(403, { error: "forbidden", message: "Origin not allowed" });
      }
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      const actor: Actor = { tenantId: user.tenantId, userId: user.userId };
      if (request.method === "GET" && rest === "") {
        const cursor = url.searchParams.get("cursor");
        const limit = parseLimit(url.searchParams.get("limit"));
        return json(200, await inbox.list(actor, {
          ...(cursor ? { cursor } : {}), ...(limit !== undefined ? { limit } : {}), unreadOnly: url.searchParams.get("unread") === "1",
        }));
      }
      if (request.method === "GET" && rest === "count") return json(200, { unread: await inbox.unreadCount(actor) });
      if (request.method === "POST" && rest === "read") {
        return json(200, await inbox.markRead(actor, (await readBody(request, false)).ids as string[]));
      }
      if (request.method === "POST" && rest === "read-all") {
        const { before } = await readBody(request, true);
        if (before !== undefined && typeof before !== "number") throw new InboxError("invalid-before", "before must be a number");
        return json(200, await inbox.markAllRead(actor, before === undefined ? {} : { before }));
      }
      if (request.method === "POST" && rest === "archive") {
        return json(200, await inbox.archive(actor, (await readBody(request, false)).ids as string[]));
      }
      return ROUTES.has(rest) ? json(405, { error: "method-not-allowed" }) : json(404, { error: "not-found" });
    } catch (error) {
      if (error instanceof InboxError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
