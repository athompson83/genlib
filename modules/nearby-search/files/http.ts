// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for nearby search. Mount it under one prefix with your framework's
// catch-all route. Every route needs an authenticated viewer from your `authenticate(request)`; the viewer's tenant
// comes from your session, never from the request. Default routes (override with `routes`):
//   GET    {prefix}/search?lat=&lng=&radius=&limit=&cursor=   -> 200 {results, nextCursor}
//   PUT    {prefix}/places/:id  {lat, lng, visibility?, label?} -> 201 created / 200 updated {id, created}
//   DELETE {prefix}/places/:id                                 -> 204
// Errors are {error, message} with statuses from `statusFor` (defaults below). Responses carry cache-control:
// no-store because they contain location data.
import { NearbySearchError } from "./core.js";
import type { NearbySearch, Viewer } from "./core.js";

export interface NearbyRoutes {
  /** Path of the search route under the prefix (default "/search"). */
  readonly search?: string;
  /** Path of the place route under the prefix; must contain one ":id" segment (default "/places/:id"). */
  readonly place?: string;
}

export const DEFAULT_STATUS: Readonly<Record<string, number>> = {
  "invalid-coordinates": 400, "invalid-radius": 400, "invalid-cursor": 400, "invalid-input": 400,
  "bad-request": 400, "invalid-json": 400, unauthenticated: 401, forbidden: 403, "forbidden-origin": 403,
  "not-found": 404, "no-route": 404, "method-not-allowed": 405, "rate-limited": 429,
};

export interface NearbyHttpOptions {
  readonly nearby: NearbySearch;
  readonly prefix: string;
  /** The signed-in viewer from trusted server context (session or verified token), or null for 401. */
  readonly authenticate: (request: Request) => Viewer | null | Promise<Viewer | null>;
  /** Exact allowed origins for PUT and DELETE. Set it whenever authentication uses cookies. */
  readonly allowedOrigins?: readonly string[];
  /** Return false to refuse with 429. Called with `search:<tenant>:<user>` or `write:<tenant>:<user>`. */
  readonly rateLimit?: (key: string) => boolean | Promise<boolean>;
  readonly routes?: NearbyRoutes;
  /** Error code -> HTTP status, merged over DEFAULT_STATUS. */
  readonly statusFor?: Readonly<Partial<Record<string, number>>>;
  /** Largest accepted JSON body in bytes. Default 4,096. */
  readonly maxRequestBytes?: number;
}

class HttpError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function placeMatcher(route: string): RegExp {
  const parts = normalizePath(route).split("/");
  if (parts.filter((part) => part === ":id").length !== 1) throw new RangeError('routes.place must contain one ":id" segment');
  const source = parts.map((part) => (part === ":id" ? "([^/]+)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
  return new RegExp(`^${source}$`);
}

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new HttpError("bad-request", "Body too large");
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
      throw new HttpError("bad-request", "Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

const COORD = /^-?\d{1,3}(\.\d{1,15})?$/;
const RADIUS = /^\d{1,9}(\.\d{1,6})?$/;
const LIMIT = /^\d{1,4}$/;

function numberParam(url: URL, name: string, pattern: RegExp, code: "invalid-coordinates" | "invalid-radius" | "invalid-input"): number {
  const raw = url.searchParams.get(name);
  if (raw === null || !pattern.test(raw)) throw new NearbySearchError(code, `Query parameter ${name} is missing or malformed`);
  return Number(raw);
}

export function createNearbySearchHandler(options: NearbyHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const searchPath = normalizePath(options.routes?.search ?? "/search");
  const placePattern = placeMatcher(options.routes?.place ?? "/places/:id");
  const statuses: Record<string, number> = { ...DEFAULT_STATUS };
  for (const [code, status] of Object.entries(options.statusFor ?? {})) {
    if (status === undefined) continue;
    if (!Number.isInteger(status) || status < 400 || status > 599) throw new RangeError(`statusFor.${code} must be an HTTP error status`);
    statuses[code] = status;
  }
  const origins = options.allowedOrigins ? new Set(options.allowedOrigins) : null;
  const maxRequest = options.maxRequestBytes ?? 4096;
  const { nearby } = options;

  const fail = (code: string, message: string): Response => json(statuses[code] ?? 400, { error: code, message });

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError("bad-request", "Expected application/json");
    const text = await readBounded(request, maxRequest);
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new HttpError("invalid-json", "Malformed JSON body"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return fail("no-route", "Not found");
    const rest = normalizePath(url.pathname.slice(prefix.length));
    const placeMatch = placePattern.exec(rest);
    const route = rest === searchPath ? "search" : placeMatch ? "place" : null;
    if (!route) return fail("no-route", "Not found");
    const allowed = route === "search" ? ["GET"] : ["PUT", "DELETE"];
    if (!allowed.includes(request.method)) return fail("method-not-allowed", "Method not allowed");
    try {
      const viewer = await options.authenticate(request);
      if (!viewer) return fail("unauthenticated", "Sign in required");
      if (route === "place" && origins && !origins.has(request.headers.get("origin") ?? "")) return fail("forbidden-origin", "Origin not allowed");
      const limitKey = `${route === "search" ? "search" : "write"}:${viewer.tenantId}:${viewer.userId}`;
      if (options.rateLimit && !(await options.rateLimit(limitKey))) return fail("rate-limited", "Too many requests");

      if (route === "search") {
        const lat = numberParam(url, "lat", COORD, "invalid-coordinates");
        const lng = numberParam(url, "lng", COORD, "invalid-coordinates");
        const radiusMeters = numberParam(url, "radius", RADIUS, "invalid-radius");
        const limit = url.searchParams.has("limit") ? numberParam(url, "limit", LIMIT, "invalid-input") : undefined;
        const cursor = url.searchParams.get("cursor");
        const page = await nearby.search(viewer, {
          lat, lng, radiusMeters, ...(limit === undefined ? {} : { limit }), ...(cursor === null ? {} : { cursor }),
        });
        return json(200, page);
      }

      let id: string;
      try { id = decodeURIComponent(placeMatch?.[1] ?? ""); } catch { throw new HttpError("bad-request", "Malformed place id"); }
      if (request.method === "DELETE") {
        await nearby.remove(viewer, id);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
      const body = await readBody(request);
      const result = await nearby.upsert(viewer, {
        id, lat: body.lat as number, lng: body.lng as number,
        ...(body.visibility === undefined ? {} : { visibility: body.visibility as "public" }),
        ...(body.label === undefined ? {} : { label: body.label as string }),
      });
      return json(result.created ? 201 : 200, result);
    } catch (error) {
      if (error instanceof NearbySearchError || error instanceof HttpError) return fail(error.code, error.message);
      throw error;
    }
  };
}
