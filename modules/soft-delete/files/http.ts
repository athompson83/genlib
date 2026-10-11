// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for the trash. Deleting stays in your own record routes (call
// softDelete.remove there); this handler lists and restores trash entries under one prefix.
//
//   GET    {prefix}?tenantId&entity&cursor&limit        -> 200 {entries, nextCursor}
//   POST   {prefix}/{trashId}/restore?tenantId           -> 200 {entry, records}
//                                                          409 {error: "conflict", conflicts} when a live row holds a unique value
//                                                          409 {error: "parent-deleted"}, 410 {error: "retention-expired"}
import { SoftDeleteError } from "./core.js";
import type { Actor, SoftDelete } from "./core.js";

export interface TrashHandlerOptions {
  readonly softDelete: Pick<SoftDelete, "listTrash" | "restore">;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
}

const STATUS: Record<string, number> = {
  forbidden: 403, "not-found": 404, "invalid-tenant": 400, "invalid-entity": 400, "invalid-id": 400, "already-deleted": 409,
  "retention-expired": 410, "parent-deleted": 409, conflict: 409, "invalid-cursor": 400, "invalid-limit": 400, "bad-request": 400, "too-large": 413,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ID = /^[\w.:-]{1,128}$/;

export function createTrashHandler(options: TrashHandlerOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const { softDelete } = options;

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
      const tenantId = url.searchParams.get("tenantId") ?? "";
      const [trashId, action, ...extra] = parts;
      if (extra.length > 0 || (trashId !== undefined && !ID.test(trashId))) return json(404, { error: "not-found" });

      if (trashId === undefined) {
        if (request.method !== "GET") return json(405, { error: "method-not-allowed" });
        const raw = url.searchParams.get("limit");
        if (raw !== null && raw !== "" && !/^\d{1,3}$/.test(raw)) throw new SoftDeleteError("invalid-limit", "limit must be a whole number");
        return json(200, await softDelete.listTrash(user, {
          tenantId, entity: url.searchParams.get("entity"), cursor: url.searchParams.get("cursor"),
          ...(raw === null || raw === "" ? {} : { limit: Number(raw) }),
        }));
      }
      if (action !== "restore") return json(404, { error: "not-found" });
      if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
      return json(200, await softDelete.restore(user, { tenantId, trashId }));
    } catch (error) {
      if (error instanceof SoftDeleteError) {
        return json(STATUS[error.code] ?? 400, {
          error: error.code, message: error.message, ...(error.code === "conflict" ? { conflicts: error.conflicts } : {}),
        });
      }
      throw error;
    }
  };
}
