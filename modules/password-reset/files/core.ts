// SPDX-License-Identifier: Apache-2.0
// Password reset by emailed link, framework-neutral. The receiving application supplies persistence, the user
// lookup, password hashing, email delivery and (optionally) session revocation through the interfaces below.
// Tokens are 256-bit random values; only their SHA-256 hash is stored, so a database leak does not reveal usable
// reset links. `request` answers identically whether or not an account exists, so it cannot be used to discover
// which email addresses are registered.

export interface ResetToken {
  readonly id: string;
  readonly userId: string;
  /** Hex SHA-256 of the token text. The token itself is never stored. */
  readonly tokenHash: string;
  /** The user's normalized email when the link was requested; the link dies if the account email changes. */
  readonly email: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly usedAt?: number;
  readonly revokedAt?: number;
}

export interface PasswordResetStore {
  insert(token: ResetToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ResetToken | null>;
  /** Unused, unrevoked, unexpired tokens of one user, newest first. */
  listPending(userId: string, now: number): Promise<ResetToken[]>;
  /**
   * Atomically marks the token used and returns it, or returns null when it is unknown, used, revoked or expired
   * at `now`. Must be ONE conditional statement so two concurrent consumers cannot both succeed.
   */
  consume(tokenHash: string, now: number): Promise<ResetToken | null>;
  /** Revokes one token if it is still unused and unrevoked; returns whether it changed. */
  revoke(id: string, now: number): Promise<boolean>;
  /** Revokes every unused, unrevoked token of the user except `exceptId`; returns how many changed. */
  revokePending(userId: string, now: number, exceptId?: string): Promise<number>;
}

export interface ResetUser { readonly id: string; readonly email: string }

export interface ResetUsers {
  /** Look up an account by normalized email (trimmed, domain lowercased). Return null when none exists. */
  findByEmail(normalizedEmail: string): Promise<ResetUser | null>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
}

export interface ResetEmail {
  readonly to: string;
  /** `${baseUrl}?token=...` */
  readonly link: string;
  readonly expiresAt: number;
  readonly ip?: string;
}

export interface PasswordResetOptions {
  readonly store: PasswordResetStore;
  readonly users: ResetUsers;
  readonly sendEmail: (message: ResetEmail) => Promise<void>;
  /** Your password hasher (Argon2id, scrypt or bcrypt from a maintained library). */
  readonly hashPassword: (password: string) => Promise<string>;
  /** Returns a list of problems (empty when acceptable), e.g. a length rule plus a breached-password check. */
  readonly passwordPolicy?: (password: string) => readonly string[] | Promise<readonly string[]>;
  /** Called after a successful reset; sign the user out everywhere here. */
  readonly revokeSessions?: (userId: string) => Promise<void>;
  /** Absolute URL of your reset form, e.g. https://app.example.com/reset-password. */
  readonly baseUrl: string;
  /** Link lifetime. Default 30 minutes; 5 minutes to 24 hours. */
  readonly ttlMs?: number;
  /** Most simultaneously valid links per user; older ones are revoked. Default 3. */
  readonly maxActivePerUser?: number;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly newId?: () => string;
}

export type PasswordResetErrorCode = "invalid-token" | "weak-password" | "bad-request";

export class PasswordResetError extends Error {
  constructor(readonly code: PasswordResetErrorCode, message: string, readonly problems: readonly string[] = []) {
    super(message);
    this.name = "PasswordResetError";
  }
}

/**
 * Result of `request`. `serverError` is for logs and alerts only and must never reach the requester: exposing it
 * would reveal whether the account exists.
 */
export interface RequestResult {
  readonly ok: true;
  readonly serverError?: "invalid-email" | "delivery-failed";
}

const MINUTE = 60 * 1000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_PASSWORD = 4096;

/** Trims and lowercases the domain; the local part keeps its case (RFC 5321). Returns null when malformed. */
export function normalizeEmail(email: string): string | null {
  const text = email.trim();
  const at = text.lastIndexOf("@");
  if (at < 1 || !EMAIL.test(text)) return null;
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

/** Compares two strings in time that depends only on their length. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function isPending(token: ResetToken, now: number): boolean {
  return token.usedAt === undefined && token.revokedAt === undefined && now < token.expiresAt;
}

export function createPasswordReset(options: PasswordResetOptions) {
  const ttlMs = options.ttlMs ?? 30 * MINUTE;
  if (!Number.isInteger(ttlMs) || ttlMs < 5 * MINUTE || ttlMs > 24 * 60 * MINUTE) throw new RangeError("ttlMs must be 5 minutes to 24 hours");
  const maxActive = options.maxActivePerUser ?? 3;
  if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 20) throw new RangeError("maxActivePerUser must be 1 to 20");
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(base.hostname))) {
    throw new RangeError("baseUrl must be https (http only for localhost)");
  }
  if (base.search || base.hash) throw new RangeError("baseUrl must not carry a query or fragment");
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { store, users } = options;

  /**
   * Finds a usable token without consuming it: pending, hash matching in constant time, and still bound to the
   * account that owns the email it was sent to. Every failure looks the same to the caller.
   */
  async function usable(token: unknown, at: number): Promise<ResetToken | null> {
    if (typeof token !== "string" || !TOKEN.test(token)) return null;
    const tokenHash = await hashToken(token);
    const record = await store.findByTokenHash(tokenHash);
    if (!record || !constantTimeEqual(record.tokenHash, tokenHash) || !isPending(record, at)) return null;
    const owner = await users.findByEmail(record.email);
    if (!owner || owner.id !== record.userId || normalizeEmail(owner.email) !== record.email) {
      // The account email changed (or the account is gone): the link must not work for the new address's owner.
      await store.revoke(record.id, at);
      return null;
    }
    return record;
  }

  async function checkPassword(password: unknown): Promise<string> {
    if (typeof password !== "string" || password.length === 0) throw new PasswordResetError("weak-password", "Choose a password", ["empty"]);
    if (password.length > MAX_PASSWORD) throw new PasswordResetError("weak-password", "Password is too long", ["too-long"]);
    const problems = options.passwordPolicy ? [...(await options.passwordPolicy(password))] : [];
    if (problems.length > 0) throw new PasswordResetError("weak-password", "Password does not meet the policy", problems);
    return password;
  }

  return {
    /**
     * Starts a reset. Always resolves to `{ ok: true }` (plus a server-only `serverError` on failure) and does the
     * same token work whether or not the account exists; only existing accounts get a stored token and an email.
     */
    async request(email: string, context: { ip?: string } = {}): Promise<RequestResult> {
      const normalized = typeof email === "string" && email.length <= 320 ? normalizeEmail(email) : null;
      // Generate and hash a token on every path so unknown and known accounts cost the same CPU work.
      const token = base64Url(randomBytes(32));
      const tokenHash = await hashToken(token);
      if (normalized === null) return { ok: true, serverError: "invalid-email" };
      const user = await users.findByEmail(normalized);
      if (!user) return { ok: true };
      const at = now();
      const record: ResetToken = {
        id: newId(), userId: user.id, tokenHash, email: normalizeEmail(user.email) ?? normalized,
        createdAt: at, expiresAt: at + ttlMs,
      };
      await store.insert(record);
      const others = (await store.listPending(user.id, at)).filter((item) => item.id !== record.id);
      for (const old of others.slice(maxActive - 1)) await store.revoke(old.id, at);
      const link = `${base.href}?token=${encodeURIComponent(token)}`;
      try {
        await options.sendEmail({ to: record.email, link, expiresAt: record.expiresAt, ...(context.ip === undefined ? {} : { ip: context.ip }) });
      } catch {
        // The provider may or may not have sent it; revoking makes any delivered link inert.
        await store.revoke(record.id, at).catch(() => undefined);
        return { ok: true, serverError: "delivery-failed" };
      }
      return { ok: true };
    },

    /** Says whether a link can still be used, without consuming it (to render the new-password form). */
    async verify(token: string): Promise<{ valid: boolean; expiresAt?: number }> {
      const record = await usable(token, now());
      return record ? { valid: true, expiresAt: record.expiresAt } : { valid: false };
    },

    /**
     * Sets the new password. The policy runs before the token is consumed, so a rejected password leaves the link
     * usable. Exactly one of several concurrent completes wins; the others get `invalid-token`.
     */
    async complete(token: string, newPassword: string): Promise<{ userId: string }> {
      const invalid = () => new PasswordResetError("invalid-token", "This reset link is invalid or has expired");
      const found = await usable(token, now());
      if (!found) throw invalid();
      const password = await checkPassword(newPassword);
      // Hash before consuming: a failing hasher leaves the link usable.
      const passwordHash = await options.hashPassword(password);
      const at = now();
      const consumed = await store.consume(found.tokenHash, at);
      if (!consumed) throw invalid();
      await users.setPasswordHash(consumed.userId, passwordHash);
      await store.revokePending(consumed.userId, at, consumed.id);
      if (options.revokeSessions) await options.revokeSessions(consumed.userId);
      return { userId: consumed.userId };
    },
  };
}

export type PasswordReset = ReturnType<typeof createPasswordReset>;
