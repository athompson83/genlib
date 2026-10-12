// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter that wraps one list endpoint with keyset pagination. Mount it with your
// framework's route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET {prefix}{routes.list}?cursor=&limit=&sort=&<declared filters>
//     -> 200 {items, nextCursor, prevCursor, limit, sort} with an RFC 8288 Link header (rel="next" / rel="prev")
// The scope (tenant, user) comes from your `scope(request)` hook, never from the query string. Only declared
// filters are read from the query; other parameters are ignored and never bound into the cursor.
import { formatLinkHeader, KeysetError } from "./core.js";
import type { FilterScalar, FilterValue, KeysetErrorCode, KeysetPager, Scope } from "./core.js";

export interface FilterSpec {
  readonly type: "string" | "number" | "boolean";
  /** Allowed values (strings only). */
  readonly values?: readonly string[];
  /** Accept the parameter repeated (?status=a&status=b), matched as "any of". Default false. */
  readonly multiple?: boolean;
}

export type ListErrorCode = KeysetErrorCode | "unauthorized" | "not-found" | "method-not-allowed";

export interface KeysetListHttpOptions<T> {
  readonly pager: KeysetPager<T>;
  /** Path prefix. Default "". */
  readonly prefix?: string;
  /** Path of each operation under the prefix. Default { list: "" } (the prefix itself). */
  readonly routes?: { readonly list?: string };
  /** HTTP status for each error code, merged over the defaults (400 for cursor/limit/sort/filter errors). */
  readonly statusFor?: Partial<Record<ListErrorCode, number>>;
  /** Query parameter names. Default { cursor: "cursor", limit: "limit", sort: "sort" }. */
  readonly params?: { readonly cursor?: string; readonly limit?: string; readonly sort?: string };
  /** Trusted scope for this request (from your session or API key); null or undefined answers 401. */
  readonly scope: (request: Request) => Scope | null | undefined | Promise<Scope | null | undefined>;
  /** Filters accepted from the query string. */
  readonly filters?: Readonly<Record<string, FilterSpec>>;
  /** Maps each item to its JSON form. Default: the item unchanged. */
  readonly serialize?: (item: T) => unknown;
  /** Emit the Link header. Default true. */
  readonly linkHeader?: boolean;
  /** Public origin for Link URLs when the app runs behind a proxy, e.g. https://api.example.com. */
  readonly publicOrigin?: string;
}

const DEFAULT_STATUS: Record<ListErrorCode, number> = {
  "malformed-cursor": 400, "invalid-signature": 400, "expired-cursor": 400, "scope-mismatch": 400,
  "invalid-limit": 400, "invalid-sort": 400, "invalid-filter": 400,
  unauthorized: 401, "not-found": 404, "method-not-allowed": 405,
};

const normalizePath = (path: string): string => {
  const collapsed = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return collapsed === "" ? "/" : collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
};

function parseFilter(name: string, spec: FilterSpec, raw: string[]): FilterValue {
  if (!spec.multiple && raw.length > 1) throw new KeysetError("invalid-filter", `${name} may appear once`);
  if (raw.length > 100) throw new KeysetError("invalid-filter", `Too many values for ${name}`);
  const values = raw.map((text): FilterScalar => {
    if (spec.type === "number") {
      if (!/^-?\d{1,15}(\.\d{1,15})?$/.test(text)) throw new KeysetError("invalid-filter", `${name} must be a number`);
      return Number(text);
    }
    if (spec.type === "boolean") {
      if (text !== "true" && text !== "false") throw new KeysetError("invalid-filter", `${name} must be true or false`);
      return text === "true";
    }
    if (text.length > 200 || (spec.values && !spec.values.includes(text))) throw new KeysetError("invalid-filter", `Invalid ${name}`);
    return text;
  });
  return spec.multiple ? values : (values[0] as FilterScalar);
}

export function createKeysetListHandler<T>(options: KeysetListHttpOptions<T>): (request: Request) => Promise<Response> {
  const listPath = normalizePath(`${options.prefix ?? ""}/${options.routes?.list ?? ""}`);
  const statusFor = { ...DEFAULT_STATUS, ...options.statusFor };
  const names = { cursor: "cursor", limit: "limit", sort: "sort", ...options.params };
  const filterSpecs = options.filters ?? {};
  const serialize = options.serialize ?? ((item: T) => item);
  const publicOrigin = options.publicOrigin ? new URL(options.publicOrigin).origin : null;
  const headers = { "content-type": "application/json", "cache-control": "private, no-store" };

  const error = (code: ListErrorCode, message: string, extra: Record<string, string> = {}): Response =>
    new Response(JSON.stringify({ error: code, message }), { status: statusFor[code], headers: { ...headers, ...extra } });

  return async (request) => {
    const url = new URL(request.url);
    if (normalizePath(url.pathname) !== listPath) return error("not-found", "Not found");
    if (request.method !== "GET" && request.method !== "HEAD") return error("method-not-allowed", "Use GET", { allow: "GET, HEAD" });
    const scope = await options.scope(request);
    if (!scope) return error("unauthorized", "Sign in required");
    try {
      const query = url.searchParams;
      const filters: Record<string, FilterValue> = {};
      for (const [name, spec] of Object.entries(filterSpecs)) {
        const raw = query.getAll(name);
        if (raw.length) filters[name] = parseFilter(name, spec, raw);
      }
      const cursor = query.get(names.cursor);
      const sort = query.get(names.sort);
      const limit = query.get(names.limit);
      const page = await options.pager.page({
        scope, filters,
        ...(cursor ? { cursor } : {}), ...(sort ? { sort } : {}), ...(limit !== null ? { limit } : {}),
      });
      const linkFor = (value: string | null): string | null => {
        if (!value) return null;
        const target = new URL(url.href);
        if (publicOrigin) {
          const origin = new URL(publicOrigin);
          target.protocol = origin.protocol;
          target.host = origin.host;
        }
        target.searchParams.set(names.cursor, value);
        if (!sort) target.searchParams.delete(names.sort);
        return target.href;
      };
      const responseHeaders: Record<string, string> = { ...headers };
      const link = options.linkHeader === false ? null : formatLinkHeader({ next: linkFor(page.nextCursor), prev: linkFor(page.prevCursor) });
      if (link) responseHeaders.link = link;
      const body = JSON.stringify({
        items: page.items.map(serialize), nextCursor: page.nextCursor, prevCursor: page.prevCursor, limit: page.limit, sort: page.sort,
      });
      return new Response(request.method === "HEAD" ? null : body, { status: 200, headers: responseHeaders });
    } catch (caught) {
      if (caught instanceof KeysetError) return error(caught.code, caught.message);
      throw caught;
    }
  };
}
