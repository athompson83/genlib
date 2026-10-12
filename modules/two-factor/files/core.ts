// SPDX-License-Identifier: Apache-2.0
// Two-factor authentication with an authenticator app (TOTP, RFC 6238), framework-neutral and Web Crypto only.
// The receiving application supplies persistence (TwoFactorStore), an AES-256-GCM key ring for secrets at rest,
// a pepper for recovery-code hashes, and the time the user last entered their password (for step-up checks).
//
// Flow: beginEnrollment -> show the otpauth URI as a QR code -> confirmEnrollment(code) turns 2FA on and returns
// recovery codes once -> verify(code) or verifyRecoveryCode(code) at sign-in -> disable / regenerateRecoveryCodes
// only with recent re-authentication.

/** AES-256-GCM ciphertext of the raw TOTP secret. `iv` and `ciphertext` are standard base64. */
export interface EncryptedSecret {
  readonly keyId: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export interface TwoFactorEnrollment {
  readonly userId: string;
  readonly status: "pending" | "active";
  readonly secret: EncryptedSecret;
  readonly createdAt: number;
  /** Set while pending: after this instant the pending secret can no longer be confirmed. */
  readonly pendingExpiresAt?: number;
  readonly confirmedAt?: number;
  /** Highest accepted time step; codes for this step or earlier are rejected. */
  readonly lastUsedStep: number | null;
}

export interface AttemptWindow {
  /** Attempts in the current window, including the one just registered. */
  readonly count: number;
  readonly windowStart: number;
  /** Lockout mode only: the account is locked until this instant (set by the attempt that reached the limit). */
  readonly lockedUntil?: number;
}

/** Passed to registerAttempt when lockoutMs is configured (consecutive-failure lockout). */
export interface AttemptLockout {
  readonly maxAttempts: number;
  readonly lockoutMs: number;
}

export interface TwoFactorStore {
  get(userId: string): Promise<TwoFactorEnrollment | null>;
  /** Inserts or replaces a PENDING enrollment. Must not overwrite an active one: return false in that case. */
  savePending(enrollment: TwoFactorEnrollment): Promise<boolean>;
  /**
   * One conditional step: if the user's enrollment is pending, unexpired at `now` and still holds `ciphertext`,
   * mark it active with `lastUsedStep = step` and replace the user's recovery codes with `recoveryHashes`.
   */
  activate(userId: string, ciphertext: string, step: number, now: number, recoveryHashes: readonly string[]): Promise<boolean>;
  /**
   * One conditional update: set lastUsedStep = step only if the enrollment is active and lastUsedStep is null or
   * lower. Returns whether it changed, so exactly one of several concurrent verifies of one code wins.
   */
  advanceStep(userId: string, step: number): Promise<boolean>;
  /** Replaces the stored secret only if it still holds `oldCiphertext` (key rotation). */
  updateSecret(userId: string, oldCiphertext: string, secret: EncryptedSecret): Promise<boolean>;
  /** Replaces all recovery codes of an ACTIVE enrollment; returns false when there is none. */
  replaceRecoveryCodes(userId: string, recoveryHashes: readonly string[], now: number): Promise<boolean>;
  /** Marks one unused recovery code used in one conditional statement; returns whether it changed. */
  consumeRecoveryCode(userId: string, codeHash: string, now: number): Promise<boolean>;
  countRecoveryCodes(userId: string): Promise<number>;
  /** Deletes the enrollment and every recovery code of the user. */
  remove(userId: string): Promise<boolean>;
  /**
   * Atomically counts one verification attempt in a fixed window: starts a new window (count 1) when the current
   * one began at or before `now - windowMs`, otherwise increments. With `lockout`, a lock that has ended also starts
   * a new count; while a lock is active the count still increments but lockedUntil is kept (never extended); and the
   * attempt that brings the count to lockout.maxAttempts sets lockedUntil = now + lockout.lockoutMs. One statement.
   */
  registerAttempt(userId: string, now: number, windowMs: number, lockout?: AttemptLockout): Promise<AttemptWindow>;
  clearAttempts(userId: string): Promise<void>;
}

/** A raw 32-byte key or an imported AES-GCM CryptoKey. */
export type SecretKey = Uint8Array | CryptoKey;

export interface TwoFactorOptions {
  readonly store: TwoFactorStore;
  /** Shown in the authenticator app. Must not contain ":". */
  readonly issuer: string;
  /** Key ring for secrets at rest. New secrets use `currentKeyId`; older ids keep decrypting until removed. */
  readonly encryption: { readonly currentKeyId: string; readonly keys: Readonly<Record<string, SecretKey>> };
  /** HMAC-SHA-256 key for recovery codes: at least 32 random bytes, or an imported HMAC CryptoKey. */
  readonly recoveryPepper: Uint8Array | CryptoKey;
  /** Secret length in bytes. Default 20 (160 bits); 20 to 64. */
  readonly secretBytes?: number;
  /** How long a pending enrollment can be confirmed. Default 15 minutes; 1 to 60 minutes. */
  readonly pendingTtlMs?: number;
  /** Failed-or-not attempts allowed per account per window. Default 5. */
  readonly maxAttempts?: number;
  /** Attempt window. Default 15 minutes. Not used with lockoutMs. */
  readonly attemptWindowMs?: number;
  /**
   * Switches to consecutive-failure lockout: after maxAttempts attempts without a success the account is locked for
   * lockoutMs from the attempt that reached the limit; attempts while locked are refused without extending it; the
   * count resets on a success or when the lock ends, and does not roll off with time. 1 minute to 24 hours.
   */
  readonly lockoutMs?: number;
  /** Ignore spaces in authenticator codes ("123 456"). Default true; false accepts exactly six ASCII digits only. */
  readonly allowCodeSpaces?: boolean;
  /** Re-authentication must be this recent to disable 2FA or regenerate codes. Default 10 minutes. */
  readonly stepUpMaxAgeMs?: number;
  /** Number of recovery codes. Default 10; 4 to 20. */
  readonly recoveryCodeCount?: number;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

export type TwoFactorErrorCode =
  | "invalid-code" | "rate-limited" | "not-enabled" | "already-enabled" | "no-pending-enrollment"
  | "reauthentication-required" | "secret-unreadable" | "bad-request";

export class TwoFactorError extends Error {
  readonly code: TwoFactorErrorCode;
  /** For rate-limited: milliseconds until the window resets. */
  readonly retryAfterMs: number | undefined;
  constructor(code: TwoFactorErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.name = "TwoFactorError";
  }
}

const MINUTE = 60_000;
const PERIOD_MS = 30_000;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const encoder = new TextEncoder();

/** RFC 4648 base32 without padding. */
export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

/** Decodes base32, ignoring case, spaces and trailing padding. Throws RangeError on other characters. */
export function base32Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new RangeError("Invalid base32 character");
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** Compares two strings in time that depends only on their length. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function bytesView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

/** RFC 6238 TOTP with HMAC-SHA-1 and a 30-second period. `digits` 6 (default) to 8. */
export async function totpCode(secret: Uint8Array, timeMs: number, options: { digits?: number } = {}): Promise<string> {
  return hotpForStep(secret, Math.floor(timeMs / PERIOD_MS), options.digits ?? DIGITS);
}

async function hotpForStep(secret: Uint8Array, step: number, digits: number): Promise<string> {
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new RangeError("digits must be 6 to 8");
  const counter = new Uint8Array(8);
  const view = new DataView(counter.buffer);
  view.setUint32(0, Math.floor(step / 2 ** 32));
  view.setUint32(4, step >>> 0);
  const key = await crypto.subtle.importKey("raw", bytesView(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = (mac[19] ?? 0) & 15;
  const binary = (((mac[offset] ?? 0) & 0x7f) << 24) | ((mac[offset + 1] ?? 0) << 16) | ((mac[offset + 2] ?? 0) << 8) | (mac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** otpauth://totp/Issuer:account?secret=...&issuer=Issuer (issuer and label percent-encoded). */
export function buildOtpauthUri(input: { issuer: string; accountName: string; secret: string }): string {
  for (const [name, value] of [["issuer", input.issuer], ["accountName", input.accountName]] as const) {
    if (typeof value !== "string" || value.length === 0 || value.length > 200 || value.includes(":")) {
      throw new RangeError(`${name} must be 1 to 200 characters without ":"`);
    }
  }
  const issuer = encodeURIComponent(input.issuer);
  const label = `${issuer}:${encodeURIComponent(input.accountName)}`;
  return `otpauth://totp/${label}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_MS / 1000}`;
}

/** Uppercase, without spaces or dashes; the form hashed and compared. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

async function hmacKey(pepper: Uint8Array | CryptoKey): Promise<CryptoKey> {
  if (pepper instanceof Uint8Array) {
    return crypto.subtle.importKey("raw", bytesView(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return pepper;
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Hex HMAC-SHA-256(pepper, normalized code). */
export async function hashRecoveryCode(pepper: Uint8Array | CryptoKey, code: string): Promise<string> {
  const key = await hmacKey(pepper);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(normalizeRecoveryCode(code)))));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

const aad = (userId: string): Uint8Array<ArrayBuffer> => bytesView(encoder.encode(`genlib-two-factor:v1:${userId}`));

export function createTwoFactor(options: TwoFactorOptions) {
  const secretBytes = options.secretBytes ?? 20;
  if (!Number.isInteger(secretBytes) || secretBytes < 20 || secretBytes > 64) throw new RangeError("secretBytes must be 20 to 64");
  const pendingTtl = options.pendingTtlMs ?? 15 * MINUTE;
  if (!Number.isInteger(pendingTtl) || pendingTtl < MINUTE || pendingTtl > 60 * MINUTE) throw new RangeError("pendingTtlMs must be 1 to 60 minutes");
  const maxAttempts = options.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new RangeError("maxAttempts must be 1 to 100");
  const windowMs = options.attemptWindowMs ?? 15 * MINUTE;
  if (!Number.isInteger(windowMs) || windowMs < MINUTE) throw new RangeError("attemptWindowMs must be at least 1 minute");
  const lockoutMs = options.lockoutMs;
  if (lockoutMs !== undefined && (!Number.isInteger(lockoutMs) || lockoutMs < MINUTE || lockoutMs > 24 * 60 * MINUTE)) throw new RangeError("lockoutMs must be 1 minute to 24 hours");
  const lockout: AttemptLockout | undefined = lockoutMs === undefined ? undefined : { maxAttempts, lockoutMs };
  const allowCodeSpaces = options.allowCodeSpaces ?? true;
  const stepUpMax = options.stepUpMaxAgeMs ?? 10 * MINUTE;
  if (!Number.isInteger(stepUpMax) || stepUpMax < MINUTE || stepUpMax > 60 * MINUTE) throw new RangeError("stepUpMaxAgeMs must be 1 to 60 minutes");
  const codeCount = options.recoveryCodeCount ?? 10;
  if (!Number.isInteger(codeCount) || codeCount < 4 || codeCount > 20) throw new RangeError("recoveryCodeCount must be 4 to 20");
  buildOtpauthUri({ issuer: options.issuer, accountName: "check", secret: "" });
  const { currentKeyId, keys } = options.encryption;
  if (!Object.hasOwn(keys, currentKeyId)) throw new RangeError("encryption.currentKeyId must name a key in encryption.keys");
  for (const [id, key] of Object.entries(keys)) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) throw new RangeError("Key ids must be 1 to 64 letters, digits, dot, dash or underscore");
    if (key instanceof Uint8Array && key.length !== 32) throw new RangeError("Raw encryption keys must be 32 bytes (AES-256)");
  }
  if (options.recoveryPepper instanceof Uint8Array && options.recoveryPepper.length < 32) throw new RangeError("recoveryPepper must be at least 32 bytes");
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const { store } = options;

  const imported = new Map<string, Promise<CryptoKey>>();
  function aesKey(id: string): Promise<CryptoKey> {
    if (!Object.hasOwn(keys, id)) throw new TwoFactorError("secret-unreadable", "The secret's encryption key is not configured");
    let key = imported.get(id);
    if (!key) {
      const raw = keys[id] as SecretKey;
      key = raw instanceof Uint8Array
        ? crypto.subtle.importKey("raw", bytesView(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
        : Promise.resolve(raw);
      imported.set(id, key);
    }
    return key;
  }
  const pepperKey = hmacKey(options.recoveryPepper);

  async function encrypt(userId: string, secret: Uint8Array): Promise<EncryptedSecret> {
    const iv = bytesView(randomBytes(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(userId) }, await aesKey(currentKeyId), bytesView(secret)));
    return { keyId: currentKeyId, iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
  }

  async function decrypt(userId: string, secret: EncryptedSecret): Promise<Uint8Array> {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytesView(fromBase64(secret.iv)), additionalData: aad(userId) },
        await aesKey(secret.keyId), bytesView(fromBase64(secret.ciphertext)),
      );
      return new Uint8Array(plain);
    } catch {
      throw new TwoFactorError("secret-unreadable", "The stored secret cannot be decrypted");
    }
  }

  const invalid = () => new TwoFactorError("invalid-code", "The code is invalid");

  /** Counts this attempt first, so concurrent guesses can never exceed the limit. */
  async function spendAttempt(userId: string): Promise<void> {
    const at = now();
    // In lockout mode the count never rolls off with time; only a success or the end of a lock resets it.
    const window = lockout
      ? await store.registerAttempt(userId, at, Number.MAX_SAFE_INTEGER, lockout)
      : await store.registerAttempt(userId, at, windowMs);
    if (window.count > maxAttempts) {
      const until = lockout ? (window.lockedUntil ?? at + lockout.lockoutMs) : window.windowStart + windowMs;
      throw new TwoFactorError("rate-limited", "Too many attempts; try again later", Math.max(1, until - at));
    }
  }

  /**
   * Returns the matching time step in [current - 1, current + 1], or null. Every candidate is computed and compared
   * in constant time, with no early exit.
   */
  async function matchStep(secret: Uint8Array, code: unknown, at: number): Promise<number | null> {
    if (typeof code !== "string" || code.length > 16) return null;
    const clean = allowCodeSpaces ? code.replace(/\s/g, "") : code;
    if (!/^[0-9]{6}$/.test(clean)) return null;
    const current = Math.floor(at / PERIOD_MS);
    let matched: number | null = null;
    for (const step of [current - 1, current, current + 1]) {
      const ok = constantTimeEqual(await hotpForStep(secret, step, DIGITS), clean);
      if (ok && matched === null) matched = step;
    }
    return matched;
  }

  function newRecoveryCodes(): string[] {
    const codes = new Set<string>();
    while (codes.size < codeCount) {
      const text = base32Encode(randomBytes(7)).slice(0, 10); // 50 bits each
      codes.add(`${text.slice(0, 5)}-${text.slice(5)}`);
    }
    return [...codes];
  }

  async function hashAll(codes: readonly string[]): Promise<string[]> {
    const key = await pepperKey;
    return Promise.all(codes.map((code) => hashRecoveryCode(key, code)));
  }

  function requireRecentAuth(authenticatedAt: unknown): void {
    const at = now();
    if (typeof authenticatedAt !== "number" || !Number.isFinite(authenticatedAt) || authenticatedAt > at + 5_000 || at - authenticatedAt > stepUpMax) {
      throw new TwoFactorError("reauthentication-required", "Sign in again to change two-factor settings");
    }
  }

  async function active(userId: string): Promise<TwoFactorEnrollment> {
    const enrollment = await store.get(userId);
    if (!enrollment || enrollment.status !== "active") throw new TwoFactorError("not-enabled", "Two-factor authentication is not enabled");
    return enrollment;
  }

  return {
    /**
     * Starts (or restarts) enrollment with a fresh secret. Returns the base32 secret and otpauth URI for the QR code;
     * this is the only time the secret leaves the server. Refused once 2FA is active.
     */
    async beginEnrollment(userId: string, input: { accountName: string }): Promise<{ secret: string; otpauthUri: string; expiresAt: number }> {
      const accountName = input?.accountName;
      if (typeof accountName !== "string" || accountName.length === 0 || accountName.length > 200 || accountName.includes(":")) {
        throw new TwoFactorError("bad-request", "accountName must be 1 to 200 characters without \":\"");
      }
      const existing = await store.get(userId);
      if (existing?.status === "active") throw new TwoFactorError("already-enabled", "Two-factor authentication is already enabled");
      const raw = randomBytes(secretBytes);
      if (raw.length !== secretBytes) throw new RangeError("randomBytes returned the wrong length");
      const secret = base32Encode(raw);
      const otpauthUri = buildOtpauthUri({ issuer: options.issuer, accountName, secret });
      const at = now();
      const enrollment: TwoFactorEnrollment = {
        userId, status: "pending", secret: await encrypt(userId, raw), createdAt: at, pendingExpiresAt: at + pendingTtl, lastUsedStep: null,
      };
      if (!(await store.savePending(enrollment))) throw new TwoFactorError("already-enabled", "Two-factor authentication is already enabled");
      return { secret, otpauthUri, expiresAt: at + pendingTtl };
    },

    /**
     * Turns 2FA on after a valid code for the pending secret. Returns the recovery codes, shown once. The code's time
     * step is recorded, so it cannot then be replayed at sign-in.
     */
    async confirmEnrollment(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
      await spendAttempt(userId);
      const at = now();
      const pending = await store.get(userId);
      if (!pending || pending.status !== "pending" || pending.pendingExpiresAt === undefined || at >= pending.pendingExpiresAt) {
        throw new TwoFactorError("no-pending-enrollment", "Start enrollment again");
      }
      const step = await matchStep(await decrypt(userId, pending.secret), code, at);
      if (step === null) throw invalid();
      const recoveryCodes = newRecoveryCodes();
      if (!(await store.activate(userId, pending.secret.ciphertext, step, at, await hashAll(recoveryCodes)))) {
        throw new TwoFactorError("no-pending-enrollment", "Start enrollment again");
      }
      await store.clearAttempts(userId);
      return { recoveryCodes };
    },

    /** Checks a sign-in code. Each time step is accepted at most once; failures count toward the attempt limit. */
    async verify(userId: string, code: string): Promise<{ ok: true; method: "totp" }> {
      await spendAttempt(userId);
      const enrollment = await active(userId);
      const at = now();
      const step = await matchStep(await decrypt(userId, enrollment.secret), code, at);
      if (step === null) throw invalid();
      if (enrollment.lastUsedStep !== null && step <= enrollment.lastUsedStep) throw invalid();
      if (!(await store.advanceStep(userId, step))) throw invalid();
      await store.clearAttempts(userId);
      return { ok: true, method: "totp" };
    },

    /** Signs in with a one-time recovery code instead of a TOTP code; shares the attempt limit. */
    async verifyRecoveryCode(userId: string, code: string): Promise<{ ok: true; method: "recovery-code"; remaining: number }> {
      await spendAttempt(userId);
      await active(userId);
      if (typeof code !== "string" || code.length > 64) throw invalid();
      const normalized = normalizeRecoveryCode(code);
      if (!/^[A-Z2-7]{10}$/.test(normalized)) throw invalid();
      const hash = await hashRecoveryCode(await pepperKey, normalized);
      if (!(await store.consumeRecoveryCode(userId, hash, now()))) throw invalid();
      await store.clearAttempts(userId);
      return { ok: true, method: "recovery-code", remaining: await store.countRecoveryCodes(userId) };
    },

    /** Whether sign-in must ask for a second factor. A pending enrollment does not count. */
    async isEnabled(userId: string): Promise<boolean> {
      return (await store.get(userId))?.status === "active";
    },

    /** Safe to show the user; never includes the secret. */
    async status(userId: string): Promise<{ enabled: boolean; pending: boolean; recoveryCodesRemaining: number }> {
      const enrollment = await store.get(userId);
      const enabled = enrollment?.status === "active";
      const pending = enrollment?.status === "pending" && enrollment.pendingExpiresAt !== undefined && now() < enrollment.pendingExpiresAt;
      return { enabled, pending, recoveryCodesRemaining: enabled ? await store.countRecoveryCodes(userId) : 0 };
    },

    /** Replaces every recovery code. Requires re-authentication within stepUpMaxAgeMs. */
    async regenerateRecoveryCodes(userId: string, auth: { authenticatedAt?: number }): Promise<{ recoveryCodes: string[] }> {
      requireRecentAuth(auth.authenticatedAt);
      await active(userId);
      const recoveryCodes = newRecoveryCodes();
      if (!(await store.replaceRecoveryCodes(userId, await hashAll(recoveryCodes), now()))) {
        throw new TwoFactorError("not-enabled", "Two-factor authentication is not enabled");
      }
      return { recoveryCodes };
    },

    /** Turns 2FA off and deletes the secret and recovery codes. Requires re-authentication within stepUpMaxAgeMs. */
    async disable(userId: string, auth: { authenticatedAt?: number }): Promise<void> {
      requireRecentAuth(auth.authenticatedAt);
      await active(userId);
      await store.remove(userId);
    },

    /** Re-encrypts the user's secret under the current key id; returns false when it already uses it. */
    async reencryptSecret(userId: string): Promise<boolean> {
      const enrollment = await store.get(userId);
      if (!enrollment || enrollment.secret.keyId === currentKeyId) return false;
      const secret = await encrypt(userId, await decrypt(userId, enrollment.secret));
      return store.updateSecret(userId, enrollment.secret.ciphertext, secret);
    },
  };
}

export type TwoFactor = ReturnType<typeof createTwoFactor>;
