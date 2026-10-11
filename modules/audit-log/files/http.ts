// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for reading a tenant's audit log. Recording happens in your own server
// code through audit.record(tx, entry); this handler only reads.
//
//   GET {prefix}?tenantId&actorId&action&actionPrefix&from&to&cursor&limit   -> 200 {entries, nextCursor}
//   GET {prefix}/export?format=csv|ndjson&tenantId&actorId&action&from&to   -> 200 streamed attachment
//
// `from`/`to` accept epoch milliseconds or an ISO 8601 date-time. Signed-out callers get 401; callers that are not
// administrators of the tenant get 403. Responses carry cache-control: no-store.
import { AuditLogError } from "./core.js";
import type { Actor, AuditLog } from "./core.js";

export interface AuditHandlerOptions {
  readonly audit: Pick<AuditLog<never>, "query" | "export">;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "invalid-tenant": 400, "invalid-filter": 400, "invalid-range": 400, "invalid-cursor": 400,
  "invalid-limit": 400, "invalid-format": 400,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function timeParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  if (/^\d{1,16}$/.test(raw)) return Number(raw);
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(raw)) {
    const value = Date.parse(raw);
    if (!Number.isNaN(value)) return value;
  }
  throw new AuditLogError("invalid-range", `${name} must be epoch milliseconds or an ISO date-time`);
}

function filterParams(url: URL) {
  const text = (name: string) => {
    const value = url.searchParams.get(name);
    return value === null || value === "" ? {} : { [name]: value };
  };
  const from = timeParam(url, "from");
  const to = timeParam(url, "to");
  return {
    tenantId: url.searchParams.get("tenantId") ?? "",
    ...text("actorId"), ...text("action"), ...text("actionPrefix"),
    ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }),
  };
}

export function createAuditLogHandler(options: AuditHandlerOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const { audit } = options;

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const rest = url.pathname.slice(prefix.length).replace(/^\/+/, "");
    if (rest !== "" && rest !== "export") return json(404, { error: "not-found" });
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "method-not-allowed" }), {
        status: 405, headers: { "content-type": "application/json", "cache-control": "no-store", allow: "GET" },
      });
    }
    try {
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      const filter = filterParams(url);
      if (rest === "") {
        const rawLimit = url.searchParams.get("limit");
        if (rawLimit !== null && rawLimit !== "" && !/^\d{1,3}$/.test(rawLimit)) throw new AuditLogError("invalid-limit", "limit must be a whole number");
        const limit = rawLimit === null || rawLimit === "" ? undefined : Number(rawLimit);
        return json(200, await audit.query(user, { ...filter, cursor: url.searchParams.get("cursor"), ...(limit === undefined ? {} : { limit }) }));
      }
      const format = url.searchParams.get("format") ?? "csv";
      if (format !== "csv" && format !== "ndjson") throw new AuditLogError("invalid-format", "format must be csv or ndjson");
      const chunks = await audit.export(user, { ...filter, format });
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await chunks.next();
            if (next.done) controller.close();
            else controller.enqueue(encoder.encode(next.value));
          } catch (error) {
            controller.error(error);
          }
        },
        async cancel() {
          await chunks.return(undefined);
        },
      });
      const filename = `audit-${filter.tenantId.replace(/[^\w.-]/g, "_")}.${format === "csv" ? "csv" : "ndjson"}`;
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof AuditLogError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      throw error;
    }
  };
}
