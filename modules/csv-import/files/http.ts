// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for CSV imports. Mount it under one path prefix with
// your framework's catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   POST   {prefix}                 text/csv body (size-capped)  -> 201 preview
//   POST   {prefix}/{id}/validate   {mapping}                    -> 200 validation result
//   POST   {prefix}/{id}/commit                                  -> 200 commit result (idempotent)
//   GET    {prefix}/{id}/errors.csv                              -> 200 text/csv error report
//   DELETE {prefix}/{id}                                         -> 204
import { ImportError } from "./core.js";
import type { ImportActor, Importer, RowRecord } from "./core.js";

export interface ImportHttpOptions {
  readonly importer: Importer;
  readonly prefix: string;
  /** Resolve the signed-in user and tenant from trusted server context. Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<ImportActor | null>;
  /** Saves one valid record for this actor. Throw to record the row as failed. */
  readonly onRow: (actor: ImportActor, record: RowRecord, rowNumber: number) => Promise<void>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Upload cap in bytes. Default 5 MiB; keep it at or below the importer's maxBytes. */
  readonly maxUploadBytes?: number;
  readonly batchSize?: number;
}

const STATUS: Record<string, number> = {
  "too-large": 413, "too-many-rows": 413, "too-many-columns": 413, "invalid-csv": 400, "empty-file": 400,
  "invalid-header": 400, "invalid-mapping": 400, "missing-required-field": 400, "not-found": 404,
  "not-validated": 409, "commit-in-progress": 409, "already-committed": 409, forbidden: 403,
  "bad-request": 400, "unsupported-media-type": 415,
};

const CSV_TYPES = ["text/csv", "text/plain", "application/vnd.ms-excel"];

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function readCapped(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new ImportError("too-large", `The upload is larger than ${maxBytes} bytes`);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImportError("too-large", `The upload is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function readCsv(request: Request, maxBytes: number): Promise<string> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!CSV_TYPES.includes(type)) throw new ImportError("unsupported-media-type", "Send the file as text/csv");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readCapped(request, maxBytes));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("invalid-csv", "The file must be UTF-8 text");
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ImportError("bad-request", "Expected application/json");
  const text = new TextDecoder().decode(await readCapped(request, 64 * 1024));
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ImportError("bad-request", "Expected a JSON object");
  return value as Record<string, unknown>;
}

export function createImportHandler(options: ImportHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxUploadBytes = options.maxUploadBytes ?? 5 * 1024 * 1024;
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
    try {
      if (request.method !== "GET" && request.method !== "HEAD" && !origins.has(request.headers.get("origin") ?? "")) {
        return json(403, { error: "forbidden", message: "Origin not allowed" });
      }
      const actor = await options.authenticate(request);
      if (!actor) return json(401, { error: "unauthenticated" });
      const [id, action, extra] = parts;
      if (extra !== undefined || (id !== undefined && !/^[\w-]{1,64}$/.test(id))) return json(404, { error: "not-found" });
      if (request.method === "POST" && id === undefined) {
        return json(201, await options.importer.preview(actor, await readCsv(request, maxUploadBytes)));
      }
      if (id !== undefined && request.method === "POST" && action === "validate") {
        const body = await readJson(request);
        return json(200, await options.importer.validate(actor, id, body.mapping));
      }
      if (id !== undefined && request.method === "POST" && action === "commit") {
        const result = await options.importer.commit(actor, id, {
          onRow: (record, rowNumber) => options.onRow(actor, record, rowNumber),
          ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
        });
        return json(200, result);
      }
      if (id !== undefined && request.method === "GET" && action === "errors.csv") {
        const csv = await options.importer.exportErrors(actor, id);
        return new Response(csv, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff",
            "content-disposition": `attachment; filename="import-${id}-errors.csv"`,
          },
        });
      }
      if (id !== undefined && request.method === "DELETE" && action === undefined) {
        await options.importer.cancel(actor, id);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof ImportError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
