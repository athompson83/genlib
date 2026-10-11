// SPDX-License-Identifier: Apache-2.0
// Organization (tenant) invitations: create, verify, accept, revoke and expire, framework-neutral.
// The receiving application supplies persistence, authorization, membership creation and email
// delivery through the interfaces below. Tokens are 256-bit random values; only their SHA-256
// hash is stored, so a database leak does not reveal usable invitation links.

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  readonly id: string;
  readonly tenantId: string;
  /** Normalized: trimmed, domain lowercased. */
  readonly email: string;
  readonly role: string;
  readonly invitedBy: string;
  readonly tokenHash: string;
  readonly status: InvitationStatus;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly acceptedBy?: string;
  readonly closedAt?: number;
}

/** What the caller is allowed to know about an invitation (never the token hash). */
export type PublicInvitation = Omit<Invitation, "tokenHash">;

export interface InvitationStore {
  insert(invitation: Invitation): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  findById(id: string): Promise<Invitation | null>;
  /** Pending invitations for one tenant (and optionally one normalized email). */
  listPending(tenantId: string, email?: string): Promise<Invitation[]>;
  /**
   * Atomically moves `id` from `from` to the patched state and returns true, or returns false when
   * the stored status is no longer `from` (another request won). For "accepted", create the
   * membership in the SAME transaction, or make membership creation idempotent and retry it.
   */
  transition(id: string, from: InvitationStatus, patch: Pick<Invitation, "status" | "closedAt"> & { acceptedBy?: string }): Promise<boolean>;
}

export interface Actor { readonly userId: string }
export type InvitationAction = "invite" | "revoke" | "list";

export interface InvitationOptions {
  readonly store: InvitationStore;
  /**
   * Decide whether `actor` may perform `action` in `tenantId` (and grant `role` for "invite").
   * Return false to deny. Enforce role ceilings here (an admin cannot invite an owner, etc.).
   */
  readonly authorize: (actor: Actor, action: InvitationAction, target: Readonly<{ tenantId: string; role?: string }>) => Promise<boolean>;
  /** Roles that may be granted by invitation. */
  readonly roles: readonly string[];
  /** Lifetime of an invitation. Default 7 days; 5 minutes to 30 days. */
  readonly ttlMs?: number;
  /** Cap on simultaneously pending invitations per tenant. Default 100. */
  readonly maxPendingPerTenant?: number;
  /** When true (default) the accepting user's verified email must match the invited email. */
  readonly requireEmailMatch?: boolean;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly newId?: () => string;
}

export type InvitationErrorCode =
  | "forbidden" | "invalid-email" | "invalid-role" | "invalid-tenant" | "too-many-pending"
  | "not-found" | "expired" | "revoked" | "already-accepted" | "email-mismatch" | "conflict"
  | "bad-request" | "delivery-failed";

export class InvitationError extends Error {
  readonly code: InvitationErrorCode;
  constructor(code: InvitationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "InvitationError";
  }
}

const DAY = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}$/;
const TENANT = /^[\w.:-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Trims and lowercases the domain; the local part keeps its case (RFC 5321). */
export function normalizeEmail(email: string): string {
  const text = email.trim();
  const at = text.lastIndexOf("@");
  if (at < 1 || !EMAIL.test(text)) throw new InvitationError("invalid-email", "Invalid email address");
  return text.slice(0, at) + "@" + text.slice(at + 1).toLowerCase();
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Hex SHA-256 of the token text (Web Crypto). */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function toPublic(invitation: Invitation): PublicInvitation {
  const { tokenHash: _hidden, ...rest } = invitation;
  return rest;
}

/** Effective status: a pending invitation past its expiry reads as expired. */
export function effectiveStatus(invitation: Invitation, now: number): InvitationStatus {
  return invitation.status === "pending" && now >= invitation.expiresAt ? "expired" : invitation.status;
}

export function createInvitations(options: InvitationOptions) {
  const ttlMs = options.ttlMs ?? 7 * DAY;
  if (!Number.isInteger(ttlMs) || ttlMs < 5 * 60 * 1000 || ttlMs > 30 * DAY) throw new RangeError("ttlMs must be 5 minutes to 30 days");
  const maxPending = options.maxPendingPerTenant ?? 100;
  const roles = new Set(options.roles);
  if (roles.size === 0) throw new RangeError("Configure at least one invitable role");
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const newId = options.newId ?? (() => crypto.randomUUID());
  const requireEmailMatch = options.requireEmailMatch ?? true;
  const { store } = options;

  async function allowed(actor: Actor, action: InvitationAction, target: { tenantId: string; role?: string }): Promise<void> {
    if (!(await options.authorize(actor, action, target))) throw new InvitationError("forbidden", "Not allowed");
  }

  async function lookup(token: string): Promise<Invitation> {
    if (!TOKEN.test(token)) throw new InvitationError("not-found", "Invitation not found");
    const invitation = await store.findByTokenHash(await hashToken(token));
    if (!invitation) throw new InvitationError("not-found", "Invitation not found");
    return invitation;
  }

  function failFor(status: InvitationStatus): never {
    if (status === "expired") throw new InvitationError("expired", "Invitation has expired");
    if (status === "revoked") throw new InvitationError("revoked", "Invitation was revoked");
    throw new InvitationError("already-accepted", "Invitation was already used");
  }

  return {
    /**
     * Creates an invitation and returns it with the one-time token to put in the email link.
     * Re-inviting the same email in the same tenant revokes the earlier pending invitation, so only
     * the newest link works. The token is returned once and never stored.
     */
    async invite(actor: Actor, input: { tenantId: string; email: string; role: string }): Promise<{ invitation: PublicInvitation; token: string }> {
      if (!TENANT.test(input.tenantId)) throw new InvitationError("invalid-tenant", "Invalid tenant id");
      if (!roles.has(input.role)) throw new InvitationError("invalid-role", "Role cannot be granted by invitation");
      const email = normalizeEmail(input.email);
      await allowed(actor, "invite", { tenantId: input.tenantId, role: input.role });
      const at = now();
      const pending = (await store.listPending(input.tenantId)).filter((item) => effectiveStatus(item, at) === "pending");
      const previous = pending.filter((item) => item.email.toLowerCase() === email.toLowerCase());
      if (pending.length - previous.length >= maxPending) throw new InvitationError("too-many-pending", "Too many pending invitations");
      for (const item of previous) await store.transition(item.id, "pending", { status: "revoked", closedAt: at });
      const token = base64Url(randomBytes(32));
      const invitation: Invitation = {
        id: newId(), tenantId: input.tenantId, email, role: input.role, invitedBy: actor.userId,
        tokenHash: await hashToken(token), status: "pending", createdAt: at, expiresAt: at + ttlMs,
      };
      await store.insert(invitation);
      return { invitation: toPublic(invitation), token };
    },

    /** Reports what a token refers to without consuming it (for the "join Acme?" page). */
    async inspect(token: string): Promise<PublicInvitation & { status: InvitationStatus }> {
      const invitation = await lookup(token);
      return { ...toPublic(invitation), status: effectiveStatus(invitation, now()) };
    },

    /**
     * Accepts with the signed-in user's id and VERIFIED email. Exactly one concurrent accept wins
     * (store.transition); replays, expired and revoked tokens fail with a specific code.
     */
    async accept(token: string, user: { userId: string; verifiedEmail: string }): Promise<PublicInvitation> {
      const invitation = await lookup(token);
      const at = now();
      const status = effectiveStatus(invitation, at);
      if (status !== "pending") failFor(status);
      if (requireEmailMatch && normalizeEmail(user.verifiedEmail).toLowerCase() !== invitation.email.toLowerCase()) {
        throw new InvitationError("email-mismatch", "Sign in with the invited email address");
      }
      const won = await store.transition(invitation.id, "pending", { status: "accepted", closedAt: at, acceptedBy: user.userId });
      if (!won) {
        const current = await store.findById(invitation.id);
        failFor(current ? effectiveStatus(current, at) : "revoked");
      }
      return toPublic({ ...invitation, status: "accepted", closedAt: at, acceptedBy: user.userId });
    },

    /** Revokes a pending invitation; the actor must be allowed to revoke in its tenant. */
    async revoke(actor: Actor, id: string): Promise<PublicInvitation> {
      const invitation = await store.findById(id);
      if (!invitation) throw new InvitationError("not-found", "Invitation not found");
      // Authorize against the invitation's own tenant, so ids from another tenant are refused.
      await allowed(actor, "revoke", { tenantId: invitation.tenantId });
      const at = now();
      const status = effectiveStatus(invitation, at);
      if (status !== "pending") failFor(status);
      if (!(await store.transition(id, "pending", { status: "revoked", closedAt: at }))) throw new InvitationError("conflict", "Invitation changed; reload");
      return toPublic({ ...invitation, status: "revoked", closedAt: at });
    },

    /** Lists a tenant's pending invitations (expired ones are left out). */
    async listPending(actor: Actor, tenantId: string): Promise<PublicInvitation[]> {
      if (!TENANT.test(tenantId)) throw new InvitationError("invalid-tenant", "Invalid tenant id");
      await allowed(actor, "list", { tenantId });
      const at = now();
      return (await store.listPending(tenantId)).filter((item) => effectiveStatus(item, at) === "pending").map(toPublic);
    },
  };
}

export type Invitations = ReturnType<typeof createInvitations>;
