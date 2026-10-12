// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for feature-rollout: admin flag CRUD and audit for signed-in operators,
// and an evaluate endpoint that returns results (never flag definitions) for the caller. Default routes, relative to
// `prefix` and each overridable through `routes` ("METHOD /path", `:key` marks the flag key segment):
//   listFlags  GET    /flags              -> 200 {flags}
//   createFlag POST   /flags              -> 201 {flag}          body: flag definition
//   getFlag    GET    /flags/:key         -> 200 {flag}
//   updateFlag PATCH  /flags/:key         -> 200 {flag}          body: fields to change, optional expectedVersion
//   deleteFlag DELETE /flags/:key         -> 204                 query: optional version
//   flagAudit  GET    /flags/:key/audit   -> 200 {entries}       query: optional limit (1-1000)
//   evaluate   POST   /evaluate           -> 200 {flags: {key: {on, variant, reason}}}
//              body {keys?: string[] (max 100; all flags when omitted), expose?: boolean}; a GET route reads
//              ?keys=a,b&expose=1 instead.
// Error statuses come from `statusFor` (error code -> HTTP status) merged over the defaults below. The evaluate
// subject comes only from the trusted `subject(request)` hook; ids in the request body are ignored.
import { FeatureFlagError } from "./core.js";
import type { FeatureFlags, FlagActor, FlagSubject } from "./core.js";

export type FeatureFlagRoute = "listFlags" | "createFlag" | "getFlag" | "updateFlag" | "deleteFlag" | "flagAudit" | "evaluate";
export type FeatureFlagHttpErrorCode =
  | "invalid-flag" | "bad-request" | "invalid-json" | "unauthenticated" | "forbidden" | "not-found"
  | "conflict" | "exists" | "method-not-allowed" | "no-route";

export const DEFAULT_ROUTES: Readonly<Record<FeatureFlagRoute, string>> = {
  listFlags: "GET /flags",
  createFlag: "POST /flags",
  getFlag: "GET /flags/:key",
  updateFlag: "PATCH /flags/:key",
  deleteFlag: "DELETE /flags/:key",
  flagAudit: "GET /flags/:key/audit",
  evaluate: "POST /evaluate",
};

export const DEFAULT_STATUS: Readonly<Record<FeatureFlagHttpErrorCode, number>> = {
  "invalid-flag": 400, "bad-request": 400, "invalid-json": 400, unauthenticated: 401, forbidden: 403,
  "not-found": 404, conflict: 409, exists: 409, "method-not-allowed": 405, "no-route": 404,
};

export interface FeatureFlagHttpOptions {
  readonly flags: FeatureFlags;
  /** Mount path, for example "/api/flags". Trailing slashes are ignored. */
  readonly prefix: string;
  /** The signed-in operator for admin routes, or null (401). Authorization is the core's `authorize` hook. */
  readonly authenticate: (request: Request) => FlagActor | null | undefined | Promise<FlagActor | null | undefined>;
  /** The evaluation subject from trusted server context (session user, tenant, anonymous-id cookie). */
  readonly subject: (request: Request) => FlagSubject | Promise<FlagSubject>;
  readonly routes?: Partial<Record<FeatureFlagRoute, string>>;
  readonly statusFor?: Partial<Record<FeatureFlagHttpErrorCode, number>>;
  /** When set, admin mutations need an exact matching Origin header (cookie-authenticated admin UIs). */
  readonly allowedOrigins?: readonly string[];
  /** Largest accepted JSON body in bytes. Default 65,536. */
  readonly maxRequestBytes?: number;
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

class HttpError extends Error {
  readonly code: FeatureFlagHttpErrorCode;
  constructor(code: FeatureFlagHttpErrorCode, message: string) { super(message); this.code = code; }
}

interface CompiledRoute { readonly name: FeatureFlagRoute; readonly method: string; readonly segments: readonly string[] }

function compileRoute(name: FeatureFlagRoute, spec: unknown): CompiledRoute {
  const match = typeof spec === "string" ? /^([A-Z]+) (\/[A-Za-z0-9._~:\/-]*)$/.exec(spec) : null;
  if (!match || !METHODS.has(match[1] as string)) throw new RangeError(`routes.${name} must look like "GET /path" with GET, POST, PUT, PATCH or DELETE`);
  const segments = (match[2] as string).split("/").filter(Boolean);
  if (segments.filter((s) => s.startsWith(":")).some((s) => s !== ":key")) throw new RangeError(`routes.${name}: only :key is supported as a parameter`);
  return { name, method: match[1] as string, segments };
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

export function createFeatureFlagHandler(options: FeatureFlagHttpOptions): (request: Request) => Promise<Response> {
  const prefix = "/" + options.prefix.replace(/^\/+|\/+$/g, "");
  const base = prefix === "/" ? "" : prefix;
  const routeSpecs = { ...DEFAULT_ROUTES, ...options.routes };
  const routes = (Object.keys(DEFAULT_ROUTES) as FeatureFlagRoute[]).map((name) => compileRoute(name, routeSpecs[name]));
  const status: Record<string, number> = { ...DEFAULT_STATUS };
  for (const [code, value] of Object.entries(options.statusFor ?? {})) {
    if (!(code in DEFAULT_STATUS)) throw new RangeError(`statusFor has an unknown error code ${code}`);
    if (!Number.isInteger(value) || (value as number) < 400 || (value as number) > 599) throw new RangeError(`statusFor.${code} must be an HTTP status from 400 to 599`);
    status[code] = value as number;
  }
  const origins = options.allowedOrigins ? new Set(options.allowedOrigins) : null;
  const maxRequest = options.maxRequestBytes ?? 65_536;
  const { flags } = options;
  const fail = (code: FeatureFlagHttpErrorCode, body: Record<string, unknown>) => json(status[code] ?? 400, { error: code, ...body });

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    const raw = await readBounded(request, maxRequest);
    if (raw.trim() === "") return {};
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError("bad-request", "Expected application/json");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  async function actorFor(request: Request, mutation: boolean): Promise<FlagActor> {
    const actor = await options.authenticate(request);
    if (!actor) throw new HttpError("unauthenticated", "Sign in required");
    if (mutation && origins && !origins.has(request.headers.get("origin") ?? "")) throw new HttpError("forbidden", "Origin not allowed");
    return actor;
  }

  function optionalInt(value: unknown, name: string): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const n = typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : value;
    if (!Number.isInteger(n)) throw new HttpError("bad-request", `${name} must be an integer`);
    return n as number;
  }

  async function evaluate(request: Request, url: URL): Promise<Response> {
    let keys: unknown;
    let expose: unknown;
    if (request.method === "GET") {
      const raw = url.searchParams.get("keys");
      keys = raw === null ? undefined : raw.split(",").filter(Boolean);
      expose = ["1", "true"].includes(url.searchParams.get("expose") ?? "");
    } else {
      const body = await readBody(request);
      keys = body.keys;
      expose = body.expose ?? false;
    }
    if (keys !== undefined && (!Array.isArray(keys) || keys.length > 100 || !keys.every((k) => typeof k === "string" && k.length <= 100))) {
      throw new HttpError("bad-request", "keys must be an array of at most 100 flag keys");
    }
    if (typeof expose !== "boolean") throw new HttpError("bad-request", "expose must be a boolean");
    const subject = await options.subject(request);
    const results = await flags.evaluateMany(keys as string[] | undefined, subject);
    const out: Record<string, { on: boolean; variant: string | null; reason: string }> = {};
    for (const [key, result] of Object.entries(results)) {
      const final = expose && result.on ? await flags.expose(key, subject) : result;
      out[key] = { on: final.on, variant: final.variant, reason: final.reason };
    }
    return json(200, { flags: out });
  }

  async function dispatch(name: FeatureFlagRoute, key: string | undefined, request: Request, url: URL): Promise<Response> {
    switch (name) {
      case "evaluate":
        return evaluate(request, url);
      case "listFlags":
        return json(200, { flags: await flags.admin.list(await actorFor(request, false)) });
      case "getFlag":
        return json(200, { flag: await flags.admin.get(await actorFor(request, false), key as string) });
      case "flagAudit": {
        const actor = await actorFor(request, false);
        const limit = optionalInt(url.searchParams.get("limit"), "limit");
        return json(200, { entries: await flags.admin.audit(actor, limit === undefined ? { flagKey: key as string } : { flagKey: key as string, limit }) });
      }
      case "createFlag": {
        const actor = await actorFor(request, true);
        const body = await readBody(request);
        return json(201, { flag: await flags.admin.create(actor, body as { key: string }) });
      }
      case "updateFlag": {
        const actor = await actorFor(request, true);
        const { expectedVersion, ...patch } = await readBody(request);
        const version = optionalInt(expectedVersion, "expectedVersion");
        return json(200, { flag: await flags.admin.update(actor, key as string, patch, version === undefined ? {} : { expectedVersion: version }) });
      }
      case "deleteFlag": {
        const actor = await actorFor(request, true);
        const version = optionalInt(url.searchParams.get("version"), "version");
        await flags.admin.remove(actor, key as string, version === undefined ? {} : { expectedVersion: version });
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
    }
  }

  return async (request) => {
    try {
      const url = new URL(request.url);
      if (url.pathname !== base && !url.pathname.startsWith(base + "/")) throw new HttpError("no-route", "Not found");
      const segments = url.pathname.slice(base.length).split("/").filter(Boolean);
      let methodMismatch = false;
      for (const route of routes) {
        if (route.segments.length !== segments.length) continue;
        let key: string | undefined;
        let matched = true;
        for (let i = 0; i < segments.length; i++) {
          const want = route.segments[i] as string;
          const got = segments[i] as string;
          if (want === ":key") {
            try { key = decodeURIComponent(got); } catch { throw new HttpError("bad-request", "Malformed path"); }
          } else if (want !== got) { matched = false; break; }
        }
        if (!matched) continue;
        if (route.method !== request.method) { methodMismatch = true; continue; }
        return await dispatch(route.name, key, request, url);
      }
      throw methodMismatch ? new HttpError("method-not-allowed", "Method not allowed") : new HttpError("no-route", "Not found");
    } catch (error) {
      if (error instanceof FeatureFlagError) {
        return fail(error.code, { message: error.message, ...(error.problems.length > 0 ? { problems: error.problems } : {}) });
      }
      if (error instanceof HttpError) return fail(error.code, { message: error.message });
      if (error instanceof SyntaxError) return fail("invalid-json", { message: "Malformed JSON body" });
      throw error;
    }
  };
}
