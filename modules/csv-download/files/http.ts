// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for CSV exports. Mount it under one path prefix with your framework's
// catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers). Default routes:
//   GET {prefix}/export?columns=a,b&filename=...   -> 200 streamed text/csv attachment
//   GET {prefix}/columns                           -> 200 {columns: [{key, header}], defaults: [key]}
// Paths (`routes`) and error statuses (`statusFor`) are configurable. Errors are JSON {error, message}; every
// response carries cache-control: no-store. The requester always comes from `authenticate`, never the query.
import { CsvExportError } from "./core.js";
import type { CsvExportCode, CsvExporter, ExportRequester } from "./core.js";

export interface CsvExportRoutes {
  /** Default "/export". */
  readonly export?: string;
  /** Default "/columns". */
  readonly columns?: string;
}

export type CsvExportHttpCode = CsvExportCode | "unauthenticated" | "not-found" | "method-not-allowed";

export const DEFAULT_STATUS: Readonly<Record<CsvExportHttpCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  "invalid-columns": 400,
  "invalid-request": 400,
  "not-found": 404,
  "method-not-allowed": 405,
  "limit-exceeded": 413,
  cancelled: 400,
  "invalid-cell": 500,
  "source-error": 500,
};

export interface CsvExportHttpOptions<Row> {
  readonly exporter: CsvExporter<Row>;
  readonly prefix: string;
  /** Resolve the signed-in user and tenant from trusted server context. Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<ExportRequester | null> | ExportRequester | null;
  readonly routes?: CsvExportRoutes;
  /** Overrides for the status of each error code. */
  readonly statusFor?: Partial<Record<CsvExportHttpCode, number>>;
  /**
   * Builds the filter passed to your row source from the URL. Validate here and throw
   * CsvExportError("invalid-request", ...) for bad input. Default: no filter.
   */
  readonly parseFilter?: (url: URL, requester: ExportRequester) => unknown;
  /** Server-side observer for failures (log it); details are never sent to the client. */
  readonly onError?: (error: unknown) => void;
}

const MAX_COLUMN_NAMES = 100;
const SERVER_CODES = new Set<CsvExportHttpCode>(["source-error", "invalid-cell"]);

function routePath(value: string | undefined, fallback: string): string {
  const path = value ?? fallback;
  if (!path.startsWith("/") || path.length > 200) throw new RangeError(`Route ${path} must start with /`);
  return path.replace(/\/+$/, "") || "/";
}

export function createCsvExportHandler<Row>(options: CsvExportHttpOptions<Row>): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const exportPath = prefix + routePath(options.routes?.export, "/export");
  const columnsPath = prefix + routePath(options.routes?.columns, "/columns");
  if (exportPath === columnsPath) throw new RangeError("The export and columns routes must differ");
  const status: Record<CsvExportHttpCode, number> = { ...DEFAULT_STATUS, ...options.statusFor };
  for (const value of Object.values(status)) {
    if (!Number.isInteger(value) || value < 400 || value > 599) throw new RangeError("statusFor values must be 4xx or 5xx");
  }
  const { exporter } = options;

  const fail = (code: CsvExportHttpCode, message: string): Response =>
    new Response(JSON.stringify({ error: code, message }), {
      status: status[code], headers: { "content-type": "application/json", "cache-control": "no-store" },
    });

  function parseColumns(url: URL): string[] | undefined {
    const values = url.searchParams.getAll("columns");
    if (values.length === 0) return undefined;
    const names = values.flatMap((value) => value.split(",")).map((name) => name.trim()).filter(Boolean);
    if (names.length > MAX_COLUMN_NAMES) throw new CsvExportError("invalid-request", "Too many column names");
    return names;
  }

  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path !== exportPath && path !== columnsPath) return fail("not-found", "Not found");
    if (request.method !== "GET") return fail("method-not-allowed", "Use GET");
    try {
      const requester = await options.authenticate(request);
      if (!requester) return fail("unauthenticated", "Sign in to export");
      if (path === columnsPath) {
        return new Response(JSON.stringify({ columns: exporter.columnsFor(requester), defaults: exporter.defaultsFor(requester) }), {
          status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      const columns = parseColumns(url);
      const filter = options.parseFilter?.(url, requester);
      const filename = url.searchParams.get("filename")?.slice(0, 200);
      const result = await exporter.exportCsv(
        requester,
        { ...(columns ? { columns } : {}), ...(filter === undefined ? {} : { filter }), ...(filename ? { filename } : {}) },
        { signal: request.signal },
      );
      return new Response(result.stream, { status: 200, headers: result.headers });
    } catch (error) {
      if (error instanceof CsvExportError) {
        if (SERVER_CODES.has(error.code)) {
          options.onError?.(error);
          return fail(error.code, "The export failed");
        }
        return fail(error.code, error.message);
      }
      options.onError?.(error);
      return fail("source-error", "The export failed");
    }
  };
}
