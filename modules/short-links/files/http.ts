// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapters for short links.
//
// createRedirectHandler: public redirect route, GET {prefix}/{code}
//   302 with `location`, `cache-control: private, max-age=0` (so shared caches and CDNs never serve a
//   redirect without counting it, and a disabled or edited link takes effect at once) and
//   `referrer-policy: no-referrer-when-downgrade` (the destination sees this short URL as the referrer,
//   except on an https -> http hop, matching the long-standing browser default). 404 unknown, 410 gone.
//   Only GET counts a click; other methods get 405. The client IP is never read.
//
// createManagementHandler: signed-in management API under one prefix.
//   POST   {prefix}                {tenantId, url, slug?, expiresAt?, maxClicks?} -> 201 {link}
//   GET    {prefix}?tenantId&cursor&limit                                          -> 200 {links, nextCursor}
//   GET    {prefix}/{id}                                                           -> 200 {link}
//   GET    {prefix}/{id}/stats                                                     -> 200 {stats}
//   PATCH  {prefix}/{id}          {url?, expiresAt?, disabled?}                     -> 200 {link}
//   DELETE {prefix}/{id}                                                           -> 200 {deleted: true}
import { ShortLinkError } from "./core.js";
import type { Actor, ShortLinkPatch, ShortLinks } from "./core.js";

export interface RedirectHandlerOptions {
  /** Path prefix in front of the code, e.g. "/s". Default "" (codes at the root). */
  readonly prefix?: string;
  /**
   * Optional two-letter country from trusted edge metadata (for example a CDN geolocation header you
   * control). Never derive it from, or store, the client IP here.
   */
  readonly country?: (request: Request) => string | null | undefined;
}

const CODE = /^[A-Za-z0-9_-]{1,64}$/;

const plain = (status: number, body: string, extra: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra } });

export function createRedirectHandler(links: Pick<ShortLinks, "resolve">, options: RedirectHandlerOptions = {}): (request: Request) => Promise<Response> {
  const prefix = (options.prefix ?? "").replace(/\/+$/, "");
  return async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix + "/")) return plain(404, "Not found");
    const code = url.pathname.slice(prefix.length + 1);
    if (!CODE.test(code)) return plain(404, "Not found");
    if (request.method !== "GET") return plain(405, "Method not allowed", { allow: "GET" });
    const result = await links.resolve(code, { referrer: request.headers.get("referer"), country: options.country?.(request) ?? null });
    if (result.status === 302) {
      return new Response(null, {
        status: 302,
        headers: { location: result.url, "cache-control": "private, max-age=0", "referrer-policy": "no-referrer-when-downgrade" },
      });
    }
    return result.status === 410 ? plain(410, "This link is no longer available") : plain(404, "Not found");
  };
}

export interface ManagementHandlerOptions {
  readonly links: ShortLinks;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in bytes. Default 8,192. */
  readonly maxRequestBytes?: number;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "not-found": 404, "invalid-tenant": 400, "invalid-url": 400, "scheme-not-allowed": 400,
  "credentials-not-allowed": 400, "blocked-host": 400, "unsafe-destination": 400, "invalid-slug": 400, "reserved-slug": 409,
  "slug-taken": 409, exhausted: 503, "invalid-expiry": 400, "invalid-max-clicks": 400, "invalid-patch": 400,
  "invalid-cursor": 400, "invalid-limit": 400, "bad-request": 400, "too-large": 413,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ID = /^[\w-]{1,64}$/;

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in body).map((key) => [key, body[key]]));
}

export function createManagementHandler(options: ManagementHandlerOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 8192;
  const { links } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ShortLinkError("bad-request", "Expected application/json");
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > maxRequest) throw new ShortLinkError("too-large", "Body too large");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > maxRequest) throw new ShortLinkError("too-large", "Body too large");
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShortLinkError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  function limitParam(url: URL): number | undefined {
    const raw = url.searchParams.get("limit");
    if (raw === null || raw === "") return undefined;
    if (!/^\d{1,3}$/.test(raw)) throw new ShortLinkError("invalid-limit", "limit must be a whole number");
    return Number(raw);
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
      const [id, action, ...extra] = parts;
      if (extra.length > 0 || (id !== undefined && !ID.test(id))) return json(404, { error: "not-found" });

      if (id === undefined) {
        if (request.method === "GET") {
          const limit = limitParam(url);
          return json(200, await links.list(user, {
            tenantId: url.searchParams.get("tenantId") ?? "", cursor: url.searchParams.get("cursor"), ...(limit === undefined ? {} : { limit }),
          }));
        }
        if (request.method === "POST") {
          const body = await readBody(request);
          const input = { tenantId: body.tenantId, url: body.url, ...pick(body, ["slug", "expiresAt", "maxClicks"]) };
          return json(201, { link: await links.create(user, input as Parameters<ShortLinks["create"]>[1]) });
        }
      } else if (action === undefined) {
        if (request.method === "GET") return json(200, { link: await links.get(user, id) });
        if (request.method === "PATCH") {
          const body = await readBody(request);
          return json(200, { link: await links.update(user, id, pick(body, Object.keys(body)) as ShortLinkPatch) });
        }
        if (request.method === "DELETE") {
          await links.remove(user, id);
          return json(200, { deleted: true });
        }
      } else if (action === "stats") {
        if (request.method === "GET") return json(200, { stats: await links.stats(user, id) });
      } else {
        return json(404, { error: "not-found" });
      }
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof ShortLinkError) {
        return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      }
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
