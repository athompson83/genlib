// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for comments. Mount it under one path prefix with your
// framework's catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET    {prefix}?tenantId&resourceType&resourceId&cursor&limit -> 200 {comments, nextCursor}
//   GET    {prefix}/{id}/replies?cursor&limit                     -> 200 {replies, nextCursor}
//   POST   {prefix}            {tenantId, resourceType, resourceId, body, parentId?} -> 201 {comment}
//   PATCH  {prefix}/{id}       {body}    -> 200 {comment}
//   DELETE {prefix}/{id}                 -> 200 {comment}
//   POST   {prefix}/{id}/reactions {emoji}  -> 200 {reacted, reactions}
//   POST   {prefix}/{id}/flag      {reason} -> 200 {flagged, hidden}
//   POST   {prefix}/{id}/moderate  {action} -> 200 {comment}
// Responses are JSON with plain-text bodies; render them as text, never as HTML.
import { CommentError } from "./core.js";
import type { Actor, Comments } from "./core.js";

export interface CommentHttpOptions {
  readonly comments: Comments;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in characters. Default 65,536. */
  readonly maxRequestBytes?: number;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "not-found": 404, "invalid-tenant": 400, "invalid-resource": 400, "invalid-body": 400, "invalid-parent": 400,
  "too-deep": 400, "invalid-cursor": 400, "invalid-limit": 400, "invalid-emoji": 400, "invalid-reason": 400, "invalid-action": 400,
  "edit-window-closed": 409, deleted: 410, "already-flagged": 409, conflict: 409, "bad-request": 400,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const ID = /^[\w-]{1,64}$/;

function limitParam(url: URL): number | undefined {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw === "") return undefined;
  if (!/^\d{1,3}$/.test(raw)) throw new CommentError("invalid-limit", "limit must be a whole number");
  return Number(raw);
}

export function createCommentHandler(options: CommentHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 65_536;
  const { comments } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new CommentError("bad-request", "Expected application/json");
    const body = await request.text();
    if (body.length > maxRequest) throw new CommentError("bad-request", "Body too large");
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommentError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
    try {
      if (request.method !== "GET" && request.method !== "HEAD" && !origins.has(request.headers.get("origin") ?? "")) {
        return json(403, { error: "forbidden", message: "Origin not allowed" });
      }
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      const [id, action, ...extra] = parts;
      if (extra.length > 0 || (id !== undefined && !ID.test(id))) return json(404, { error: "not-found" });

      if (id === undefined) {
        if (request.method === "GET") {
          const query = url.searchParams;
          const limit = limitParam(url);
          return json(200, await comments.list(user, {
            tenantId: query.get("tenantId") ?? "", resourceType: query.get("resourceType") ?? "", resourceId: query.get("resourceId") ?? "",
            cursor: query.get("cursor"), ...(limit === undefined ? {} : { limit }),
          }));
        }
        if (request.method === "POST") {
          const body = await readBody(request);
          const parentId = body.parentId == null ? undefined : text(body.parentId);
          const comment = await comments.post(user, {
            tenantId: text(body.tenantId), resourceType: text(body.resourceType), resourceId: text(body.resourceId),
            body: text(body.body), ...(parentId === undefined ? {} : { parentId }),
          });
          return json(201, { comment });
        }
      } else if (action === undefined) {
        if (request.method === "PATCH") return json(200, { comment: await comments.edit(user, id, text((await readBody(request)).body)) });
        if (request.method === "DELETE") return json(200, { comment: await comments.remove(user, id) });
      } else if (action === "replies" && request.method === "GET") {
        const limit = limitParam(url);
        return json(200, await comments.listReplies(user, id, { cursor: url.searchParams.get("cursor"), ...(limit === undefined ? {} : { limit }) }));
      } else if (action === "reactions" && request.method === "POST") {
        return json(200, await comments.react(user, id, text((await readBody(request)).emoji)));
      } else if (action === "flag" && request.method === "POST") {
        return json(200, await comments.flag(user, id, text((await readBody(request)).reason)));
      } else if (action === "moderate" && request.method === "POST") {
        const value = text((await readBody(request)).action);
        if (value !== "approve" && value !== "hide") throw new CommentError("invalid-action", "Action must be approve or hide");
        return json(200, { comment: await comments.moderate(user, id, value) });
      } else if (!["replies", "reactions", "flag", "moderate"].includes(action)) {
        return json(404, { error: "not-found" });
      }
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof CommentError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
