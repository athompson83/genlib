// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for rbac. Mount it under one path prefix with your framework's
// catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET    {prefix}/me/permissions?tenantId=&resourceId=        -> 200 {roles, allow, deny}
//   GET    {prefix}/assignments?tenantId=&subjectId=&cursor=&limit= -> 200 {assignments, nextCursor}
//   POST   {prefix}/assignments  {tenantId, subjectId, role, resourceId?, expiresAt?} -> 201 created | 200 existing
//   DELETE {prefix}/assignments  {tenantId, subjectId, role, resourceId?}            -> 200 {removed}
// requirePermission wraps any other Fetch handler with a permission check.
import { RbacError } from "./core.js";
import type { Rbac, RbacContext } from "./core.js";

export interface RbacHttpOptions {
  readonly rbac: Rbac;
  readonly prefix: string;
  /** Resolve the signed-in subject from trusted server context (session cookie, verified JWT); null when signed out. */
  readonly authenticate: (request: Request) => Promise<{ subjectId: string } | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
}

const STATUS: Record<string, number> = {
  forbidden: 403, escalation: 403, "last-owner": 409, "invalid-role": 400, "invalid-tenant": 400, "invalid-subject": 400,
  "invalid-resource": 400, "invalid-expiry": 400, "invalid-cursor": 400, "invalid-limit": 400, "bad-request": 400,
};

const MAX_BODY = 4096;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new RbacError("bad-request", "Expected application/json");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY) throw new RbacError("bad-request", "Body too large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new RbacError("bad-request", "Body too large");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RbacError("bad-request", "Expected a JSON object");
  return value as Record<string, unknown>;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const optionalText = (value: unknown): string | null => (value === undefined || value === null || value === "" ? null : text(value) || "\u0000");

export function createRbacHandler(options: RbacHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const { rbac } = options;
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
      const query = url.searchParams;
      if (rest === "me/permissions" && request.method === "GET") {
        const tenantId = query.get("tenantId") ?? "";
        const resourceId = query.get("resourceId") || null;
        const result = await rbac.permissionsFor(user.subjectId, { tenantId, resourceId });
        return json(200, { tenantId, resourceId, ...result });
      }
      if (rest === "assignments") {
        if (request.method === "GET") {
          const limitText = query.get("limit");
          const limit = limitText === null ? undefined : /^\d{1,4}$/.test(limitText) ? Number(limitText) : NaN;
          return json(200, await rbac.listAssignments(user.subjectId, query.get("tenantId") ?? "", {
            subjectId: query.get("subjectId"), cursor: query.get("cursor"), ...(limit === undefined ? {} : { limit }),
          }));
        }
        if (request.method === "POST") {
          const body = await readBody(request);
          const expiresAt = body.expiresAt === undefined || body.expiresAt === null ? null : body.expiresAt;
          if (expiresAt !== null && typeof expiresAt !== "number") throw new RbacError("invalid-expiry", "expiresAt must be a number");
          const result = await rbac.grant(user.subjectId, {
            tenantId: text(body.tenantId), subjectId: text(body.subjectId), role: text(body.role),
            resourceId: optionalText(body.resourceId), expiresAt,
          });
          return json(result.created ? 201 : 200, result);
        }
        if (request.method === "DELETE") {
          const body = await readBody(request);
          return json(200, await rbac.revoke(user.subjectId, {
            tenantId: text(body.tenantId), subjectId: text(body.subjectId), role: text(body.role), resourceId: optionalText(body.resourceId),
          }));
        }
        return json(405, { error: "method-not-allowed" });
      }
      return rest === "me/permissions" ? json(405, { error: "method-not-allowed" }) : json(404, { error: "not-found" });
    } catch (error) {
      if (error instanceof RbacError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}

export type PermissionContext = RbacContext & { readonly subjectId: string };

/**
 * Wraps a Fetch handler so it runs only when the request's subject holds `permission`. `getCtx` resolves the
 * subject from trusted server context and the tenant (and optional resource) from the route; return null when
 * signed out (401). A denied or malformed check returns 403 JSON and never calls the handler.
 */
export function requirePermission(
  rbac: Rbac,
  permission: string,
  getCtx: (request: Request) => Promise<PermissionContext | null>,
): (handler: (request: Request) => Promise<Response>) => (request: Request) => Promise<Response> {
  return (handler) => async (request) => {
    const ctx = await getCtx(request);
    if (!ctx) return json(401, { error: "unauthenticated" });
    const decision = await rbac.can(ctx.subjectId, permission, { tenantId: ctx.tenantId, resourceId: ctx.resourceId ?? null });
    if (!decision.allowed) return json(403, { error: "forbidden", reason: decision.reason });
    return handler(request);
  };
}
