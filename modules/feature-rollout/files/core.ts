// SPDX-License-Identifier: Apache-2.0
// Feature flags with gradual rollout and A/B assignment. Server-side core with no runtime dependencies:
//   - evaluateFlag: pure, deterministic evaluation. Buckets are FNV-1a 32 over UTF-8 "key:subject" with a fmix32
//     finalizer, modulo 10,000 (so raising rolloutPercent only adds subjects): the same hash as the Genlib
//     feature-flags capability's TypeScript recipe (same bucket and, with an empty salt, same variant).
//     Precedence: kill switch > user deny > user allow > tenant deny > tenant allow > sticky experiment
//     assignment > rollout bucket.
//   - createFeatureFlags: flags loaded from a FeatureFlagStore with a short TTL cache and change notification (no
//     redeploy), audited admin CRUD with optimistic versions, experiment exposures recorded once per unit, sticky
//     assignments that survive weight/traffic changes, anonymous-to-user stitching and a two-proportion z-test.
// Flags are not authorization: enforce permissions separately. Evaluate on the server; send clients only results.

export type BucketBy = "user" | "tenant";
export interface FlagVariant { readonly name: string; readonly weight: number }

/** A stored flag. `version`, `updatedAt` and `updatedBy` are maintained by the admin API. */
export interface FlagConfig {
  readonly key: string;
  readonly description: string;
  /** false is the kill switch: off for everyone, including allow lists and assigned subjects. */
  readonly enabled: boolean;
  /** 0..100 with at most 2 decimals. */
  readonly rolloutPercent: number;
  /** "user" buckets by userId (or anonymousId); "tenant" buckets whole tenants together. */
  readonly bucketBy: BucketBy;
  readonly allowUsers: readonly string[];
  readonly denyUsers: readonly string[];
  readonly allowTenants: readonly string[];
  readonly denyTenants: readonly string[];
  /** Non-empty makes the flag an experiment. Integer weights 0..10,000; a zero weight gets no new subjects. */
  readonly variants: readonly FlagVariant[];
  /** Changes the variant hash without renaming the flag; changing it starts a new run (see runId), so a rerun reshuffles. */
  readonly salt: string;
  /**
   * Identity of the current experiment run, maintained by the admin API: new on create (so a deleted and recreated
   * key is a new run) and whenever the salt changes. Assignments, exposures and conversions of other runs are ignored.
   */
  readonly runId: string;
  readonly version: number;
  readonly updatedAt: number;
  readonly updatedBy: string;
}

export interface FlagSubject {
  readonly userId?: string | undefined;
  readonly anonymousId?: string | undefined;
  readonly tenantId?: string | undefined;
}

export type FlagReason =
  | "not-found" | "disabled" | "user-deny" | "user-allow" | "tenant-deny" | "tenant-allow"
  | "no-subject" | "assigned" | "rollout" | "excluded";
/** Where the variant came from: the hash, this subject's stored assignment, another id's (stitched), or a reassignment. */
export type VariantSource = "hash" | "stored" | "stitched" | "reassigned";

export interface FlagEvaluation {
  readonly flagKey: string;
  readonly on: boolean;
  readonly reason: FlagReason;
  /** 0..9,999, or null when there is no subject to bucket. Reported on every result for logging. */
  readonly bucket: number | null;
  readonly variant: string | null;
  readonly variantSource: VariantSource | null;
  readonly version: number | null;
  /** Set only when a stored variant no longer exists and the subject was reassigned. */
  readonly previousVariant?: string;
}

/** A persisted experiment assignment. Stitched copies share the unitId of the subject first assigned. */
export interface FlagAssignment {
  readonly flagKey: string;
  readonly runId: string;
  /** "user:<id>", "anon:<id>" or "tenant:<id>". */
  readonly subjectKey: string;
  readonly unitId: string;
  readonly variant: string | null;
  readonly assignedAt: number;
}
export interface FlagExposure { readonly flagKey: string; readonly runId: string; readonly unitId: string; readonly variant: string | null; readonly at: number }
export interface FlagConversion { readonly flagKey: string; readonly runId: string; readonly metric: string; readonly unitId: string; readonly at: number }

export type AuditAction = "create" | "update" | "delete";
export interface FlagAuditEntry {
  readonly id: string;
  readonly flagKey: string;
  readonly action: AuditAction;
  readonly actor: string;
  readonly at: number;
  readonly before: FlagConfig | null;
  readonly after: FlagConfig | null;
}

/** A flag write: applied only if the stored version equals expectedVersion (null: the flag must not exist). */
export interface FlagChange {
  readonly key: string;
  readonly expectedVersion: number | null;
  /** null deletes the flag. */
  readonly next: FlagConfig | null;
  readonly audit: FlagAuditEntry;
}

export interface VariantCount { readonly variant: string | null; readonly count: number }

export interface FeatureFlagStore {
  listFlags(): Promise<FlagConfig[]>;
  getFlag(key: string): Promise<FlagConfig | null>;
  /** Applies the change and appends its audit entry atomically. Returns false on a version conflict (nothing written). */
  commitFlagChange(change: FlagChange): Promise<boolean>;
  /** Newest first. The audit log is append-only: the store offers no way to change or remove entries. */
  listAudit(query: { readonly flagKey?: string; readonly limit: number }): Promise<FlagAuditEntry[]>;
  getAssignment(flagKey: string, runId: string, subjectKey: string): Promise<FlagAssignment | null>;
  /** Inserts unless (flagKey, runId, subjectKey) exists; returns the stored row (the existing one wins). */
  putAssignmentIfAbsent(assignment: FlagAssignment): Promise<FlagAssignment>;
  /** Sets the variant on every row of the unit whose variant is still `from`. Returns rows changed. */
  replaceAssignmentVariant(flagKey: string, runId: string, unitId: string, from: string | null, to: string | null): Promise<number>;
  /** Copies every assignment of one subject to another where the target has none. Returns rows copied. */
  copyAssignments(fromSubjectKey: string, toSubjectKey: string, at: number): Promise<number>;
  /** Inserts unless (flagKey, runId, unitId) exists. Returns true for the first exposure. */
  recordExposure(exposure: FlagExposure): Promise<boolean>;
  /** Inserts unless (flagKey, runId, metric, unitId) exists. Returns true for the first conversion. */
  recordConversion(conversion: FlagConversion): Promise<boolean>;
  exposureCounts(flagKey: string, runId: string): Promise<VariantCount[]>;
  /** Conversions of exposed units, grouped by the variant recorded at exposure. */
  conversionCounts(flagKey: string, runId: string, metric: string): Promise<VariantCount[]>;
}

export type FeatureFlagErrorCode = "invalid-flag" | "bad-request" | "forbidden" | "not-found" | "conflict" | "exists";

export class FeatureFlagError extends Error {
  readonly code: FeatureFlagErrorCode;
  readonly problems: readonly string[];
  constructor(code: FeatureFlagErrorCode, message: string, problems: readonly string[] = []) {
    super(message);
    this.name = "FeatureFlagError";
    this.code = code;
    this.problems = problems;
  }
}

// Hashing ----------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder();

/** FNV-1a 32-bit over the UTF-8 bytes of `text`. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const b of encoder.encode(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

/**
 * FNV-1a 32 followed by the MurmurHash3 fmix32 finalizer. Plain FNV-1a has weak low bits (its lowest bit is the parity
 * of the input bytes' lowest bits), so `fnv % 2` gives perfectly correlated splits across experiments; the finalizer
 * makes every output bit depend on every input bit.
 */
export function stableHash(text: string): number {
  let h = fnv1a32(text);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The rollout bucket (0..9,999) of a subject id for a flag key: stableHash("key:id") % 10,000. Stable across processes. */
export function bucketOf(flagKey: string, id: string): number {
  return stableHash(`${flagKey}:${id}`) % 10000;
}

function hashVariant(flag: FlagConfig, id: string): string | null {
  const total = flag.variants.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) return null;
  const salt = flag.salt === "" ? "" : `${flag.salt}:`;
  let x = stableHash(`${flag.key}:${salt}variant:${id}`) % total;
  for (const v of flag.variants) {
    if (x < v.weight) return v.name;
    x -= v.weight;
  }
  return null;
}

// Validation -------------------------------------------------------------------------------------------------------

const KEY = /^[A-Za-z0-9._-]{1,100}$/;
const NAME = /^[A-Za-z0-9._-]{1,64}$/;
const METRIC = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_LIST = 10_000;
const MAX_ID = 200;
const EDITABLE = ["description", "enabled", "rolloutPercent", "bucketBy", "allowUsers", "denyUsers", "allowTenants", "denyTenants", "variants", "salt"] as const;

export type FlagInput = { readonly key: string } & Partial<Pick<FlagConfig, (typeof EDITABLE)[number]>>;
export type FlagPatch = Partial<Pick<FlagConfig, (typeof EDITABLE)[number]>>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_ID;

function idList(value: unknown, field: string, problems: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_LIST || !value.every(validId)) {
    problems.push(`${field} must be an array of at most ${MAX_LIST} ids of 1-${MAX_ID} characters`);
    return [];
  }
  return [...new Set(value as string[])];
}

/**
 * Validates a full flag definition and returns a normalized FlagConfig (defaults: enabled, 100%, bucketBy user, no
 * lists, no variants). Version metadata comes from `meta` (default version 0). Throws FeatureFlagError
 * "invalid-flag" listing every problem, each starting with the field name.
 */
export function validateFlagInput(input: unknown, meta: { version?: number; updatedAt?: number; updatedBy?: string; runId?: string } = {}): FlagConfig {
  const problems: string[] = [];
  if (!isRecord(input)) throw new FeatureFlagError("invalid-flag", "Flag must be an object", ["flag must be an object"]);
  for (const field of Object.keys(input)) {
    if (field !== "key" && !(EDITABLE as readonly string[]).includes(field)) problems.push(`${field} is not a flag field`);
  }
  const key = input.key;
  if (typeof key !== "string" || !KEY.test(key)) problems.push("key must match [A-Za-z0-9._-]{1,100}");
  const description = input.description ?? "";
  if (typeof description !== "string" || description.length > 500) problems.push("description must be a string of at most 500 characters");
  const enabled = input.enabled ?? true;
  if (typeof enabled !== "boolean") problems.push("enabled must be a boolean");
  const pct = input.rolloutPercent ?? 100;
  if (typeof pct !== "number" || !(pct >= 0 && pct <= 100) || Math.abs(Math.round(pct * 100) - pct * 100) > 1e-9) {
    problems.push("rolloutPercent must be a number from 0 to 100 with at most 2 decimals");
  }
  const bucketBy = input.bucketBy ?? "user";
  if (bucketBy !== "user" && bucketBy !== "tenant") problems.push('bucketBy must be "user" or "tenant"');
  const allowUsers = idList(input.allowUsers, "allowUsers", problems);
  const denyUsers = idList(input.denyUsers, "denyUsers", problems);
  const allowTenants = idList(input.allowTenants, "allowTenants", problems);
  const denyTenants = idList(input.denyTenants, "denyTenants", problems);
  const variants: FlagVariant[] = [];
  const rawVariants = input.variants ?? [];
  if (!Array.isArray(rawVariants) || rawVariants.length > 20) {
    problems.push("variants must be an array of at most 20 variants");
  } else {
    const names = new Set<string>();
    let total = 0;
    for (const v of rawVariants) {
      if (!isRecord(v) || typeof v.name !== "string" || !NAME.test(v.name) || !Number.isInteger(v.weight) || (v.weight as number) < 0 || (v.weight as number) > 10_000) {
        problems.push("variants need a name matching [A-Za-z0-9._-]{1,64} and an integer weight from 0 to 10000");
        continue;
      }
      if (names.has(v.name)) problems.push(`variants has a duplicate name ${v.name}`);
      names.add(v.name);
      total += v.weight as number;
      variants.push({ name: v.name, weight: v.weight as number });
    }
    if (rawVariants.length > 0 && total === 0) problems.push("variants need at least one positive weight");
  }
  const salt = input.salt ?? "";
  if (typeof salt !== "string" || (salt !== "" && !NAME.test(salt))) problems.push("salt must match [A-Za-z0-9._-]{0,64}");
  if (problems.length > 0) throw new FeatureFlagError("invalid-flag", `Invalid flag: ${problems.join("; ")}`, problems);
  return {
    key: key as string, description: description as string, enabled: enabled as boolean,
    rolloutPercent: Math.round((pct as number) * 100) / 100, bucketBy: bucketBy as BucketBy,
    allowUsers, denyUsers, allowTenants, denyTenants, variants, salt: salt as string,
    version: meta.version ?? 0, updatedAt: meta.updatedAt ?? 0, updatedBy: meta.updatedBy ?? "", runId: meta.runId ?? "",
  };
}

// Evaluation -------------------------------------------------------------------------------------------------------

interface Compiled { allowUsers: Set<string>; denyUsers: Set<string>; allowTenants: Set<string>; denyTenants: Set<string>; threshold: number; names: Set<string> }
const compiledCache = new WeakMap<FlagConfig, Compiled>();
function compile(flag: FlagConfig): Compiled {
  let c = compiledCache.get(flag);
  if (!c) {
    c = {
      allowUsers: new Set(flag.allowUsers), denyUsers: new Set(flag.denyUsers),
      allowTenants: new Set(flag.allowTenants), denyTenants: new Set(flag.denyTenants),
      threshold: Math.round(flag.rolloutPercent * 100), names: new Set(flag.variants.map((v) => v.name)),
    };
    compiledCache.set(flag, c);
  }
  return c;
}

function cleanSubject(subject: FlagSubject): FlagSubject {
  if (!isRecord(subject)) throw new FeatureFlagError("bad-request", "Subject must be an object");
  const out: { userId?: string; anonymousId?: string; tenantId?: string } = {};
  for (const field of ["userId", "anonymousId", "tenantId"] as const) {
    const value = subject[field];
    if (value === undefined || value === null || value === "") continue;
    if (!validId(value)) throw new FeatureFlagError("bad-request", `${field} must be a string of 1-${MAX_ID} characters`);
    out[field] = value;
  }
  return out;
}

/** The id used for bucketing and variant hashing. */
function hashIdOf(flag: FlagConfig, s: FlagSubject): string | undefined {
  return flag.bucketBy === "tenant" ? s.tenantId : (s.userId ?? s.anonymousId);
}

/** Assignment keys in lookup order; the first is the primary key a new assignment is stored under. */
function subjectKeysOf(flag: FlagConfig, s: FlagSubject): string[] {
  if (flag.bucketBy === "tenant") return s.tenantId === undefined ? [] : [`tenant:${s.tenantId}`];
  const keys: string[] = [];
  if (s.userId !== undefined) keys.push(`user:${s.userId}`);
  if (s.anonymousId !== undefined) keys.push(`anon:${s.anonymousId}`);
  return keys;
}

/** A stored assignment found for this subject; `stitched` when it was found under a secondary id. */
export interface StoredVariant { readonly variant: string | null; readonly stitched: boolean }

/**
 * Pure, synchronous evaluation of one flag for one subject. `stored` is the subject's persisted experiment assignment
 * (createFeatureFlags supplies it); it keeps an assigned subject in a variant flag when traffic or weights change.
 */
export function evaluateFlag(flag: FlagConfig, subject: FlagSubject, stored: StoredVariant | null = null): FlagEvaluation {
  const s = cleanSubject(subject);
  const c = compile(flag);
  const hashId = hashIdOf(flag, s);
  const bucket = hashId === undefined ? null : bucketOf(flag.key, hashId);
  const isExperiment = flag.variants.length > 0;
  const result = (on: boolean, reason: FlagReason): FlagEvaluation => {
    const base = { flagKey: flag.key, on, reason, bucket, version: flag.version };
    if (!on || !isExperiment) return { ...base, variant: null, variantSource: null };
    if (stored && stored.variant !== null && c.names.has(stored.variant)) {
      return { ...base, variant: stored.variant, variantSource: stored.stitched ? "stitched" : "stored" };
    }
    const variant = hashId === undefined ? null : hashVariant(flag, hashId);
    if (stored && stored.variant !== variant) {
      return { ...base, variant, variantSource: "reassigned", ...(stored.variant === null ? {} : { previousVariant: stored.variant }) };
    }
    return { ...base, variant, variantSource: variant === null ? null : "hash" };
  };
  if (!flag.enabled) return result(false, "disabled");
  if (s.userId !== undefined && c.denyUsers.has(s.userId)) return result(false, "user-deny");
  if (s.userId !== undefined && c.allowUsers.has(s.userId)) return result(true, "user-allow");
  if (s.tenantId !== undefined && c.denyTenants.has(s.tenantId)) return result(false, "tenant-deny");
  if (s.tenantId !== undefined && c.allowTenants.has(s.tenantId)) return result(true, "tenant-allow");
  if (bucket === null) return result(false, "no-subject");
  if (isExperiment && stored) return result(true, "assigned");
  if (bucket < c.threshold) return result(true, "rollout");
  return result(false, "excluded");
}

// Statistics -------------------------------------------------------------------------------------------------------

/** Complementary error function (Numerical Recipes erfcc, fractional error below 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/**
 * Pooled two-proportion z-test of B against A. z > 0 means B converts better; pValue is two-sided. Inputs must be
 * integers with 0 <= conversions <= exposures and exposures > 0 (RangeError otherwise). A pooled rate of 0 or 1 has no
 * variance and returns { z: 0, pValue: 1 }. The normal approximation needs roughly 10+ conversions and non-conversions
 * per arm; below that, use an exact test.
 */
export function twoProportionZTest(conversionsA: number, exposuresA: number, conversionsB: number, exposuresB: number): { z: number; pValue: number } {
  for (const [c, n] of [[conversionsA, exposuresA], [conversionsB, exposuresB]] as const) {
    if (!Number.isInteger(c) || !Number.isInteger(n) || n <= 0 || c < 0 || c > n) throw new RangeError("conversions and exposures must be integers with 0 <= conversions <= exposures and exposures > 0");
  }
  const pA = conversionsA / exposuresA;
  const pB = conversionsB / exposuresB;
  const pooled = (conversionsA + conversionsB) / (exposuresA + exposuresB);
  const variance = pooled * (1 - pooled) * (1 / exposuresA + 1 / exposuresB);
  if (!(variance > 0)) return { z: 0, pValue: 1 };
  const z = (pB - pA) / Math.sqrt(variance);
  return { z, pValue: Math.min(1, erfc(Math.abs(z) / Math.SQRT2)) };
}

export interface VariantAnalysis {
  readonly variant: string | null;
  readonly exposures: number;
  readonly conversions: number;
  /** conversions / exposures (0 with no exposures). */
  readonly rate: number;
  /** Relative lift over control's rate, or null for control or when control's rate is 0. */
  readonly liftVsControl: number | null;
  /** Against control; null for control itself or when either arm has no exposures. */
  readonly z: number | null;
  readonly pValue: number | null;
  readonly significant: boolean;
}
export interface ExperimentAnalysis {
  readonly flagKey: string;
  readonly metric: string;
  readonly control: string;
  readonly alpha: number;
  readonly variants: readonly VariantAnalysis[];
}

// Service ----------------------------------------------------------------------------------------------------------

export interface FlagActor { readonly id: string }
export type AdminAction = "read" | "create" | "update" | "delete" | "audit";

export interface FeatureFlagsOptions {
  readonly store: FeatureFlagStore;
  /** Epoch milliseconds. Default Date.now. */
  readonly now?: () => number;
  /** Audit entry ids. Default crypto.randomUUID. */
  readonly newId?: () => string;
  /** How long a loaded flag set is served before the store is read again. Default 5,000 ms; 0 to 300,000. */
  readonly cacheTtlMs?: number;
  /** Required for the admin API: return true to allow. Without it every admin operation is refused. */
  readonly authorize?: ((actor: FlagActor, action: AdminAction, flagKey: string | null) => boolean | Promise<boolean>) | undefined;
  /** Called once per unit per experiment, on the first recorded exposure. Forward it to your analytics. */
  readonly onExposure?: ((event: FlagExposure) => void) | undefined;
  /** Store reload failures (stale config kept) and listener errors. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

export interface FlagChangeEvent { readonly changed: readonly string[] }
export type ConversionResult = {
  readonly counted: boolean;
  readonly reason: "counted" | "duplicate" | "not-exposed" | "not-found" | "not-an-experiment";
  readonly variant: string | null;
};

export interface FeatureFlagAdmin {
  list(actor: FlagActor): Promise<FlagConfig[]>;
  get(actor: FlagActor, key: string): Promise<FlagConfig>;
  create(actor: FlagActor, input: FlagInput): Promise<FlagConfig>;
  update(actor: FlagActor, key: string, patch: FlagPatch, options?: { readonly expectedVersion?: number }): Promise<FlagConfig>;
  remove(actor: FlagActor, key: string, options?: { readonly expectedVersion?: number }): Promise<void>;
  audit(actor: FlagActor, query?: { readonly flagKey?: string; readonly limit?: number }): Promise<FlagAuditEntry[]>;
}

export interface FeatureFlags {
  evaluate(key: string, subject: FlagSubject): Promise<FlagEvaluation>;
  /** Every flag when keys is undefined. */
  evaluateMany(keys: readonly string[] | undefined, subject: FlagSubject): Promise<Record<string, FlagEvaluation>>;
  /** Evaluate and, when on, persist the experiment assignment and record the exposure (once per unit). */
  expose(key: string, subject: FlagSubject): Promise<FlagEvaluation & { readonly firstExposure: boolean }>;
  trackConversion(key: string, subject: FlagSubject, metric?: string): Promise<ConversionResult>;
  /** Copy an anonymous visitor's assignments to the signed-in user (call at sign-in). */
  stitch(anonymousId: string, userId: string): Promise<number>;
  analyze(key: string, options?: { readonly metric?: string; readonly control?: string; readonly alpha?: number }): Promise<ExperimentAnalysis>;
  /** Called with the keys that changed whenever a reload finds new versions. Returns an unsubscribe function. */
  subscribe(listener: (event: FlagChangeEvent) => void): () => void;
  /** Reload from the store now (call from a pub/sub message to skip the TTL wait). */
  refresh(): Promise<void>;
  readonly admin: FeatureFlagAdmin;
}

interface Snapshot { flags: Map<string, FlagConfig>; loadedAt: number }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  }
  return value;
}

export function createFeatureFlags(options: FeatureFlagsOptions): FeatureFlags {
  const { store } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const ttl = options.cacheTtlMs ?? 5000;
  if (!Number.isFinite(ttl) || ttl < 0 || ttl > 300_000) throw new RangeError("cacheTtlMs must be 0 to 300000");
  const listeners = new Set<(event: FlagChangeEvent) => void>();
  let snapshot: Snapshot | null = null;
  let inflight: Promise<Snapshot> | null = null;
  let loadSeq = 0;
  let appliedSeq = 0;

  const reportError = (error: unknown) => { try { options.onError?.(error); } catch { /* never let observers break evaluation */ } };

  async function load(): Promise<Snapshot> {
    const seq = ++loadSeq;
    const list = await store.listFlags();
    const next: Snapshot = { flags: new Map(list.map((f) => [f.key, deepFreeze(f)])), loadedAt: now() };
    // A slower, older load never replaces a newer one (an admin write forces a fresh load).
    if (seq > appliedSeq) {
      const previous = snapshot;
      snapshot = next;
      appliedSeq = seq;
      if (previous) {
        const changed = new Set<string>();
        for (const [key, flag] of next.flags) if (previous.flags.get(key)?.version !== flag.version) changed.add(key);
        for (const key of previous.flags.keys()) if (!next.flags.has(key)) changed.add(key);
        if (changed.size > 0) {
          const event = { changed: [...changed].sort() };
          for (const listener of [...listeners]) { try { listener(event); } catch (error) { reportError(error); } }
        }
      }
    }
    return snapshot as Snapshot;
  }

  async function current(): Promise<Snapshot> {
    const cached = snapshot;
    if (cached && now() - cached.loadedAt < ttl) return cached;
    if (!inflight) inflight = load().finally(() => { inflight = null; });
    try {
      return await inflight;
    } catch (error) {
      if (!snapshot) throw error;
      reportError(error);
      snapshot.loadedAt = now(); // serve the last good config and retry after one TTL
      return snapshot;
    }
  }

  async function lookup(flag: FlagConfig, keys: readonly string[]): Promise<{ record: FlagAssignment; stitched: boolean } | null> {
    for (let i = 0; i < keys.length; i++) {
      const record = await store.getAssignment(flag.key, flag.runId, keys[i] as string);
      if (record) return { record, stitched: i > 0 };
    }
    return null;
  }

  async function evaluateWith(flag: FlagConfig, subject: FlagSubject) {
    const s = cleanSubject(subject);
    const keys = subjectKeysOf(flag, s);
    const found = flag.variants.length > 0 && flag.enabled ? await lookup(flag, keys) : null;
    const evaluation = evaluateFlag(flag, s, found ? { variant: found.record.variant, stitched: found.stitched } : null);
    return { s, keys, found, evaluation };
  }

  const notFound = (key: string): FlagEvaluation => ({ flagKey: key, on: false, reason: "not-found", bucket: null, variant: null, variantSource: null, version: null });

  async function evaluate(key: string, subject: FlagSubject): Promise<FlagEvaluation> {
    const flag = (await current()).flags.get(key);
    if (!flag) { cleanSubject(subject); return notFound(key); }
    return (await evaluateWith(flag, subject)).evaluation;
  }

  async function expose(key: string, subject: FlagSubject): Promise<FlagEvaluation & { firstExposure: boolean }> {
    const flag = (await current()).flags.get(key);
    if (!flag) { cleanSubject(subject); return { ...notFound(key), firstExposure: false }; }
    let { s, keys, found, evaluation } = await evaluateWith(flag, subject);
    const primary = keys[0];
    if (!evaluation.on || primary === undefined) return { ...evaluation, firstExposure: false };
    const at = now();
    let unitId = found?.record.unitId ?? primary;
    if (flag.variants.length > 0) {
      if (!found) {
        const stored = await store.putAssignmentIfAbsent({ flagKey: key, runId: flag.runId, subjectKey: primary, unitId: primary, variant: evaluation.variant, assignedAt: at });
        unitId = stored.unitId;
        // A concurrent expose stored first: its row is the truth.
        if (stored.variant !== evaluation.variant) evaluation = evaluateFlag(flag, s, { variant: stored.variant, stitched: false });
      } else {
        if (evaluation.variantSource === "reassigned") {
          const changed = await store.replaceAssignmentVariant(key, flag.runId, unitId, found.record.variant, evaluation.variant);
          if (changed === 0) {
            // Someone else reassigned it first: use what is stored now.
            const again = await lookup(flag, keys);
            if (again) evaluation = evaluateFlag(flag, s, { variant: again.record.variant, stitched: again.stitched });
          }
        }
        if (found.stitched) {
          await store.putAssignmentIfAbsent({ flagKey: key, runId: flag.runId, subjectKey: primary, unitId, variant: evaluation.variant, assignedAt: at });
        }
      }
    }
    const exposure: FlagExposure = { flagKey: key, runId: flag.runId, unitId, variant: evaluation.variant, at };
    const firstExposure = await store.recordExposure(exposure);
    if (firstExposure) { try { options.onExposure?.(exposure); } catch (error) { reportError(error); } }
    return { ...evaluation, firstExposure };
  }

  async function authorize(actor: FlagActor, action: AdminAction, key: string | null): Promise<void> {
    const ok = isRecord(actor) && validId(actor.id) && options.authorize !== undefined && (await options.authorize(actor, action, key)) === true;
    if (!ok) throw new FeatureFlagError("forbidden", "Not allowed to change feature flags");
  }

  function requireKey(key: unknown): string {
    if (typeof key !== "string" || !KEY.test(key)) throw new FeatureFlagError("not-found", "Flag not found");
    return key;
  }

  async function commit(change: FlagChange, failure: FeatureFlagError): Promise<void> {
    if (!(await store.commitFlagChange(change))) throw failure;
    try { await load(); } catch (error) { reportError(error); }
  }

  const admin: FeatureFlagAdmin = {
    async list(actor) {
      await authorize(actor, "read", null);
      return store.listFlags();
    },
    async get(actor, key) {
      await authorize(actor, "read", typeof key === "string" ? key : null);
      const flag = await store.getFlag(requireKey(key));
      if (!flag) throw new FeatureFlagError("not-found", "Flag not found");
      return flag;
    },
    async create(actor, input) {
      const key = isRecord(input) && typeof input.key === "string" ? input.key : null;
      await authorize(actor, "create", key);
      const at = now();
      const next = validateFlagInput(input, { version: 1, updatedAt: at, updatedBy: actor.id, runId: newId() });
      await commit({
        key: next.key, expectedVersion: null, next,
        audit: { id: newId(), flagKey: next.key, action: "create", actor: actor.id, at, before: null, after: next },
      }, new FeatureFlagError("exists", "A flag with this key already exists"));
      return next;
    },
    async update(actor, key, patch, opts = {}) {
      await authorize(actor, "update", typeof key === "string" ? key : null);
      const before = await store.getFlag(requireKey(key));
      if (!before) throw new FeatureFlagError("not-found", "Flag not found");
      if (opts.expectedVersion !== undefined && opts.expectedVersion !== before.version) throw new FeatureFlagError("conflict", "The flag changed since you read it");
      if (!isRecord(patch)) throw new FeatureFlagError("invalid-flag", "Patch must be an object", ["patch must be an object"]);
      const unknown = Object.keys(patch).filter((field) => !(EDITABLE as readonly string[]).includes(field));
      if (unknown.length > 0) {
        throw new FeatureFlagError("invalid-flag", "Patch has fields that cannot be changed", unknown.map((field) => field === "key" ? "key cannot be changed" : `${field} is not a flag field`));
      }
      // Copy only known fields (never Object.assign untrusted JSON, which could set a prototype via "__proto__").
      const merged: Record<string, unknown> = { key: before.key };
      for (const field of EDITABLE) merged[field] = Object.hasOwn(patch, field) ? (patch as Record<string, unknown>)[field] : before[field];
      const at = now();
      const next = validateFlagInput(merged, {
        version: before.version + 1, updatedAt: at, updatedBy: actor.id,
        // A new salt starts a new run: old assignments, exposures and conversions stop counting.
        runId: merged.salt === before.salt ? before.runId : newId(),
      });
      await commit({
        key: before.key, expectedVersion: before.version, next,
        audit: { id: newId(), flagKey: before.key, action: "update", actor: actor.id, at, before, after: next },
      }, new FeatureFlagError("conflict", "The flag changed since you read it"));
      return next;
    },
    async remove(actor, key, opts = {}) {
      await authorize(actor, "delete", typeof key === "string" ? key : null);
      const before = await store.getFlag(requireKey(key));
      if (!before) throw new FeatureFlagError("not-found", "Flag not found");
      if (opts.expectedVersion !== undefined && opts.expectedVersion !== before.version) throw new FeatureFlagError("conflict", "The flag changed since you read it");
      await commit({
        key: before.key, expectedVersion: before.version, next: null,
        audit: { id: newId(), flagKey: before.key, action: "delete", actor: actor.id, at: now(), before, after: null },
      }, new FeatureFlagError("conflict", "The flag changed since you read it"));
    },
    async audit(actor, query = {}) {
      await authorize(actor, "audit", query.flagKey ?? null);
      const limit = query.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new FeatureFlagError("bad-request", "limit must be 1 to 1000");
      return store.listAudit(query.flagKey === undefined ? { limit } : { flagKey: requireKey(query.flagKey), limit });
    },
  };

  return {
    evaluate,
    async evaluateMany(keys, subject) {
      const snap = await current();
      const out: Record<string, FlagEvaluation> = {};
      for (const key of keys ?? [...snap.flags.keys()].sort()) {
        const flag = snap.flags.get(key);
        out[key] = flag ? (await evaluateWith(flag, subject)).evaluation : (cleanSubject(subject), notFound(key));
      }
      return out;
    },
    expose,
    async trackConversion(key, subject, metric = "conversion") {
      if (typeof metric !== "string" || !METRIC.test(metric)) throw new FeatureFlagError("bad-request", "metric must match [A-Za-z0-9._-]{1,64}");
      const flag = (await current()).flags.get(key);
      if (!flag) return { counted: false, reason: "not-found", variant: null };
      if (flag.variants.length === 0) return { counted: false, reason: "not-an-experiment", variant: null };
      const found = await lookup(flag, subjectKeysOf(flag, cleanSubject(subject)));
      if (!found) return { counted: false, reason: "not-exposed", variant: null };
      const counted = await store.recordConversion({ flagKey: key, runId: flag.runId, metric, unitId: found.record.unitId, at: now() });
      return { counted, reason: counted ? "counted" : "duplicate", variant: found.record.variant };
    },
    async stitch(anonymousId, userId) {
      if (!validId(anonymousId) || !validId(userId)) throw new FeatureFlagError("bad-request", "anonymousId and userId must be ids");
      return store.copyAssignments(`anon:${anonymousId}`, `user:${userId}`, now());
    },
    async analyze(key, opts = {}) {
      const metric = opts.metric ?? "conversion";
      const alpha = opts.alpha ?? 0.05;
      if (!METRIC.test(metric)) throw new FeatureFlagError("bad-request", "metric must match [A-Za-z0-9._-]{1,64}");
      if (!(alpha > 0 && alpha < 1)) throw new FeatureFlagError("bad-request", "alpha must be between 0 and 1");
      const flag = await store.getFlag(requireKey(key));
      if (!flag) throw new FeatureFlagError("not-found", "Flag not found");
      if (flag.variants.length === 0) throw new FeatureFlagError("bad-request", "Flag has no variants");
      const control = opts.control ?? (flag.variants[0] as FlagVariant).name;
      const exposures = await store.exposureCounts(key, flag.runId);
      const conversions = await store.conversionCounts(key, flag.runId, metric);
      const names: (string | null)[] = flag.variants.map((v) => v.name);
      for (const row of exposures) if (!names.includes(row.variant)) names.push(row.variant);
      if (!names.includes(control)) throw new FeatureFlagError("bad-request", "control is not a variant");
      const count = (rows: VariantCount[], variant: string | null) => rows.find((r) => r.variant === variant)?.count ?? 0;
      const c = { exposures: count(exposures, control), conversions: count(conversions, control) };
      const controlRate = c.exposures > 0 ? c.conversions / c.exposures : 0;
      const variants = names.map((variant): VariantAnalysis => {
        const n = count(exposures, variant);
        const k = Math.min(count(conversions, variant), n);
        const rate = n > 0 ? k / n : 0;
        if (variant === control || n === 0 || c.exposures === 0) {
          return { variant, exposures: n, conversions: k, rate, liftVsControl: null, z: null, pValue: null, significant: false };
        }
        const test = twoProportionZTest(Math.min(c.conversions, c.exposures), c.exposures, k, n);
        return { variant, exposures: n, conversions: k, rate, liftVsControl: controlRate > 0 ? rate / controlRate - 1 : null, z: test.z, pValue: test.pValue, significant: test.pValue < alpha };
      });
      return { flagKey: key, metric, control, alpha, variants };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async refresh() { await load(); },
    admin,
  };
}
