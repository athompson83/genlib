// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for chat. Mount it under one path prefix with your framework's
// catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET    {prefix}/conversations?tenantId&cursor&limit             -> 200 {conversations, nextCursor}
//   POST   {prefix}/conversations/direct {tenantId, userId}         -> 200 {conversation}
//   POST   {prefix}/conversations {tenantId, title, memberIds}      -> 201 {conversation}
//   GET    {prefix}/conversations/{id}/messages?beforeSeq&afterSeq&limit -> 200 {messages, hasMore}
//   POST   {prefix}/conversations/{id}/messages {body, clientId}    -> 201 {message, created} (200 on a retry)
//   POST   {prefix}/conversations/{id}/read {seq}                   -> 200 {lastReadSeq}
//   GET    {prefix}/conversations/{id}/members                      -> 200 {members}
//   POST   {prefix}/conversations/{id}/members {userIds}            -> 200 {added}
//   DELETE {prefix}/conversations/{id}/members/{userId}             -> 200 {member}
//   PATCH  {prefix}/messages/{conversationId}/{seq} {body}          -> 200 {message}
//   DELETE {prefix}/messages/{conversationId}/{seq}                 -> 200 {message}
//   GET    {prefix}/unread?tenantId                                 -> 200 {conversations, total}
//   POST   {prefix}/blocks {userId}                                 -> 200 {blocked}
//   DELETE {prefix}/blocks/{userId}                                 -> 200 {blocked}
// Responses are JSON with plain-text bodies; render them as text, never as HTML. Realtime delivery is the
// onMessage hook's job (for example an SSE stream per user); this adapter only serves request/response routes.
import { ChatError } from "./core.js";
import type { Actor, Chat } from "./core.js";

export interface ChatHttpOptions {
  readonly chat: Chat;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in UTF-8 bytes. Default 32,768. */
  readonly maxRequestBytes?: number;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "not-found": 404, blocked: 403, "not-member": 403, "invalid-tenant": 400, "invalid-user": 400,
  "invalid-title": 400, "invalid-members": 400, "too-many-members": 409, "invalid-body": 400, "invalid-client-id": 400,
  "invalid-seq": 400, "invalid-limit": 400, "invalid-cursor": 400, "not-group": 400, "edit-window-closed": 409,
  deleted: 410, "bad-request": 400, "too-large": 413,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ID = /^[\w-]{1,64}$/;
const SEGMENT = /^[\w.@:-]{1,128}$/;

function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  if (!/^\d{1,15}$/.test(raw)) throw new ChatError(name === "limit" ? "invalid-limit" : "invalid-seq", `${name} must be a whole number`);
  return Number(raw);
}

export function createChatHandler(options: ChatHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 32_768;
  const { chat } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ChatError("bad-request", "Expected application/json");
    if (Number(request.headers.get("content-length") ?? "0") > maxRequest) throw new ChatError("too-large", "Body too large");
    // Read at most maxRequest bytes, cancelling the stream past the limit instead of buffering it.
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (request.body) {
      const reader = request.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxRequest) { await reader.cancel(); throw new ChatError("too-large", "Body too large"); }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ChatError("bad-request", "Body is not UTF-8"); }
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChatError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch { return "\u0000"; }
    });
    const method = request.method;
    try {
      if (method !== "GET" && method !== "HEAD" && !origins.has(request.headers.get("origin") ?? "")) {
        return json(403, { error: "forbidden", message: "Origin not allowed" });
      }
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      const [section, id, action, extra, ...rest] = parts;
      if (rest.length > 0) return json(404, { error: "not-found" });

      if (section === "conversations") {
        if (id === undefined) {
          if (method === "GET") {
            const limit = intParam(url, "limit");
            return json(200, await chat.listConversations(user, url.searchParams.get("tenantId") ?? "", {
              cursor: url.searchParams.get("cursor"), ...(limit === undefined ? {} : { limit }),
            }));
          }
          if (method === "POST") {
            const body = await readBody(request);
            const conversation = await chat.createGroup(user, {
              tenantId: body.tenantId as string, title: body.title as string, memberIds: body.memberIds as string[],
            });
            return json(201, { conversation });
          }
          return json(405, { error: "method-not-allowed" });
        }
        if (id === "direct" && action === undefined) {
          if (method !== "POST") return json(405, { error: "method-not-allowed" });
          const body = await readBody(request);
          return json(200, { conversation: await chat.openDirect(user, { tenantId: body.tenantId as string, otherUserId: body.userId as string }) });
        }
        if (!ID.test(id)) return json(404, { error: "not-found" });
        if (action === "messages" && extra === undefined) {
          if (method === "GET") {
            const beforeSeq = intParam(url, "beforeSeq");
            const afterSeq = intParam(url, "afterSeq");
            const limit = intParam(url, "limit");
            return json(200, await chat.history(user, id, {
              ...(beforeSeq === undefined ? {} : { beforeSeq }), ...(afterSeq === undefined ? {} : { afterSeq }), ...(limit === undefined ? {} : { limit }),
            }));
          }
          if (method === "POST") {
            const body = await readBody(request);
            const result = await chat.send(user, id, { body: body.body as string, clientId: body.clientId as string });
            return json(result.created ? 201 : 200, result);
          }
          return json(405, { error: "method-not-allowed" });
        }
        if (action === "read" && extra === undefined) {
          if (method !== "POST") return json(405, { error: "method-not-allowed" });
          return json(200, await chat.markRead(user, id, (await readBody(request)).seq as number));
        }
        if (action === "members") {
          if (extra === undefined && method === "GET") return json(200, { members: await chat.members(user, id) });
          if (extra === undefined && method === "POST") return json(200, { added: await chat.addMembers(user, id, (await readBody(request)).userIds as string[]) });
          if (extra !== undefined && SEGMENT.test(extra) && method === "DELETE") return json(200, { member: await chat.removeMember(user, id, extra) });
          return extra !== undefined && !SEGMENT.test(extra) ? json(404, { error: "not-found" }) : json(405, { error: "method-not-allowed" });
        }
        return json(404, { error: "not-found" });
      }

      if (section === "messages" && id !== undefined && action !== undefined && extra === undefined) {
        if (!ID.test(id) || !/^\d{1,15}$/.test(action)) return json(404, { error: "not-found" });
        const seq = Number(action);
        if (method === "PATCH") return json(200, { message: await chat.edit(user, id, seq, (await readBody(request)).body as string) });
        if (method === "DELETE") return json(200, { message: await chat.delete(user, id, seq) });
        return json(405, { error: "method-not-allowed" });
      }

      if (section === "unread" && id === undefined) {
        if (method !== "GET") return json(405, { error: "method-not-allowed" });
        return json(200, await chat.unreadCounts(user, url.searchParams.get("tenantId") ?? ""));
      }

      if (section === "blocks" && action === undefined) {
        if (id === undefined && method === "POST") return json(200, await chat.block(user, (await readBody(request)).userId as string));
        if (id !== undefined && method === "DELETE") return json(200, await chat.unblock(user, id));
        return json(405, { error: "method-not-allowed" });
      }

      return json(404, { error: "not-found" });
    } catch (error) {
      if (error instanceof ChatError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
