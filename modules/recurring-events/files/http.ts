// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for recurring events. Mount it under one prefix with your framework's
// catch-all route. Every route and every error status can be overridden (`routes`, `statusFor`) to match an
// application's existing API surface. Default routes (relative to `prefix`):
//   POST   /series                    body SeriesInput                                   -> 201 {series}
//   GET    /series/:id                                                                   -> 200 {series, overrides}
//   PATCH  /series/:id                body {scope, recurrenceId?, changes, expectedVersion?} -> 200 EditResult
//   DELETE /series/:id?scope=this|following|all&recurrenceId=&expectedVersion=          -> 200 {series | null}
//   GET    /occurrences?calendarId=&from=&to=&limit=                                    -> 200 {occurrences, truncated}
//   GET    /series/:id/occurrences?from=&to=&limit=                                     -> 200 {occurrences, truncated}
//   GET    /series/:id/ics                                                               -> 200 text/calendar
// `from`/`to` are epoch milliseconds or ISO 8601 date-times with Z or an offset. `authorize` decides every request;
// a series in a calendar the caller may not use answers 404, as if it did not exist.
import { RecurringEventsError } from "./core.js";
import type { IcsOptions, RecurringEvents, RecurringEventsErrorCode, SeriesInput } from "./core.js";

export type RecurringEventsOperation = "createSeries" | "getSeries" | "editSeries" | "deleteSeries" | "listOccurrences" | "seriesOccurrences" | "exportIcs";
export type RecurringEventsHttpErrorCode = RecurringEventsErrorCode | "no-route" | "forbidden" | "bad-request" | "invalid-json" | "method-not-allowed" | "payload-too-large" | "unsupported-media-type";

export const DEFAULT_ROUTES: Readonly<Record<RecurringEventsOperation, string>> = {
  createSeries: "POST /series",
  getSeries: "GET /series/:id",
  editSeries: "PATCH /series/:id",
  deleteSeries: "DELETE /series/:id",
  listOccurrences: "GET /occurrences",
  seriesOccurrences: "GET /series/:id/occurrences",
  exportIcs: "GET /series/:id/ics",
};

export const DEFAULT_STATUS: Readonly<Record<RecurringEventsHttpErrorCode, number>> = {
  "invalid-input": 400, "invalid-rule": 400, "unsupported-rule": 400, "bad-request": 400, "invalid-json": 400,
  forbidden: 403, "not-found": 404, "no-route": 404, "method-not-allowed": 405, "version-conflict": 409, "payload-too-large": 413,
  "unsupported-media-type": 415, "not-an-occurrence": 422, "too-many-overrides": 422,
};

export interface AccessRequest {
  readonly operation: RecurringEventsOperation;
  /** The calendar the request touches (from the body, the query or the stored series). */
  readonly calendarId: string;
  readonly seriesId: string | null;
}

export interface RecurringEventsHttpOptions {
  readonly events: RecurringEvents;
  /** Path prefix, for example "/api/calendar". Default "". */
  readonly prefix?: string;
  /** "METHOD /path" per operation; `:id` marks the series id segment. Unlisted operations keep DEFAULT_ROUTES. */
  readonly routes?: Partial<Record<RecurringEventsOperation, string>>;
  /** HTTP status per error code (400-599). Unlisted codes keep DEFAULT_STATUS. */
  readonly statusFor?: Partial<Record<RecurringEventsHttpErrorCode, number>>;
  /** Exact origins allowed for non-GET requests. */
  readonly allowedOrigins: readonly string[];
  /** Return true when the signed-in caller may perform `operation` on `calendarId`. Required. */
  readonly authorize: (request: Request, access: AccessRequest) => boolean | Promise<boolean>;
  /** Largest JSON body in bytes. Default 65,536. */
  readonly maxRequestBytes?: number;
  readonly icsOptions?: IcsOptions;
}

interface Route { readonly operation: RecurringEventsOperation; readonly method: string; readonly segments: readonly string[] }

class HttpError extends Error {
  readonly code: RecurringEventsHttpErrorCode;
  constructor(code: RecurringEventsHttpErrorCode, message: string) { super(message); this.code = code; }
}

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const OPERATIONS = Object.keys(DEFAULT_ROUTES) as RecurringEventsOperation[];

function parseRoutes(overrides: Partial<Record<RecurringEventsOperation, string>> = {}): Route[] {
  const seen = new Set<string>();
  const routes = OPERATIONS.map((operation) => {
    const spec = overrides[operation] ?? DEFAULT_ROUTES[operation];
    const m = typeof spec === "string" ? /^([A-Z]+) (\/[A-Za-z0-9._~:/-]*)$/.exec(spec) : null;
    if (!m || !METHODS.has(m[1] ?? "")) throw new TypeError(`invalid route for ${operation}: ${JSON.stringify(spec)}`);
    const segments = (m[2] ?? "").split("/").filter(Boolean);
    const needsId = !["createSeries", "listOccurrences"].includes(operation);
    if (segments.filter((s) => s === ":id").length !== (needsId ? 1 : 0) || segments.some((s) => s.startsWith(":") && s !== ":id")) {
      throw new TypeError(`invalid route for ${operation}: ${needsId ? "needs exactly one :id segment" : "takes no :id segment"}`);
    }
    const key = `${m[1]} ${segments.map((s) => (s === ":id" ? ":" : s)).join("/")}`;
    if (seen.has(key)) throw new TypeError(`duplicate route: ${spec}`);
    seen.add(key);
    return { operation, method: m[1] ?? "GET", segments };
  });
  // Literal segments win over :id when two patterns could match the same path.
  return routes.sort((a, b) => b.segments.filter((s) => s !== ":id").length - a.segments.filter((s) => s !== ":id").length);
}

function parseInstant(value: string | null, label: string): number {
  if (value !== null && /^-?\d{1,15}$/.test(value)) return Number(value);
  if (value !== null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  throw new RecurringEventsError("invalid-input", `${label} must be epoch milliseconds or an ISO 8601 date-time with a zone`);
}

function optionalInt(value: string | null, label: string): number | undefined {
  if (value === null || value === "") return undefined;
  if (!/^\d{1,9}$/.test(value)) throw new RecurringEventsError("invalid-input", `${label} must be a positive integer`);
  return Number(value);
}

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new HttpError("payload-too-large", "Body too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError("payload-too-large", "Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createRecurringEventsHandler(options: RecurringEventsHttpOptions): (request: Request) => Promise<Response> {
  const prefix = (options.prefix ?? "").replace(/\/+$/, "");
  const routes = parseRoutes(options.routes);
  const statuses: Record<string, number> = { ...DEFAULT_STATUS };
  for (const [code, status] of Object.entries(options.statusFor ?? {})) {
    if (!Number.isInteger(status) || (status as number) < 400 || (status as number) > 599) throw new TypeError(`invalid status for ${code}: ${String(status)}`);
    statuses[code] = status as number;
  }
  if (typeof options.authorize !== "function") throw new TypeError("authorize is required");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 65_536;
  const { events } = options;

  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });
  const failure = (code: RecurringEventsHttpErrorCode, message: string): Response => json(statuses[code] ?? 500, { error: code, message });

  async function body(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError("unsupported-media-type", "Expected application/json");
    let value: unknown;
    try { value = JSON.parse(await readBounded(request, maxRequest)); } catch (error) {
      if (error instanceof SyntaxError) throw new HttpError("invalid-json", "Malformed JSON body");
      throw error;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  function match(segments: string[], method: string): { route: Route; id: string | null } | "method" | null {
    let pathMatched = false;
    for (const route of routes) {
      if (route.segments.length !== segments.length) continue;
      let id: string | null = null;
      let ok = true;
      for (let i = 0; i < segments.length && ok; i++) {
        const pattern = route.segments[i] ?? "", actual = segments[i] ?? "";
        if (pattern === ":id") {
          try { id = decodeURIComponent(actual); } catch { throw new HttpError("bad-request", "Malformed path"); }
          ok = id.length > 0 && id.length <= 200;
        } else ok = pattern === actual;
      }
      if (!ok) continue;
      if (route.method === method) return { route, id };
      pathMatched = true;
    }
    return pathMatched ? "method" : null;
  }

  /** The series' calendar, or not-found when it is missing or the caller may not use it. */
  async function guard(request: Request, operation: RecurringEventsOperation, seriesId: string): Promise<void> {
    const found = await events.getSeries(seriesId);
    if (!found || !(await options.authorize(request, { operation, calendarId: found.series.calendarId, seriesId }))) {
      throw new RecurringEventsError("not-found", "Series not found");
    }
  }

  return async (request) => {
    const url = new URL(request.url);
    try {
      if (prefix && url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return failure("no-route", "Not found");
      const segments = url.pathname.slice(prefix.length).split("/").filter(Boolean);
      const method = request.method.toUpperCase();
      const found = match(segments, method);
      if (found === null) return failure("no-route", "Not found");
      if (found === "method") return failure("method-not-allowed", "Method not allowed");
      if (method !== "GET" && !origins.has(request.headers.get("origin") ?? "")) return failure("forbidden", "Origin not allowed");
      const { route, id } = found;
      const query = url.searchParams;
      const seriesId = id ?? "";
      switch (route.operation) {
        case "createSeries": {
          const input = await body(request);
          const calendarId = typeof input.calendarId === "string" ? input.calendarId : "";
          if (!(await options.authorize(request, { operation: route.operation, calendarId, seriesId: null }))) return failure("forbidden", "Not allowed");
          return json(201, { series: await events.createSeries(input as unknown as SeriesInput) });
        }
        case "listOccurrences": {
          const calendarId = query.get("calendarId") ?? "";
          if (!(await options.authorize(request, { operation: route.operation, calendarId, seriesId: null }))) return failure("forbidden", "Not allowed");
          const limit = optionalInt(query.get("limit"), "limit");
          return json(200, await events.listOccurrences({ calendarId, from: parseInstant(query.get("from"), "from"), to: parseInstant(query.get("to"), "to"), ...(limit === undefined ? {} : { limit }) }));
        }
        case "getSeries": {
          await guard(request, route.operation, seriesId);
          const result = await events.getSeries(seriesId);
          if (!result) return failure("not-found", "Series not found");
          return json(200, result);
        }
        case "seriesOccurrences": {
          await guard(request, route.operation, seriesId);
          const limit = optionalInt(query.get("limit"), "limit");
          return json(200, await events.seriesOccurrences(seriesId, { from: parseInstant(query.get("from"), "from"), to: parseInstant(query.get("to"), "to"), ...(limit === undefined ? {} : { limit }) }));
        }
        case "editSeries": {
          const edit = await body(request);
          await guard(request, route.operation, seriesId);
          return json(200, await events.editSeries(seriesId, edit as unknown as Parameters<RecurringEvents["editSeries"]>[1]));
        }
        case "deleteSeries": {
          await guard(request, route.operation, seriesId);
          const expectedVersion = optionalInt(query.get("expectedVersion"), "expectedVersion");
          const recurrenceId = query.get("recurrenceId");
          const scope = query.get("scope") ?? "";
          const series = await events.deleteOccurrences(seriesId, {
            scope: scope as "this" | "following" | "all",
            ...(recurrenceId === null ? {} : { recurrenceId }),
            ...(expectedVersion === undefined ? {} : { expectedVersion }),
          });
          return json(200, { series });
        }
        case "exportIcs": {
          await guard(request, route.operation, seriesId);
          const text = await events.exportIcs(seriesId, options.icsOptions ?? {});
          const filename = seriesId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "event";
          return new Response(text, {
            status: 200,
            headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${filename}.ics"`, "cache-control": "no-store", "x-content-type-options": "nosniff" },
          });
        }
      }
    } catch (error) {
      if (error instanceof RecurringEventsError || error instanceof HttpError) return failure(error.code, error.message);
      throw error;
    }
  };
}
