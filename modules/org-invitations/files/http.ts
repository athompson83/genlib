// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for invitations. Mount it under one path prefix with
// your framework's catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   POST   {prefix}            {tenantId, email, role}  -> 201 {invitation}   (sends the email)
//   GET    {prefix}?tenantId=  -> 200 {invitations}
//   DELETE {prefix}/{id}       -> 200 {invitation}
//   POST   {prefix}/inspect    {token}                  -> 200 {invitation}   (no sign-in needed)
//   POST   {prefix}/accept     {token}                  -> 200 {invitation}
// Tokens travel in the JSON body, never in a URL this server logs.
import { InvitationError } from "./core.js";
import type { Actor, Invitations, PublicInvitation } from "./core.js";

export interface InvitationHttpOptions {
  readonly invitations: Invitations;
  readonly prefix: string;
  /**
   * Resolve the signed-in user from trusted server context (session cookie, verified JWT).
   * Return null when signed out. `verifiedEmail` must come from your identity provider, never the body.
   */
  readonly authenticate: (request: Request) => Promise<(Actor & { verifiedEmail: string }) | null>;
  /**
   * Deliver the invitation email. Build the link from your own trusted base URL, for example
   * `${appUrl}/join#token=${token}`, so the token stays out of server logs and Referer headers.
   */
  readonly sendInvitation: (invitation: PublicInvitation, token: string) => Promise<void>;
  /** Exact allowed origins; state-changing requests without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
}

const STATUS: Record<string, number> = {
  forbidden: 403, "invalid-email": 400, "invalid-role": 400, "invalid-tenant": 400, "too-many-pending": 429,
  "not-found": 404, expired: 410, revoked: 410, "already-accepted": 409, "email-mismatch": 403, conflict: 409, "bad-request": 400, "delivery-failed": 502,
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new InvitationError("bad-request", "Expected application/json");
  const text = await request.text();
  if (text.length > 4096) throw new InvitationError("bad-request", "Body too large");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvitationError("bad-request", "Expected a JSON object");
  return value as Record<string, unknown>;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function createInvitationHandler(options: InvitationHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const rest = url.pathname.slice(prefix.length).replace(/^\/+/, "");
    try {
      if (request.method !== "GET" && !origins.has(request.headers.get("origin") ?? "")) return json(403, { error: "forbidden", message: "Origin not allowed" });
      if (request.method === "POST" && rest === "inspect") {
        const invitation = await options.invitations.inspect(text((await readBody(request)).token));
        // Show only what a join page needs; the inviter id and role ceiling stay private.
        return json(200, { invitation: { tenantId: invitation.tenantId, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt } });
      }
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      if (request.method === "POST" && rest === "accept") {
        return json(200, { invitation: await options.invitations.accept(text((await readBody(request)).token), { userId: user.userId, verifiedEmail: user.verifiedEmail }) });
      }
      if (request.method === "POST" && rest === "") {
        const body = await readBody(request);
        const { invitation, token } = await options.invitations.invite(user, { tenantId: text(body.tenantId), email: text(body.email), role: text(body.role) });
        try {
          await options.sendInvitation(invitation, token);
        } catch {
          // The provider may or may not have sent it; revoking makes any delivered link inert.
          await options.invitations.revoke(user, invitation.id).catch(() => undefined);
          throw new InvitationError("delivery-failed", "The invitation email could not be sent; nothing was left pending");
        }
        return json(201, { invitation });
      }
      if (request.method === "GET" && rest === "") {
        return json(200, { invitations: await options.invitations.listPending(user, url.searchParams.get("tenantId") ?? "") });
      }
      if (request.method === "DELETE" && /^[\w-]{1,64}$/.test(rest)) {
        return json(200, { invitation: await options.invitations.revoke(user, rest) });
      }
      return json(405, { error: "method-not-allowed" });
    } catch (error) {
      if (error instanceof InvitationError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
