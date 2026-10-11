// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for site-search. Mount it under one path prefix with your framework's
// catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET    {prefix}?tenantId&q&f.<attr>=..&sort&cursor&limit&facets=a,b -> 200 {hits, facets, total, cursor}
//   PUT    {prefix}/{id}  {tenantId, fields, attrs?, visibility?}         -> 200 {id, updatedAt}
//   DELETE {prefix}/{id}?tenantId                                       -> 200 {removed: true}
// Filters: keyword f.color=red&f.color=blue (any of), boolean f.inStock=true, number or date ranges
// f.price=10..100, f.price=10.., f.publishedAt=..2026-06-30 (inclusive) or a single value for an exact match.
// Highlights wrap matches in <mark></mark> around HTML-escaped text.
import { SearchError } from "./core.js";
import type { Actor, FilterInput, Search } from "./core.js";

export interface SearchHttpOptions {
  readonly search: Search;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; PUT and DELETE without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in characters. Default 262,144. */
  readonly maxRequestBytes?: number;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "not-found": 404, "bad-request": 400,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ID = /^[\w.:@-]{1,128}$/;

function rangeFilter(raw: string, date: boolean): FilterInput {
  const convert = (value: string): number | string => (date && !/^-?\d+$/.test(value) ? value : Number(value));
  const split = raw.indexOf("..");
  if (split === -1) {
    if (raw === "") throw new SearchError("invalid-filter", "Empty range");
    return { gte: convert(raw), lte: convert(raw) };
  }
  const low = raw.slice(0, split);
  const high = raw.slice(split + 2);
  if (low === "" && high === "") throw new SearchError("invalid-filter", "Empty range");
  return { ...(low === "" ? {} : { gte: convert(low) }), ...(high === "" ? {} : { lte: convert(high) }) };
}

export function createSearchHandler(options: SearchHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 262_144;
  const { search } = options;
  const types = search.schema.filters;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new SearchError("bad-request", "Expected application/json");
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > maxRequest) throw new SearchError("bad-request", "Body too large");
    const body = await request.text();
    if (body.length > maxRequest) throw new SearchError("bad-request", "Body too large");
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SearchError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  function filtersFrom(url: URL): Record<string, FilterInput> {
    const filters: Record<string, FilterInput> = {};
    const names = new Set([...url.searchParams.keys()].filter((key) => key.startsWith("f.")));
    for (const key of names) {
      const attr = key.slice(2);
      const values = url.searchParams.getAll(key);
      const type = Object.hasOwn(types, attr) ? types[attr] : undefined;
      if (type === "keyword") filters[attr] = values.length === 1 ? values[0]! : values;
      else if (values.length !== 1) throw new SearchError("invalid-filter", `${attr} accepts one value`);
      else if (type === "number" || type === "date") filters[attr] = rangeFilter(values[0]!, type === "date");
      else filters[attr] = values[0]!; // boolean, or undeclared (core rejects it)
    }
    return filters;
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
      if (parts.length > 1) return json(404, { error: "not-found" });
      let id: string | undefined;
      if (parts.length === 1) {
        try { id = decodeURIComponent(parts[0]!); } catch { return json(404, { error: "not-found" }); }
        if (!ID.test(id)) return json(404, { error: "not-found" });
      }
      const query = url.searchParams;

      if (id === undefined) {
        if (request.method !== "GET") return json(405, { error: "method-not-allowed" });
        const rawLimit = query.get("limit");
        if (rawLimit !== null && rawLimit !== "" && !/^\d{1,3}$/.test(rawLimit)) throw new SearchError("invalid-limit", "limit must be a whole number");
        const facets = (query.get("facets") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
        const sort = query.get("sort");
        const cursor = query.get("cursor");
        return json(200, await search.query(user, {
          tenantId: query.get("tenantId") ?? "",
          q: query.get("q") ?? "",
          filters: filtersFrom(url),
          facets,
          ...(sort ? { sort } : {}),
          ...(cursor ? { cursor } : {}),
          ...(rawLimit ? { limit: Number(rawLimit) } : {}),
        }));
      }
      if (request.method === "PUT") {
        const body = await readBody(request);
        const fields = body.fields && typeof body.fields === "object" ? body.fields as Record<string, unknown> : null;
        if (!fields) throw new SearchError("invalid-field", "fields must be an object");
        const attrs = body.attrs && typeof body.attrs === "object" ? body.attrs as Record<string, unknown> : undefined;
        const visibility = Array.isArray(body.visibility) ? body.visibility as string[] : undefined;
        if (body.visibility !== undefined && visibility === undefined) throw new SearchError("invalid-visibility", "visibility must be a list");
        return json(200, await search.index(user, {
          tenantId: typeof body.tenantId === "string" ? body.tenantId : "", id, fields,
          ...(attrs ? { attrs } : {}), ...(visibility ? { visibility } : {}),
        }));
      }
      if (request.method === "DELETE") {
        await search.remove(user, query.get("tenantId") ?? "", id);
        return json(200, { removed: true });
      }
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof SearchError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
