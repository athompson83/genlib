// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter that resolves slugs from URLs. Mount it with your framework's
// catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   GET|HEAD {prefix}{routes.resolve}   default route "/:slug"
//     -> 200 {entityId, slug}                      the slug is current
//     -> 301 Location: <same route, current slug>  the slug is old or differently cased (query string kept)
//     -> 404 {error: "not-found"}                  unknown slug, other tenant, or path outside the route
// The scope (tenant + collection) comes from `scopeFor`, which must read trusted server context (the session, the
// verified host) and may use route params such as ":collection". It never comes from the query string.
import { SlugError } from "./core.js";
import type { UrlSlugs } from "./core.js";

export type SlugHttpErrorCode = "not-found" | "invalid-slug" | "forbidden" | "method-not-allowed";

export interface SlugRoutes {
  /** Path pattern under the prefix with ":name" segments; must contain ":slug". Default "/:slug". */
  readonly resolve?: string;
}

export interface SlugResolveHttpOptions {
  readonly slugs: UrlSlugs;
  /** Path prefix, e.g. "/posts". Default "". */
  readonly prefix?: string;
  readonly routes?: SlugRoutes;
  /** Error code -> HTTP status; merged over the defaults (not-found 404, invalid-slug 400, forbidden 403, method-not-allowed 405). */
  readonly statusFor?: Partial<Record<SlugHttpErrorCode, number>>;
  /** Returns the scope for this request from trusted context, or null to refuse (forbidden). */
  readonly scopeFor: (request: Request, params: Readonly<Record<string, string>>) => string | null | undefined | Promise<string | null | undefined>;
  /** Builds the redirect target. Default: the same route with the current slug, under the prefix, keeping the query. */
  readonly locationFor?: (target: { slug: string; entityId: string; params: Readonly<Record<string, string>>; request: Request }) => string;
  /** 301 (default) or 308. */
  readonly redirectStatus?: 301 | 308;
  /**
   * Browser cache lifetime of a redirect in seconds (default 3600). Kept finite on purpose: an entity may later
   * reclaim an old slug, and a permanently cached 301 would then loop in that browser.
   */
  readonly redirectMaxAgeSeconds?: number;
}

const DEFAULT_STATUS: Record<SlugHttpErrorCode, number> = { "not-found": 404, "invalid-slug": 400, forbidden: 403, "method-not-allowed": 405 };

type Segment = { readonly param: string } | { readonly literal: string };

function compile(pattern: string): Segment[] {
  if (!pattern.startsWith("/")) throw new RangeError("routes.resolve must start with /");
  const segments: Segment[] = pattern.split("/").filter(Boolean).map((part) => {
    if (part.startsWith(":")) {
      const param = part.slice(1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(param)) throw new RangeError(`Invalid route parameter ${part}`);
      return { param };
    }
    return { literal: part };
  });
  const names = segments.flatMap((segment) => ("param" in segment ? [segment.param] : []));
  if (!names.includes("slug")) throw new RangeError('routes.resolve must contain ":slug"');
  if (new Set(names).size !== names.length) throw new RangeError("Duplicate route parameter");
  return segments;
}

/** Matched params, null when the path does not match, or "invalid" for undecodable percent-encoding. */
function match(segments: readonly Segment[], path: string): Record<string, string> | null | "invalid" {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const part = parts[index] ?? "";
    if (!segment) return null;
    if ("literal" in segment) {
      if (segment.literal !== part) return null;
      continue;
    }
    try {
      params[segment.param] = decodeURIComponent(part);
    } catch {
      return "invalid";
    }
  }
  return params;
}

export function createSlugResolveHandler(options: SlugResolveHttpOptions): (request: Request) => Promise<Response> {
  const prefix = (options.prefix ?? "").replace(/\/+$/, "");
  if (prefix && !prefix.startsWith("/")) throw new RangeError("prefix must start with /");
  const segments = compile(options.routes?.resolve ?? "/:slug");
  const statuses = { ...DEFAULT_STATUS, ...options.statusFor };
  for (const status of Object.values(statuses)) {
    if (!Number.isInteger(status) || status < 400 || status > 599) throw new RangeError("statusFor values must be 4xx or 5xx");
  }
  const redirectStatus = options.redirectStatus ?? 301;
  if (redirectStatus !== 301 && redirectStatus !== 308) throw new RangeError("redirectStatus must be 301 or 308");
  const maxAge = options.redirectMaxAgeSeconds ?? 3600;
  if (!Number.isInteger(maxAge) || maxAge < 0) throw new RangeError("redirectMaxAgeSeconds must be a non-negative integer");
  const { slugs } = options;

  function defaultLocation(slug: string, params: Readonly<Record<string, string>>, url: URL): string {
    const path = segments
      .map((segment) => ("literal" in segment ? segment.literal : encodeURIComponent(segment.param === "slug" ? slug : params[segment.param] ?? "")))
      .join("/");
    return `${prefix}/${path}${url.search}`;
  }

  const respond = (status: number, body: unknown, head: boolean, headers: Record<string, string> = {}): Response =>
    new Response(head ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-cache", "x-content-type-options": "nosniff", ...headers },
    });
  const fail = (code: SlugHttpErrorCode, head: boolean, headers: Record<string, string> = {}): Response =>
    respond(statuses[code], { error: code }, head, headers);

  return async (request) => {
    const url = new URL(request.url);
    const head = request.method === "HEAD";
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return fail("not-found", head);
    const params = match(segments, url.pathname.slice(prefix.length));
    if (params === null) return fail("not-found", head);
    if (request.method !== "GET" && !head) return fail("method-not-allowed", false, { allow: "GET, HEAD" });
    if (params === "invalid") return fail("invalid-slug", head);
    const scope = await options.scopeFor(request, params);
    if (typeof scope !== "string" || scope === "") return fail("forbidden", head);
    let result;
    try {
      result = await slugs.resolve(scope, params.slug ?? "");
    } catch (error) {
      if (error instanceof SlugError) return fail(error.code === "invalid-scope" ? "forbidden" : "invalid-slug", head);
      throw error;
    }
    if (result.status === "not-found") return fail("not-found", head);
    if (result.status === "ok") return respond(200, { entityId: result.entityId, slug: result.slug }, head);
    const location = options.locationFor
      ? options.locationFor({ slug: result.slug, entityId: result.entityId, params, request })
      : defaultLocation(result.slug, params, url);
    return respond(redirectStatus, { entityId: result.entityId, slug: result.slug, location }, head, {
      location, "cache-control": `private, max-age=${maxAge}`,
    });
  };
}
