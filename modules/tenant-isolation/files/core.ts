// SPDX-License-Identifier: Apache-2.0
// Tenant context for multi-tenant apps, framework-neutral. The tenant of a request comes from trusted
// server state: the verified session and the membership table. A tenant id the client sends (header,
// path segment or subdomain) is only a selector: it must match one of the signed-in user's memberships,
// otherwise the request fails as not-found (default) or forbidden. It is never trusted on its own.

export type TenantErrorCode =
  | "unauthenticated"
  | "invalid-tenant"
  | "tenant-required"
  | "no-tenant"
  | "not-a-member"
  | "not-found"
  | "invalid-column"
  | "invalid-identifier"
  | "invalid-limit"
  | "tenant-mismatch";

export class TenantIsolationError extends Error {
  readonly code: TenantErrorCode;
  constructor(code: TenantErrorCode, message: string = code) {
    super(message);
    this.name = "TenantIsolationError";
    this.code = code;
  }
}

/** Tenant ids: 1 to 128 characters of letters, digits, `_`, `-`, `.` and `:` (covers slugs, UUIDs, prefixed ids). */
const TENANT_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export function isTenantId(value: unknown): value is string {
  return typeof value === "string" && TENANT_ID.test(value);
}

/** Throws `invalid-tenant` unless `value` is a well-formed tenant id. */
export function assertTenantId(value: unknown): string {
  if (!isTenantId(value)) throw new TenantIsolationError("invalid-tenant", "Invalid tenant id");
  return value;
}

/** The signed-in user, from your verified session cookie or token. `tenantId` is an optional verified claim (for example an org claim in a signed JWT). */
export interface TenantSession {
  readonly userId: string;
  readonly tenantId?: string;
}

export interface Membership {
  readonly tenantId: string;
  readonly role: string;
}

/** Reads an untrusted tenant selector from the request (header, path or subdomain). Return null when absent. */
export type TenantSelector = (request: Request) => string | null;

export interface TenantResolverOptions {
  /** Resolve the signed-in user from trusted server state. Return null when signed out. */
  readonly session: (request: Request) => Promise<TenantSession | null>;
  /** The user's current memberships, from your own table. Checked on every request, so revocations apply at once. */
  readonly memberships: (userId: string) => Promise<readonly Membership[]>;
  /** Optional untrusted selector. Without one, a session claim or a single membership decides. */
  readonly selector?: TenantSelector;
}

export interface TenantContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: string;
}

/**
 * Resolves the tenant of `request`. Order: a selector value (header/path/subdomain) or a verified
 * session claim names the wanted tenant, and it must be one of the user's memberships; with neither, a
 * user with exactly one membership gets that tenant. A selector that disagrees with a session claim fails.
 */
export async function resolveTenant(request: Request, options: TenantResolverOptions): Promise<TenantContext> {
  const session = await options.session(request);
  if (!session || typeof session.userId !== "string" || session.userId === "") {
    throw new TenantIsolationError("unauthenticated", "Sign in required");
  }
  const selected = options.selector?.(request) ?? null;
  if (selected !== null && !isTenantId(selected)) throw new TenantIsolationError("invalid-tenant", "Invalid tenant id");
  const claimed = session.tenantId ?? null;
  if (claimed !== null && !isTenantId(claimed)) throw new TenantIsolationError("invalid-tenant", "Invalid tenant claim");
  if (selected !== null && claimed !== null && selected !== claimed) {
    throw new TenantIsolationError("not-a-member", "Tenant not found");
  }
  const memberships = (await options.memberships(session.userId)).filter((m) => isTenantId(m.tenantId));
  const wanted = selected ?? claimed;
  if (wanted !== null) {
    const membership = memberships.find((m) => m.tenantId === wanted);
    if (!membership) throw new TenantIsolationError("not-a-member", "Tenant not found");
    return { userId: session.userId, tenantId: membership.tenantId, role: membership.role };
  }
  if (memberships.length === 0) throw new TenantIsolationError("no-tenant", "You do not belong to a tenant");
  const only = memberships[0];
  if (memberships.length > 1 || !only) throw new TenantIsolationError("tenant-required", "Choose a tenant");
  return { userId: session.userId, tenantId: only.tenantId, role: only.role };
}

/** Selector from a request header, such as `x-tenant-id`. */
export function headerSelector(name: string): TenantSelector {
  return (request) => {
    const value = request.headers.get(name);
    return value === null || value === "" ? null : value.trim();
  };
}

/** Selector from the first path segment after `prefix`, such as `/t/{tenant}/...` with prefix `/t`. */
export function pathSelector(prefix: string): TenantSelector {
  const base = prefix.replace(/\/+$/, "");
  return (request) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(base + "/")) return null;
    const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
    if (segment === "") return null;
    try { return decodeURIComponent(segment); } catch { return "%invalid"; }
  };
}

/** Selector from the leftmost label under `baseDomain`, such as `acme.app.example.com` with base `app.example.com`. */
export function subdomainSelector(baseDomain: string): TenantSelector {
  const base = "." + baseDomain.toLowerCase().replace(/\.$/, "");
  return (request) => {
    const host = new URL(request.url).hostname.toLowerCase().replace(/\.$/, "");
    if (!host.endsWith(base)) return null;
    const label = host.slice(0, -base.length);
    return label === "" || label.includes(".") ? null : label;
  };
}

export interface TenantHandlerOptions extends TenantResolverOptions {
  /** Status for a selector that names a tenant the user does not belong to: 404 (default, hides which tenants exist) or 403. */
  readonly hiddenStatus?: 403 | 404;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const STATUS: Record<TenantErrorCode, number> = {
  unauthenticated: 401, "invalid-tenant": 400, "tenant-required": 400, "no-tenant": 403, "not-a-member": 404,
  "not-found": 404, "invalid-column": 400, "invalid-identifier": 500, "invalid-limit": 400, "tenant-mismatch": 400,
};

/** Maps a TenantIsolationError to a JSON Response; rethrows anything else. */
export function tenantErrorResponse(error: unknown, hiddenStatus: 403 | 404 = 404): Response {
  if (!(error instanceof TenantIsolationError)) throw error;
  const status = error.code === "not-a-member" ? hiddenStatus : STATUS[error.code];
  return json(status, { error: error.code === "not-a-member" && status === 404 ? "not-found" : error.code });
}

/** Fetch handler wrapper: resolves the tenant, then calls `handler` with it. Tenant and scoped-query errors map to JSON responses. */
export function createTenantHandler(
  options: TenantHandlerOptions,
  handler: (request: Request, context: TenantContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  const hidden = options.hiddenStatus ?? 404;
  if (hidden !== 403 && hidden !== 404) throw new RangeError("hiddenStatus must be 403 or 404");
  return async (request) => {
    try {
      const context = await resolveTenant(request, options);
      return await handler(request, context);
    } catch (error) {
      return tenantErrorResponse(error, hidden);
    }
  };
}
