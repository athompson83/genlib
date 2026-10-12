// SPDX-License-Identifier: Apache-2.0
// Email-and-password signup with email verification, framework-neutral. The receiving application supplies
// persistence (EmailSignupStore) and email delivery (sendEmail); a password policy and hasher are injectable with
// NIST SP 800-63B-style and scrypt defaults. Verification tokens are 256-bit random values stored only as SHA-256
// hashes. `signup` answers identically whether or not the email is already registered (the owner is told through
// a hook instead), so it cannot be used to discover registered addresses.

import { defaultPasswordPolicy } from "./password-policy.js";
import type { PasswordPolicy } from "./password-policy.js";
import { createScryptHasher } from "./scrypt-hasher.js";
import type { PasswordHasher } from "./scrypt-hasher.js";

export interface SignupAccount {
  readonly id: string;
  /** Normalized email (see normalizeEmail). Unique across accounts. */
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: number;
  readonly verifiedAt?: number;
  /** When the most recent verification email was reserved (resend cooldown). */
  readonly lastSentAt?: number;
  /** When each verification email inside the rolling send window was reserved (older entries may be pruned). */
  readonly recentSends: readonly number[];
}

export interface VerificationToken {
  readonly id: string;
  readonly accountId: string;
  /** Hex SHA-256 of the token text. The token itself is never stored. */
  readonly tokenHash: string;
  /** The account's normalized email when the link was issued; the link dies if the account email changes. */
  readonly email: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly usedAt?: number;
  readonly revokedAt?: number;
}

export interface SendLimits {
  readonly cooldownMs: number;
  readonly windowMs: number;
  readonly maxPerWindow: number;
}

export interface EmailSignupStore {
  /**
   * Inserts the account unless one with the same normalized email exists. Returns false on that conflict. Must be
   * atomic (a unique index plus INSERT ... ON CONFLICT DO NOTHING) so concurrent signups create exactly one account.
   */
  createAccount(account: SignupAccount): Promise<boolean>;
  findAccountByEmail(email: string): Promise<SignupAccount | null>;
  findAccountById(id: string): Promise<SignupAccount | null>;
  /**
   * Atomically marks the account verified at `now` if it is not verified yet. Returns true only for the call that
   * made the transition. Must be ONE conditional statement.
   */
  markVerified(accountId: string, now: number): Promise<boolean>;
  /**
   * Atomically reserves one verification send for an unverified account if the cooldown has passed and fewer than
   * maxPerWindow sends happened in the rolling window (now - windowMs, now], updating lastSentAt and recentSends
   * (dropping entries older than the window). Returns whether the send was reserved. Must be ONE conditional
   * statement so concurrent resends cannot exceed the limits.
   */
  reserveSend(accountId: string, now: number, limits: SendLimits): Promise<boolean>;
  /**
   * Inserts the token and, in the same atomic step, revokes the account's other pending tokens that already exist
   * and are not newer (createdAt <= the new one). Because the step is atomic, the last-issued link always survives,
   * so concurrent issues never leave zero working links. On SQL, one statement (INSERT in a CTE plus an UPDATE).
   */
  issueToken(token: VerificationToken): Promise<void>;
  findTokenByHash(tokenHash: string): Promise<VerificationToken | null>;
  /** Atomically marks the token used and returns it, or null when unknown, used, revoked or expired at `now`. */
  consumeToken(tokenHash: string, now: number): Promise<VerificationToken | null>;
  revokeToken(id: string, now: number): Promise<boolean>;
  /** Revokes every unused, unrevoked token of the account except `exceptId`; returns how many changed. */
  revokePendingTokens(accountId: string, now: number, exceptId?: string): Promise<number>;
}

export interface VerificationEmail {
  readonly to: string;
  /** `${baseUrl}?token=...` */
  readonly link: string;
  readonly expiresAt: number;
  /** Stable per token: pass it to your provider so retries never deliver two copies of one link. */
  readonly idempotencyKey: string;
  readonly reason: "signup" | "resend";
}

export interface ExistingAccountNotice {
  readonly accountId: string;
  readonly email: string;
  readonly verified: boolean;
}

export interface EmailSignupOptions {
  readonly store: EmailSignupStore;
  readonly sendEmail: (message: VerificationEmail) => Promise<void>;
  /** Absolute URL of the page that confirms the link (it should POST the token), e.g. https://app.example.com/verify. */
  readonly baseUrl: string;
  /**
   * Called when someone signs up with an email that already has an account. Tell the owner ("someone tried to
   * create an account with your email; sign in or reset your password"). The public result does not change.
   */
  readonly onExistingAccount?: (notice: ExistingAccountNotice) => Promise<void> | void;
  /** Called once, by the confirm that marked the account verified, with the account's normalized email. */
  readonly onVerified?: (accountId: string, account: { readonly email: string }) => Promise<void> | void;
  /** Returns problems (empty when acceptable). Default: defaultPasswordPolicy (NIST SP 800-63B style). */
  readonly passwordPolicy?: PasswordPolicy;
  /** Default: scrypt on node:crypto (createScryptHasher()). */
  readonly hasher?: PasswordHasher;
  /** Link lifetime. Default 24 hours; 15 minutes to 7 days. */
  readonly ttlMs?: number;
  /** Minimum time between verification emails per account. Default 60 seconds. */
  readonly resendCooldownMs?: number;
  /** Most verification emails per account per window (the signup email counts). Default 5 per hour. */
  readonly maxSendsPerWindow?: number;
  readonly sendWindowMs?: number;
  /** Total sendEmail attempts per link, with the same idempotency key. Default 3. */
  readonly sendAttempts?: number;
  /**
   * Waits between attempts in milliseconds: entry i follows attempt i + 1, and the last entry repeats. Default
   * [250, 1000, 2000, 4000, ...] (doubling). Each 0 to 120,000; 0 means retry at once.
   */
  readonly retryDelaysMs?: readonly number[];
  /** How a wait happens (setTimeout by default). Inject for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly newId?: () => string;
}

export type SignupErrorCode =
  | "invalid-email" | "weak-password" | "invalid-token" | "unverified" | "rate-limited" | "delivery-failed" | "bad-request";

export class SignupError extends Error {
  readonly code: SignupErrorCode;
  readonly problems: readonly string[];
  readonly retryAfterMs?: number;
  constructor(code: SignupErrorCode, message: string, details: { problems?: readonly string[]; retryAfterMs?: number } = {}) {
    super(message);
    this.code = code;
    this.problems = details.problems ?? [];
    if (details.retryAfterMs !== undefined) this.retryAfterMs = details.retryAfterMs;
    this.name = "SignupError";
  }
}

/**
 * Result of `signup` and `resend`. `serverError` is for logs only and must never reach the requester: exposing it
 * would reveal whether the email is registered.
 */
export interface PublicResult {
  readonly ok: true;
  /** Server-only, like serverError: the id of the account this call created. Absent when the email was registered. */
  readonly accountId?: string;
  readonly serverError?: "existing-account" | "existing-account-notice-failed" | "unknown-account" | "already-verified" | "rate-limited" | "delivery-failed" | "invalid-email";
}

const MINUTE = 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_PASSWORD = 4096;
// WHATWG "valid e-mail address" (ASCII), applied after trimming and lowercasing.
const WHATWG_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Normalizes an email for storage and comparison: trims, lowercases the whole address (local parts are
 * case-insensitive at virtually every provider), and validates it as a WHATWG valid email with a dotted domain,
 * a local part of at most 64 and a total of at most 254 characters. Returns null when invalid. Does not fold
 * provider-specific aliases (plus tags, Gmail dots).
 */
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string" || email.length > 320) return null;
  const text = email.trim().toLowerCase();
  if (text.length > 254 || !WHATWG_EMAIL.test(text)) return null;
  const at = text.indexOf("@");
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (local.length > 64 || !domain.includes(".")) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  return text;
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

/** Throws SignupError("unverified") unless the account exists and is verified. Use before any gated feature. */
export function assertVerified(account: Pick<SignupAccount, "verifiedAt"> | null | undefined): void {
  if (!account || account.verifiedAt === undefined) throw new SignupError("unverified", "Verify your email address to use this feature");
}

function isPending(token: VerificationToken, now: number): boolean {
  return token.usedAt === undefined && token.revokedAt === undefined && now < token.expiresAt;
}

function intInRange(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

export function createEmailSignup(options: EmailSignupOptions) {
  const ttlMs = intInRange(options.ttlMs ?? 24 * 60 * MINUTE, 15 * MINUTE, 7 * 24 * 60 * MINUTE, "ttlMs");
  const limits: SendLimits = {
    cooldownMs: intInRange(options.resendCooldownMs ?? MINUTE, 0, 24 * 60 * MINUTE, "resendCooldownMs"),
    windowMs: intInRange(options.sendWindowMs ?? 60 * MINUTE, MINUTE, 7 * 24 * 60 * MINUTE, "sendWindowMs"),
    maxPerWindow: intInRange(options.maxSendsPerWindow ?? 5, 1, 100, "maxSendsPerWindow"),
  };
  const sendAttempts = intInRange(options.sendAttempts ?? 3, 1, 10, "sendAttempts");
  const retryDelays = options.retryDelaysMs;
  if (retryDelays !== undefined && (!Array.isArray(retryDelays) || retryDelays.length === 0)) throw new RangeError("retryDelaysMs must list at least one delay");
  retryDelays?.forEach((ms, index) => intInRange(ms, 0, 120_000, `retryDelaysMs[${index}]`));
  /** The wait after failed attempt `attempt` (1-based). */
  const retryDelay = (attempt: number): number => retryDelays
    ? (retryDelays[Math.min(attempt, retryDelays.length) - 1] as number)
    : (attempt === 1 ? 250 : 1000 * 2 ** (attempt - 2));
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(base.hostname))) {
    throw new RangeError("baseUrl must be https (http only for localhost)");
  }
  if (base.search || base.hash) throw new RangeError("baseUrl must not carry a query or fragment");
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const newId = options.newId ?? (() => crypto.randomUUID());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const policy = options.passwordPolicy ?? defaultPasswordPolicy;
  let hasher = options.hasher;
  const getHasher = (): PasswordHasher => (hasher ??= createScryptHasher());
  let dummyHash: Promise<string> | undefined;
  const { store } = options;

  function retryAfter(account: SignupAccount, at: number): number {
    let until = account.lastSentAt === undefined ? at : account.lastSentAt + limits.cooldownMs;
    const inWindow = account.recentSends.filter((sentAt) => at - sentAt < limits.windowMs).sort((a, b) => a - b);
    if (inWindow.length >= limits.maxPerWindow) {
      // A slot opens when enough of the oldest sends have left the rolling window.
      until = Math.max(until, (inWindow[inWindow.length - limits.maxPerWindow] as number) + limits.windowMs);
    }
    return Math.max(1000, until - at);
  }

  /** Delivers with retries; every attempt carries the same idempotency key. Returns whether it was accepted. */
  async function deliver(message: VerificationEmail): Promise<boolean> {
    for (let attempt = 1; attempt <= sendAttempts; attempt++) {
      try {
        await options.sendEmail(message);
        return true;
      } catch {
        const wait = retryDelay(attempt);
        if (attempt < sendAttempts && wait > 0) await sleep(wait);
      }
    }
    return false;
  }

  /** Issues a fresh link (revoking earlier ones) and emails it. The send must already be reserved. */
  async function issue(account: SignupAccount, reason: VerificationEmail["reason"], at: number): Promise<boolean> {
    const token = base64Url(randomBytes(32));
    const record: VerificationToken = {
      id: newId(), accountId: account.id, tokenHash: await hashToken(token), email: account.email,
      createdAt: at, expiresAt: at + ttlMs,
    };
    await store.issueToken(record);
    const link = `${base.href}?token=${encodeURIComponent(token)}`;
    const delivered = await deliver({
      to: account.email, link, expiresAt: record.expiresAt, idempotencyKey: `email-verification:${record.id}`, reason,
    });
    if (!delivered) {
      // The provider may or may not have sent it; revoking makes any delivered copy inert.
      await store.revokeToken(record.id, at).catch(() => undefined);
    }
    return delivered;
  }

  async function checkPassword(password: unknown, email: string): Promise<string> {
    if (typeof password !== "string" || password.length === 0) throw new SignupError("weak-password", "Choose a password", { problems: ["empty"] });
    if (password.length > MAX_PASSWORD) throw new SignupError("weak-password", "Password is too long", { problems: ["too-long"] });
    const problems = [...(await policy(password, { email }))];
    if (problems.length > 0) throw new SignupError("weak-password", "Password does not meet the policy", { problems });
    return password;
  }

  async function resendTo(account: SignupAccount): Promise<"sent" | "already-verified" | "rate-limited" | "delivery-failed"> {
    if (account.verifiedAt !== undefined) return "already-verified";
    const at = now();
    if (!(await store.reserveSend(account.id, at, limits))) return "rate-limited";
    return (await issue(account, "resend", at)) ? "sent" : "delivery-failed";
  }

  return {
    limits,

    /**
     * Creates an unverified account and emails a verification link. Format and password-policy problems throw
     * SignupError (they reveal nothing about other accounts). Otherwise always resolves to `{ ok: true }`, whether
     * the account was created or the email was already registered (then onExistingAccount runs instead).
     */
    async signup(email: string, password: string): Promise<PublicResult> {
      const normalized = normalizeEmail(email);
      if (normalized === null) throw new SignupError("invalid-email", "Enter a valid email address");
      const checked = await checkPassword(password, normalized);
      // Hash on every path, so registered and new emails cost the same CPU work.
      const passwordHash = await getHasher().hash(checked);
      const at = now();
      const account: SignupAccount = { id: newId(), email: normalized, passwordHash, createdAt: at, recentSends: [] };
      if (!(await store.createAccount(account))) {
        const existing = await store.findAccountByEmail(normalized);
        if (existing && options.onExistingAccount) {
          try {
            await options.onExistingAccount({ accountId: existing.id, email: existing.email, verified: existing.verifiedAt !== undefined });
          } catch {
            // Same public outcome as a failed verification email on the new-account path; report server-side only.
            return { ok: true, serverError: "existing-account-notice-failed" };
          }
        }
        return { ok: true, serverError: "existing-account" };
      }
      const accountId = account.id;
      if (!(await store.reserveSend(account.id, at, limits))) return { ok: true, accountId, serverError: "rate-limited" };
      return (await issue(account, "signup", at)) ? { ok: true, accountId } : { ok: true, accountId, serverError: "delivery-failed" };
    },

    /**
     * Checks an email and password against a signup account (for a sign-in step; sessions are yours). Returns the
     * account id, or null for a malformed or unknown email or a wrong password. Unknown emails still run one verify
     * against a dummy hash, so the timing does not reveal which emails are registered. Unverified accounts are
     * returned too: gate features with isVerified or requireVerified.
     */
    async verifyPassword(email: string, password: string): Promise<string | null> {
      const normalized = normalizeEmail(email);
      const account = normalized === null ? null : await store.findAccountByEmail(normalized);
      const candidate = typeof password === "string" && password.length > 0 && password.length <= MAX_PASSWORD ? password : null;
      const stored = account?.passwordHash ?? (await (dummyHash ??= getHasher().hash("genlib-email-signup-dummy-password")));
      const matches = await getHasher().verify(candidate ?? "", stored);
      return account && candidate !== null && matches ? account.id : null;
    },

    /** Signed-out resend by email: always `{ ok: true }` publicly; rate limits and failures are server-only. */
    async resend(email: string): Promise<PublicResult> {
      const normalized = normalizeEmail(email);
      if (normalized === null) return { ok: true, serverError: "invalid-email" };
      const account = await store.findAccountByEmail(normalized);
      if (!account) return { ok: true, serverError: "unknown-account" };
      const outcome = await resendTo(account);
      return outcome === "sent" ? { ok: true } : { ok: true, serverError: outcome };
    },

    /**
     * Signed-in resend for the current (unverified) account. Throws rate-limited with retryAfterMs, or
     * delivery-failed; returns whether the account was already verified.
     */
    async resendForAccount(accountId: string): Promise<{ alreadyVerified: boolean }> {
      const account = await store.findAccountById(accountId);
      if (!account) throw new SignupError("bad-request", "Unknown account");
      const outcome = await resendTo(account);
      if (outcome === "rate-limited") {
        const fresh = (await store.findAccountById(accountId)) ?? account;
        throw new SignupError("rate-limited", "Please wait before requesting another email", { retryAfterMs: retryAfter(fresh, now()) });
      }
      if (outcome === "delivery-failed") throw new SignupError("delivery-failed", "The verification email could not be sent");
      return { alreadyVerified: outcome === "already-verified" };
    },

    /**
     * Confirms a link: consumes the token once and marks the account verified once. `newlyVerified` is true only
     * for the confirm that made the transition. Unknown, malformed, expired, used and revoked tokens all fail with
     * invalid-token.
     */
    async confirm(token: string): Promise<{ accountId: string; newlyVerified: boolean }> {
      const invalid = () => new SignupError("invalid-token", "This verification link is invalid or has expired");
      if (typeof token !== "string" || !TOKEN.test(token)) throw invalid();
      const tokenHash = await hashToken(token);
      const at = now();
      const record = await store.findTokenByHash(tokenHash);
      if (!record || !constantTimeEqual(record.tokenHash, tokenHash) || !isPending(record, at)) throw invalid();
      const account = await store.findAccountById(record.accountId);
      if (!account || account.email !== record.email) {
        await store.revokeToken(record.id, at);
        throw invalid();
      }
      const consumed = await store.consumeToken(tokenHash, at);
      if (!consumed) throw invalid();
      const newlyVerified = await store.markVerified(consumed.accountId, at);
      await store.revokePendingTokens(consumed.accountId, at, consumed.id);
      if (newlyVerified && options.onVerified) await options.onVerified(consumed.accountId, { email: account.email });
      return { accountId: consumed.accountId, newlyVerified };
    },

    /** Whether the account exists and has confirmed its email. */
    async isVerified(accountId: string): Promise<boolean> {
      const account = await store.findAccountById(accountId);
      return account !== null && account.verifiedAt !== undefined;
    },

    /** Throws SignupError("unverified") unless the account is verified. Call before every gated feature. */
    async requireVerified(accountId: string): Promise<SignupAccount> {
      const account = await store.findAccountById(accountId);
      assertVerified(account);
      return account as SignupAccount;
    },
  };
}

export type EmailSignup = ReturnType<typeof createEmailSignup>;
