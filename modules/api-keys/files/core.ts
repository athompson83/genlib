// SPDX-License-Identifier: Apache-2.0
// API keys for multi-tenant apps, framework-neutral. A key looks like `<appPrefix>_<live|test>_<lookupId>_<secret>`:
// the first three parts are a non-secret, identifiable prefix (safe to show in lists, logs and audit events); the
// secret is 43 base62 characters (about 256 bits) drawn by rejection sampling from a CSPRNG. Only an HMAC-SHA-256 of
// the whole key under a server-held pepper is stored. Verification looks the record up by the lookup id and compares
// digests in constant time; revocation and expiry are read from the store on every request, so they apply at once.
// The receiving application supplies persistence, authorization and the scopes each member holds.

export type ApiKeyEnvironment = "live" | "test";

/** What callers may see about a key. Never contains the secret or its hash. */
export interface ApiKeyInfo {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  /** `<appPrefix>_<environment>_<lookupId>`: non-secret, identifies the key in lists and logs. */
  readonly prefix: string;
  readonly environment: ApiKeyEnvironment;
  readonly scopes: readonly string[];
  readonly createdBy: string;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly revokedAt: number | null;
  readonly revokedBy: string | null;
  readonly lastUsedAt: number | null;
}

/** The stored row: the info plus the lookup id and the hex HMAC-SHA-256 of the full key. */
export interface ApiKeyRecord extends ApiKeyInfo {
  readonly lookupId: string;
  readonly keyHash: string;
}

export interface ApiKeyStore {
  /** Inserts the record and returns true, or false when `lookupId` is already taken (unique index). */
  insert(record: ApiKeyRecord): Promise<boolean>;
  findById(id: string): Promise<ApiKeyRecord | null>;
  findByLookupId(lookupId: string): Promise<ApiKeyRecord | null>;
  /** One tenant's keys, newest first (createdAt, then id, descending). */
  listByTenant(tenantId: string): Promise<ApiKeyRecord[]>;
  /** Sets revokedAt/revokedBy when the key is not yet revoked and returns the updated record; null otherwise. */
  revoke(id: string, at: number, by: string): Promise<ApiKeyRecord | null>;
  /**
   * ONE conditional write: set lastUsedAt = at only when the key is unrevoked and lastUsedAt is null or at most
   * `notAfter`. Returns true when it wrote. This throttles last-used writes to one per interval.
   */
  touchLastUsed(id: string, at: number, notAfter: number): Promise<boolean>;
}

export interface Actor { readonly userId: string }
export type ApiKeyAction = "create" | "list" | "revoke";

export type ApiKeyAuditEvent =
  | { readonly type: "key.created"; readonly at: number; readonly tenantId: string; readonly keyId: string; readonly prefix: string; readonly actorId: string; readonly scopes: readonly string[]; readonly expiresAt: number | null }
  | { readonly type: "key.revoked"; readonly at: number; readonly tenantId: string; readonly keyId: string; readonly prefix: string; readonly actorId: string }
  | { readonly type: "key.used"; readonly at: number; readonly tenantId: string; readonly keyId: string; readonly prefix: string }
  | { readonly type: "key.denied"; readonly at: number; readonly reason: ApiKeyDenyReason; readonly tenantId?: string; readonly keyId?: string; readonly prefix?: string };

export type ApiKeyDenyReason = "invalid-key" | "revoked" | "expired" | "environment-not-allowed" | "insufficient-scope";

export interface ApiKeyOptions {
  readonly store: ApiKeyStore;
  /** Decide whether `actor` may create, list or revoke keys in `tenantId`. Return false to deny. */
  readonly authorize: (actor: Actor, action: ApiKeyAction, target: Readonly<{ tenantId: string }>) => Promise<boolean>;
  /** The scopes `actor` holds in `tenantId`. A new key may only carry scopes from this list. */
  readonly holderScopes: (actor: Actor, tenantId: string) => Promise<readonly string[]>;
  /** Server-held HMAC key, at least 32 bytes, from your secret store. Never stored with the keys. */
  readonly pepper: string | Uint8Array;
  /** Lowercase letters and digits, 2-16 characters, starting with a letter. Default "sk". */
  readonly appPrefix?: string;
  /** Environments verify accepts. Default ["live", "test"]. */
  readonly acceptEnvironments?: readonly ApiKeyEnvironment[];
  /** Minimum milliseconds between last-used writes for one key. Default 60,000; 0 writes on every request. */
  readonly lastUsedIntervalMs?: number;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly newId?: () => string;
  /** Receives audit events. They carry key ids and prefixes only, never a secret or hash. Errors are swallowed. */
  readonly onAudit?: (event: ApiKeyAuditEvent) => void | Promise<void>;
}

export type ApiKeyErrorCode =
  | "forbidden" | "invalid-tenant" | "invalid-name" | "invalid-scopes" | "scope-exceeds-holder" | "invalid-expiry"
  | "invalid-environment" | "exhausted" | "not-found"
  | ApiKeyDenyReason;

export class ApiKeyError extends Error {
  readonly code: ApiKeyErrorCode;
  constructor(code: ApiKeyErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiKeyError";
  }
}

/** Base62. */
export const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Largest multiple of 62 that fits in a byte; bytes at or above it are discarded (no modulo bias). */
export const ACCEPT_BELOW = 256 - (256 % ALPHABET.length);
/** Lookup id length: 12 base62 characters (about 71 bits), unique per key, not secret. */
export const LOOKUP_LENGTH = 12;
/** Secret length: 43 base62 characters, log2(62) * 43 = 256.03 bits. */
export const SECRET_LENGTH = 43;

const TENANT = /^[\w.:-]{1,128}$/;
const SCOPE = /^[a-z][a-z0-9_.:-]{0,63}$/;
const APP_PREFIX = /^[a-z][a-z0-9]{1,15}$/;
const ID = /^[\w-]{1,64}$/;
const MAX_TIME = 8_640_000_000_000_000;
const MAX_KEY_LENGTH = 128;

/** Draws `length` base62 characters by rejection sampling over random bytes. */
export function randomBase62(length: number, randomBytes: (length: number) => Uint8Array): string {
  let out = "";
  for (let rounds = 0; out.length < length; rounds++) {
    if (rounds > 64) throw new Error("Random source keeps returning rejected bytes");
    for (const byte of randomBytes(length - out.length + 8)) {
      if (byte >= ACCEPT_BELOW) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Constant-time for equal-length inputs; differing lengths return false (digest lengths are public). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  if (!/^[0-9a-f]{64}$/.test(hex)) return out;
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Splits a presented key into its parts, or returns null when the shape is wrong. Never throws. */
export function parseApiKey(key: unknown, appPrefix: string): { environment: ApiKeyEnvironment; lookupId: string; prefix: string } | null {
  if (typeof key !== "string" || key.length > MAX_KEY_LENGTH) return null;
  const parts = key.split("_");
  if (parts.length !== 4) return null;
  const [app, environment, lookupId, secret] = parts as [string, string, string, string];
  if (app !== appPrefix || (environment !== "live" && environment !== "test")) return null;
  if (!new RegExp(`^[0-9A-Za-z]{${LOOKUP_LENGTH}}$`).test(lookupId) || !new RegExp(`^[0-9A-Za-z]{${SECRET_LENGTH}}$`).test(secret)) return null;
  return { environment, lookupId, prefix: `${app}_${environment}_${lookupId}` };
}

function toInfo(record: ApiKeyRecord): ApiKeyInfo {
  return {
    id: record.id, tenantId: record.tenantId, name: record.name, prefix: record.prefix, environment: record.environment,
    scopes: [...record.scopes], createdBy: record.createdBy, createdAt: record.createdAt, expiresAt: record.expiresAt,
    revokedAt: record.revokedAt, revokedBy: record.revokedBy, lastUsedAt: record.lastUsedAt,
  };
}

/** The authenticated principal for a request made with an API key. */
export interface ApiKeyPrincipal {
  readonly tenantId: string;
  readonly keyId: string;
  readonly prefix: string;
  readonly environment: ApiKeyEnvironment;
  readonly scopes: readonly string[];
}

export function createApiKeys(options: ApiKeyOptions) {
  const appPrefix = options.appPrefix ?? "sk";
  if (!APP_PREFIX.test(appPrefix)) throw new RangeError("appPrefix must be 2-16 lowercase letters or digits, starting with a letter");
  const pepper = typeof options.pepper === "string" ? new TextEncoder().encode(options.pepper) : Uint8Array.from(options.pepper);
  if (pepper.byteLength < 32) throw new RangeError("pepper must be at least 32 bytes");
  const environments = new Set<ApiKeyEnvironment>(options.acceptEnvironments ?? ["live", "test"]);
  const interval = options.lastUsedIntervalMs ?? 60_000;
  if (!Number.isSafeInteger(interval) || interval < 0) throw new RangeError("lastUsedIntervalMs must be a whole number of milliseconds");
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { store } = options;
  const hmacKey = crypto.subtle.importKey("raw", pepper, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Compared against when no record matches, so unknown and known lookup ids cost the same work.
  const DUMMY = new Uint8Array(32);

  async function digest(key: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey, new TextEncoder().encode(key)));
  }

  async function audit(event: ApiKeyAuditEvent): Promise<void> {
    if (!options.onAudit) return;
    try {
      await options.onAudit(event);
    } catch { /* audit sinks must not break authentication or management */ }
  }

  async function allowed(actor: Actor, action: ApiKeyAction, tenantId: string): Promise<void> {
    if (!(await options.authorize(actor, action, { tenantId }))) throw new ApiKeyError("forbidden", "Not allowed");
  }

  async function deny(reason: ApiKeyDenyReason, at: number, record: ApiKeyRecord | null, message: string): Promise<never> {
    await audit({ type: "key.denied", at, reason, ...(record ? { tenantId: record.tenantId, keyId: record.id, prefix: record.prefix } : {}) });
    throw new ApiKeyError(reason, message);
  }

  return {
    /**
     * Creates a key and returns its plaintext exactly once, with its info. Only the HMAC is stored. The requested
     * scopes must all be held by the actor in the tenant (holderScopes), so nobody can mint more access than they have.
     */
    async create(actor: Actor, input: { tenantId: string; name: string; scopes: readonly string[]; environment?: ApiKeyEnvironment; expiresAt?: number | null }): Promise<{ key: string; info: ApiKeyInfo }> {
      if (typeof input.tenantId !== "string" || !TENANT.test(input.tenantId)) throw new ApiKeyError("invalid-tenant", "Invalid tenant id");
      await allowed(actor, "create", input.tenantId);
      if (typeof input.name !== "string" || input.name.trim().length === 0 || input.name.length > 100) throw new ApiKeyError("invalid-name", "name must be 1-100 characters");
      const environment = input.environment ?? "live";
      if (environment !== "live" && environment !== "test") throw new ApiKeyError("invalid-environment", "environment must be live or test");
      const scopes = input.scopes;
      if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 50 || !scopes.every((scope) => typeof scope === "string" && SCOPE.test(scope)) || new Set(scopes).size !== scopes.length) {
        throw new ApiKeyError("invalid-scopes", "scopes must be 1-50 unique lowercase scope names");
      }
      const held = new Set(await options.holderScopes(actor, input.tenantId));
      if (!scopes.every((scope) => held.has(scope))) throw new ApiKeyError("scope-exceeds-holder", "A key cannot carry scopes its creator does not hold");
      const at = now();
      const expiresAt = input.expiresAt ?? null;
      if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= at || expiresAt > MAX_TIME)) {
        throw new ApiKeyError("invalid-expiry", "expiresAt must be a future epoch-millisecond time");
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const lookupId = randomBase62(LOOKUP_LENGTH, randomBytes);
        const prefix = `${appPrefix}_${environment}_${lookupId}`;
        const key = `${prefix}_${randomBase62(SECRET_LENGTH, randomBytes)}`;
        const record: ApiKeyRecord = {
          id: newId(), tenantId: input.tenantId, name: input.name.trim(), prefix, environment, scopes: [...scopes],
          createdBy: actor.userId, createdAt: at, expiresAt, revokedAt: null, revokedBy: null, lastUsedAt: null,
          lookupId, keyHash: bytesToHex(await digest(key)),
        };
        if (!(await store.insert(record))) continue;
        await audit({ type: "key.created", at, tenantId: record.tenantId, keyId: record.id, prefix, actorId: actor.userId, scopes: record.scopes, expiresAt });
        return { key, info: toInfo(record) };
      }
      throw new ApiKeyError("exhausted", "Could not allocate a lookup id; try again");
    },

    /** One tenant's keys, newest first, without secrets or hashes. */
    async list(actor: Actor, tenantId: string): Promise<ApiKeyInfo[]> {
      if (typeof tenantId !== "string" || !TENANT.test(tenantId)) throw new ApiKeyError("invalid-tenant", "Invalid tenant id");
      await allowed(actor, "list", tenantId);
      return (await store.listByTenant(tenantId)).map(toInfo);
    },

    /** Revokes a key; the next verify rejects it. Revoking an already revoked key returns it unchanged. */
    async revoke(actor: Actor, id: string): Promise<ApiKeyInfo> {
      const record = typeof id === "string" && ID.test(id) ? await store.findById(id) : null;
      if (!record) throw new ApiKeyError("not-found", "Key not found");
      await allowed(actor, "revoke", record.tenantId);
      if (record.revokedAt !== null) return toInfo(record);
      const at = now();
      const revoked = await store.revoke(record.id, at, actor.userId);
      if (!revoked) {
        const current = await store.findById(record.id);
        if (!current) throw new ApiKeyError("not-found", "Key not found");
        return toInfo(current);
      }
      await audit({ type: "key.revoked", at, tenantId: revoked.tenantId, keyId: revoked.id, prefix: revoked.prefix, actorId: actor.userId });
      return toInfo(revoked);
    },

    /**
     * Authenticates a presented key and checks that it carries every required scope. Malformed, unknown and
     * wrong-secret keys all fail with `invalid-key`; then `revoked`, `expired`, `environment-not-allowed` and
     * `insufficient-scope`. Error messages never include the presented key.
     */
    async verify(presented: string, requiredScopes: readonly string[] = []): Promise<ApiKeyPrincipal> {
      const at = now();
      const parsed = parseApiKey(presented, appPrefix);
      if (!parsed) return deny("invalid-key", at, null, "Invalid API key");
      const record = await store.findByLookupId(parsed.lookupId);
      const expected = record ? hexToBytes(record.keyHash) : DUMMY;
      const matches = timingSafeEqual(await digest(presented), expected);
      if (!record || !matches) return deny("invalid-key", at, record, "Invalid API key");
      if (record.revokedAt !== null) return deny("revoked", at, record, "API key revoked");
      if (record.expiresAt !== null && record.expiresAt <= at) return deny("expired", at, record, "API key expired");
      if (!environments.has(record.environment)) return deny("environment-not-allowed", at, record, "API key environment not accepted");
      if (!requiredScopes.every((scope) => record.scopes.includes(scope))) return deny("insufficient-scope", at, record, "API key lacks a required scope");
      if (record.lastUsedAt === null || at - record.lastUsedAt >= interval) {
        try {
          if (await store.touchLastUsed(record.id, at, at - interval)) {
            await audit({ type: "key.used", at, tenantId: record.tenantId, keyId: record.id, prefix: record.prefix });
          }
        } catch { /* last-used is bookkeeping; a failed write must not fail an authenticated request */ }
      }
      return { tenantId: record.tenantId, keyId: record.id, prefix: record.prefix, environment: record.environment, scopes: [...record.scopes] };
    },
  };
}

export type ApiKeys = ReturnType<typeof createApiKeys>;
