// SPDX-License-Identifier: Apache-2.0
// Tenant-scoped, append-only audit log, framework-neutral. The receiving application supplies persistence and
// authorization through the interfaces below. `record(tx, entry)` writes through the caller's transaction so the
// entry commits or rolls back with the change it describes. Each tenant's entries form a hash chain: every entry
// stores the previous entry's hash and its own SHA-256 (or HMAC-SHA-256 with `hmacKey`) over canonical JSON, so
// `verifyChain` detects an edited, deleted, inserted or reordered entry. Details are redacted before hashing.

/** Who performed the action, as recorded in the entry. */
export interface AuditActor {
  readonly id: string;
  /** Default "user". */
  readonly type?: AuditActorType;
}
export type AuditActorType = "user" | "service" | "system" | "api-key";
export type AuditOutcome = "success" | "failure" | "denied";

export interface AuditRecordInput {
  readonly tenantId: string;
  readonly actor: AuditActor;
  /** Dotted verb such as "member.invite" or "auth.login": lowercase letters, digits and . _ : - (1 to 128). */
  readonly action: string;
  readonly target?: { readonly type: string; readonly id: string } | null;
  readonly outcome: AuditOutcome;
  /** The request or trace id that caused the action, for correlating with logs. */
  readonly requestId?: string | null;
  /** Extra context. Redacted, bounded and stored as JSON. */
  readonly details?: Readonly<Record<string, unknown>> | null;
}

export interface AuditEntry {
  readonly id: string;
  readonly tenantId: string;
  /** 1, 2, 3 ... per tenant; the chain order and the keyset cursor. */
  readonly seq: number;
  /** Epoch milliseconds. */
  readonly at: number;
  readonly actorType: AuditActorType;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly outcome: AuditOutcome;
  readonly requestId: string | null;
  readonly details: Readonly<Record<string, unknown>>;
  readonly prevHash: string;
  readonly hash: string;
}

/** A tenant's chain state: the latest entry, and the anchor left by the last retention purge. */
export interface ChainHead {
  readonly seq: number;
  readonly hash: string;
  /** Sequence number of the last purged entry (0 when nothing was purged). */
  readonly anchorSeq: number;
  /** Hash of the last purged entry (GENESIS_HASH when nothing was purged). */
  readonly anchorHash: string;
}

export interface AuditFilter {
  readonly actorId?: string;
  readonly action?: string;
  /** Matches actions starting with this text, e.g. "member." */
  readonly actionPrefix?: string;
  /** Inclusive lower bound on `at`. */
  readonly from?: number;
  /** Exclusive upper bound on `at`. */
  readonly to?: number;
}

export interface AuditStore<Tx = unknown> {
  /**
   * Appends one entry to the tenant's chain inside `tx`: lock the tenant's head (creating it at seq 0 with
   * GENESIS_HASH), call `build(head)` and insert what it returns. Concurrent appends for one tenant must be
   * serialized so each entry extends the head it was built from.
   */
  append(tx: Tx, tenantId: string, build: (head: ChainHead) => Promise<AuditEntry>): Promise<AuditEntry>;
  /** The head without locking, or null when the tenant has no chain. */
  head(tenantId: string): Promise<ChainHead | null>;
  /** One tenant's entries matching `filter`, newest first, with seq strictly below `beforeSeq`, at most `limit`. */
  page(tenantId: string, query: AuditFilter & { readonly beforeSeq: number | null; readonly limit: number }): Promise<AuditEntry[]>;
  /** One tenant's entries with afterSeq < seq <= uptoSeq, oldest first, at most `limit`. */
  scan(tenantId: string, afterSeq: number, uptoSeq: number, limit: number): Promise<AuditEntry[]>;
  /**
   * Retention purge: deletes the tenant's oldest entries while their `at` is before `before` (a contiguous prefix
   * of the chain) and moves the anchor to the last deleted entry. Returns how many were deleted.
   */
  purge(tenantId: string, before: number): Promise<number>;
  /** Tenants that have a chain. */
  tenants(): Promise<string[]>;
}

export interface Actor { readonly userId: string }
export type AuditReadAction = "read" | "export";

export interface AuditLogOptions<Tx = unknown> {
  readonly store: AuditStore<Tx>;
  /** Decide whether `actor` may read or export `tenantId`'s audit log (tenant administrators only). */
  readonly authorize: (actor: Actor, action: AuditReadAction, target: Readonly<{ tenantId: string }>) => Promise<boolean>;
  /** Declared retention period in milliseconds. Entries older than this are hidden from queries and purged. */
  readonly retentionMs: number;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Optional secret (32+ bytes) for HMAC-SHA-256 hashes, so someone with database access alone cannot recompute the chain. */
  readonly hmacKey?: Uint8Array;
  /** Extra keys whose values are replaced by "[REDACTED]" (compared without case, "-", "_", "." or spaces). */
  readonly redactKeys?: readonly string[];
  /** Mask email addresses inside string values as "a***@example.com". Default true; pass false to keep addresses. */
  readonly maskEmails?: boolean;
  /** Extra global regular expressions whose matches in string values become "[REDACTED]". */
  readonly redactPatterns?: readonly RegExp[];
  /** Largest canonical details size in characters; larger details are replaced by a truncation marker. Default 8,192. */
  readonly maxDetailsSize?: number;
}

export type AuditLogErrorCode =
  | "forbidden" | "invalid-tenant" | "invalid-actor" | "invalid-action" | "invalid-target" | "invalid-outcome"
  | "invalid-request-id" | "invalid-details" | "invalid-filter" | "invalid-range" | "invalid-cursor" | "invalid-limit"
  | "invalid-format";

export class AuditLogError extends Error {
  readonly code: AuditLogErrorCode;
  constructor(code: AuditLogErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AuditLogError";
  }
}

export const GENESIS_HASH = "0".repeat(64);
export const REDACTED = "[REDACTED]";

/** Keys redacted exactly, after lowercasing and removing "-", "_", "." and spaces. */
export const DEFAULT_REDACT_KEYS: readonly string[] = Object.freeze([
  "password", "passwd", "pwd", "secret", "token", "authorization", "proxy-authorization", "cookie", "set-cookie",
  "apiKey", "api_key", "x-api-key", "client_secret", "private_key", "session", "sessionId", "otp", "pin",
  "ssn", "cvv", "cvc", "cardNumber", "creditCard", "iban",
]);
/** Keys containing any of these (after the same normalization) are redacted too, e.g. "newPassword", "githubToken". */
export const REDACT_KEY_PARTS: readonly string[] = Object.freeze([
  "password", "passwd", "secret", "token", "apikey", "privatekey", "authorization", "cookie", "credential",
]);

const TENANT = /^[\w.:-]{1,128}$/;
const ACTION = /^[a-z][a-z0-9_.:-]{0,127}$/;
const PRINTABLE_TEXT = /^[^\u0000-\u001f\u007f]{1,256}$/;
/** A lone high or low surrogate: not well-formed UTF-16, so drivers would store U+FFFD instead. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const PRINTABLE = { test: (value: string): boolean => PRINTABLE_TEXT.test(value) && !LONE_SURROGATE.test(value) };
/** String.prototype.toWellFormed for runtimes and libs without it. */
export function toWellFormed(value: string): string {
  return value.replace(new RegExp(LONE_SURROGATE.source, "g"), "\uFFFD");
}
const REQUEST_ID = /^[\x21-\x7e]{1,128}$/;
const ACTOR_TYPES: readonly AuditActorType[] = ["user", "service", "system", "api-key"];
const OUTCOMES: readonly AuditOutcome[] = ["success", "failure", "denied"];
const MAX_TIME = 8_640_000_000_000_000;
const MAX_DEPTH = 8;
const MAX_KEYS = 100;
const MAX_ARRAY = 100;
const MAX_STRING = 2048;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_. ]/g, "");

/** Deterministic JSON: object keys sorted, no whitespace. Input must already be JSON-safe. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export interface RedactOptions {
  readonly redactKeys?: readonly string[];
  readonly maskEmails?: boolean;
  readonly redactPatterns?: readonly RegExp[];
}

/**
 * Returns a JSON-safe, bounded copy of `details` with secrets removed: values of sensitive keys become
 * "[REDACTED]"; card numbers (Luhn-valid 13 to 19 digits), US social security numbers (ddd-dd-dddd), bearer tokens
 * and JWTs inside strings are replaced;
 * emails are masked unless `maskEmails` is false. Lone UTF-16 surrogates in keys and values become U+FFFD so the
 * hashed text equals what a database stores. Never throws; cycles become "[Circular]".
 */
export function redactDetails(details: unknown, options: RedactOptions = {}): Record<string, unknown> {
  const exact = new Set([...DEFAULT_REDACT_KEYS, ...(options.redactKeys ?? [])].map(normalizeKey));
  const patterns = (options.redactPatterns ?? []).map((pattern) => new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"));
  const sensitive = (key: string) => {
    const normal = normalizeKey(key);
    return exact.has(normal) || REDACT_KEY_PARTS.some((part) => normal.includes(part));
  };
  const text = (raw: string): string => {
    let value = raw.replace(/\u0000/g, "\uFFFD");
    // Truncate first: slicing can split a surrogate pair, which toWellFormed then repairs.
    if (value.length > MAX_STRING) value = value.slice(0, MAX_STRING) + "…";
    value = toWellFormed(value);
    value = value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer " + REDACTED);
    value = value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED);
    value = value.replace(/(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g, "[REDACTED ssn]");
    value = value.replace(/(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g, (match) => {
      const digits = match.replace(/[ -]/g, "");
      return luhn(digits) ? "[REDACTED card ending " + digits.slice(-4) + "]" : match;
    });
    if (options.maskEmails !== false) {
      value = value.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g, "$1***@$2");
    }
    for (const pattern of patterns) value = value.replace(pattern, REDACTED);
    return value;
  };
  const seen = new WeakSet<object>();
  const walk = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
    if (typeof value === "string") return text(value);
    if (typeof value === "bigint") return value.toString();
    if (typeof value !== "object") return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (seen.has(value)) return "[Circular]";
    if (depth >= MAX_DEPTH) return Array.isArray(value) ? "[Array]" : "[Object]";
    seen.add(value);
    try {
      if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => walk(item, depth + 1) ?? null);
      const out: [string, unknown][] = [];
      for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
        if (sensitive(key)) { out.push([text(key), REDACTED]); continue; }
        let item: unknown;
        try { item = (value as Record<string, unknown>)[key]; } catch { item = "[Unreadable]"; }
        const clean = walk(item, depth + 1);
        if (clean !== undefined) out.push([text(key), clean]);
      }
      return Object.fromEntries(out);
    } finally {
      seen.delete(value);
    }
  };
  if (details === null || details === undefined) return {};
  if (typeof details !== "object" || Array.isArray(details)) return { value: walk(details, 1) ?? null };
  return walk(details, 0) as Record<string, unknown>;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The exact fields covered by an entry's hash, as canonical JSON. */
export function hashInput(entry: Omit<AuditEntry, "hash">): string {
  return canonicalJson({
    v: 1, id: entry.id, tenantId: entry.tenantId, seq: entry.seq, at: entry.at, actorType: entry.actorType,
    actorId: entry.actorId, action: entry.action, targetType: entry.targetType, targetId: entry.targetId,
    outcome: entry.outcome, requestId: entry.requestId, details: entry.details, prevHash: entry.prevHash,
  });
}

function encodeCursor(seq: number): string {
  return btoa(JSON.stringify([seq])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string | null | undefined): number | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  try {
    if (cursor.length > 64 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (cursor.length % 4)) % 4);
    const value: unknown = JSON.parse(atob(padded));
    if (!Array.isArray(value) || value.length !== 1 || !Number.isSafeInteger(value[0]) || (value[0] as number) < 1) throw new Error("shape");
    return value[0] as number;
  } catch {
    throw new AuditLogError("invalid-cursor", "Invalid cursor");
  }
}

export interface AuditQuery extends AuditFilter {
  readonly tenantId: string;
  readonly cursor?: string | null;
  /** 1 to 200, default 50. */
  readonly limit?: number;
}

export type VerifyResult =
  | { readonly ok: true; readonly count: number; readonly head: ChainHead | null }
  | {
    readonly ok: false;
    readonly reason:
      | "hash-mismatch" | "broken-link" | "sequence-gap" | "head-mismatch" | "checkpoint-mismatch" | "checkpoint-purged"
      | "purged-rows-present";
    readonly seq: number;
  };

export type ExportFormat = "csv" | "ndjson";

export const CSV_COLUMNS: readonly string[] = [
  "seq", "at", "id", "tenant_id", "actor_type", "actor_id", "action", "target_type", "target_id", "outcome",
  "request_id", "details", "prev_hash", "hash",
];

/** One CSV cell: formula-leading characters get a leading apostrophe; quotes, commas and newlines are quoted. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return /[",\r\n]|^\s|\s$/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function csvRow(entry: AuditEntry): string {
  return [
    String(entry.seq), new Date(entry.at).toISOString(), entry.id, entry.tenantId, entry.actorType, entry.actorId, entry.action,
    entry.targetType ?? "", entry.targetId ?? "", entry.outcome, entry.requestId ?? "", canonicalJson(entry.details),
    entry.prevHash, entry.hash,
  ].map(csvCell).join(",") + "\r\n";
}

export function createAuditLog<Tx = unknown>(options: AuditLogOptions<Tx>) {
  const { store } = options;
  const retentionMs = options.retentionMs;
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) throw new RangeError("retentionMs must be a positive whole number of milliseconds");
  const maxDetailsSize = options.maxDetailsSize ?? 8192;
  if (!Number.isInteger(maxDetailsSize) || maxDetailsSize < 256 || maxDetailsSize > 1_048_576) throw new RangeError("maxDetailsSize must be 256 to 1,048,576");
  if (options.hmacKey !== undefined && (!(options.hmacKey instanceof Uint8Array) || options.hmacKey.length < 32)) throw new RangeError("hmacKey must be at least 32 bytes");
  for (const pattern of options.redactPatterns ?? []) if (!(pattern instanceof RegExp)) throw new RangeError("redactPatterns must be regular expressions");
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const redaction: RedactOptions = {
    ...(options.redactKeys ? { redactKeys: options.redactKeys } : {}),
    ...(options.maskEmails === false ? { maskEmails: false } : {}),
    ...(options.redactPatterns ? { redactPatterns: options.redactPatterns } : {}),
  };
  const keyBytes = options.hmacKey === undefined ? null : new Uint8Array(options.hmacKey);
  const encoder = new TextEncoder();
  let hmac: Promise<CryptoKey> | null = null;

  async function digest(entry: Omit<AuditEntry, "hash">): Promise<string> {
    const bytes = encoder.encode(hashInput(entry));
    if (keyBytes === null) return hex(await crypto.subtle.digest("SHA-256", bytes));
    hmac ??= crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", await hmac, bytes));
  }

  async function allowed(actor: Actor, action: AuditReadAction, tenantId: string): Promise<void> {
    if (!actor || typeof actor.userId !== "string" || !(await options.authorize(actor, action, { tenantId }))) {
      throw new AuditLogError("forbidden", "Not allowed");
    }
  }

  function tenant(value: unknown): string {
    if (typeof value !== "string" || !TENANT.test(value)) throw new AuditLogError("invalid-tenant", "Invalid tenant id");
    return value;
  }

  function time(value: unknown, label: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_TIME) throw new AuditLogError("invalid-range", `${label} must be epoch milliseconds`);
    return value as number;
  }

  /** Validates a query and returns the store filter, with the retention cutoff folded into `from`. */
  function filterOf(query: AuditFilter): AuditFilter {
    const out: { actorId?: string; action?: string; actionPrefix?: string; from?: number; to?: number } = {};
    if (query.actorId !== undefined && query.actorId !== null) {
      if (typeof query.actorId !== "string" || !PRINTABLE.test(query.actorId)) throw new AuditLogError("invalid-filter", "Invalid actorId");
      out.actorId = query.actorId;
    }
    if (query.action !== undefined && query.action !== null) {
      if (typeof query.action !== "string" || !ACTION.test(query.action)) throw new AuditLogError("invalid-filter", "Invalid action");
      out.action = query.action;
    }
    if (query.actionPrefix !== undefined && query.actionPrefix !== null) {
      if (typeof query.actionPrefix !== "string" || !ACTION.test(query.actionPrefix)) throw new AuditLogError("invalid-filter", "Invalid actionPrefix");
      out.actionPrefix = query.actionPrefix;
    }
    const from = time(query.from, "from");
    const to = time(query.to, "to");
    if (from !== undefined && to !== undefined && from >= to) throw new AuditLogError("invalid-range", "from must be before to");
    const cutoff = now() - retentionMs;
    out.from = Math.max(from ?? 0, cutoff);
    if (to !== undefined) out.to = to;
    return out;
  }

  async function page(tenantId: string, filter: AuditFilter, beforeSeq: number | null, limit: number) {
    const rows = await store.page(tenantId, { ...filter, beforeSeq, limit: limit + 1 });
    const entries = rows.slice(0, limit);
    const last = entries[entries.length - 1];
    return { entries, nextCursor: rows.length > limit && last ? encodeCursor(last.seq) : null };
  }

  return {
    /**
     * Records one entry through `tx`, the caller's open transaction (or database handle), so the entry commits or
     * rolls back with the change. Call it from trusted server code after your own authorization; it does not
     * authorize. Throws AuditLogError for invalid input, which should roll the change back too.
     */
    async record(tx: Tx, input: AuditRecordInput): Promise<AuditEntry> {
      if (!input || typeof input !== "object") throw new AuditLogError("invalid-details", "Expected an entry object");
      const tenantId = tenant(input.tenantId);
      const actor = input.actor;
      const actorType = actor?.type ?? "user";
      if (!actor || typeof actor.id !== "string" || !PRINTABLE.test(actor.id) || !ACTOR_TYPES.includes(actorType)) {
        throw new AuditLogError("invalid-actor", "actor needs an id (1-256 printable characters) and a known type");
      }
      if (typeof input.action !== "string" || !ACTION.test(input.action)) throw new AuditLogError("invalid-action", "Invalid action");
      const target = input.target ?? null;
      if (target !== null && (typeof target !== "object" || typeof target.type !== "string" || !/^[a-z][a-z0-9_.:-]{0,63}$/.test(target.type)
        || typeof target.id !== "string" || !PRINTABLE.test(target.id))) {
        throw new AuditLogError("invalid-target", "target needs a type and an id");
      }
      if (!OUTCOMES.includes(input.outcome)) throw new AuditLogError("invalid-outcome", "outcome must be success, failure or denied");
      const requestId = input.requestId ?? null;
      if (requestId !== null && (typeof requestId !== "string" || !REQUEST_ID.test(requestId))) throw new AuditLogError("invalid-request-id", "Invalid requestId");
      if (input.details !== undefined && input.details !== null && (typeof input.details !== "object" || Array.isArray(input.details))) {
        throw new AuditLogError("invalid-details", "details must be an object");
      }
      let details = redactDetails(input.details ?? null, redaction);
      const size = canonicalJson(details).length;
      if (size > maxDetailsSize) details = { "[truncated]": true, size };
      const at = now();
      const id = newId();
      return store.append(tx, tenantId, async (head) => {
        const body = {
          id, tenantId, seq: head.seq + 1, at, actorType, actorId: actor.id, action: input.action,
          targetType: target?.type ?? null, targetId: target?.id ?? null, outcome: input.outcome, requestId, details, prevHash: head.hash,
        };
        return { ...body, hash: await digest(body) };
      });
    },

    /** Tenant administrators only: entries newest first, filtered, keyset-paginated; limit 1 to 200 (default 50). */
    async query(actor: Actor, query: AuditQuery): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
      const tenantId = tenant(query?.tenantId);
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new AuditLogError("invalid-limit", "limit must be 1 to 200");
      const before = decodeCursor(query.cursor);
      const filter = filterOf(query);
      await allowed(actor, "read", tenantId);
      return page(tenantId, filter, before, limit);
    },

    /**
     * Tenant administrators only: authorizes now, then returns the matching entries (newest first) as CSV or
     * NDJSON chunks, read from the store in pages of `pageSize` (default 500).
     */
    async export(actor: Actor, query: AuditFilter & { tenantId: string; format: ExportFormat; pageSize?: number }): Promise<AsyncGenerator<string, void, undefined>> {
      const tenantId = tenant(query?.tenantId);
      if (query.format !== "csv" && query.format !== "ndjson") throw new AuditLogError("invalid-format", "format must be csv or ndjson");
      const pageSize = query.pageSize ?? 500;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 5000) throw new AuditLogError("invalid-limit", "pageSize must be 1 to 5000");
      const filter = filterOf(query);
      await allowed(actor, "export", tenantId);
      const format = query.format;
      return (async function* chunks() {
        if (format === "csv") yield CSV_COLUMNS.join(",") + "\r\n";
        let before: number | null = null;
        for (;;) {
          const rows = await store.page(tenantId, { ...filter, beforeSeq: before, limit: pageSize });
          if (rows.length === 0) return;
          yield rows.map((entry) => (format === "csv" ? csvRow(entry) : JSON.stringify(entry) + "\n")).join("");
          if (rows.length < pageSize) return;
          before = rows[rows.length - 1]!.seq;
        }
      })();
    },

    /**
     * Trusted server only. Walks the tenant's chain from the retention anchor to the head, recomputing every hash.
     * Pass a `checkpoint` ({seq, hash}) you stored elsewhere earlier to also prove the chain still contains it, which
     * detects a rewrite of the whole chain or of the anchor by someone with database access. A checkpoint older than
     * the anchor can no longer be proven and fails with `checkpoint-purged`: take a fresh checkpoint after each purge.
     * Rows still present at or below the anchor (a faked purge) fail with `purged-rows-present`.
     */
    async verifyChain(tenantId: string, checkpoint?: { seq: number; hash: string }): Promise<VerifyResult> {
      tenant(tenantId);
      const head = await store.head(tenantId);
      if (!head) {
        return checkpoint && checkpoint.seq > 0 ? { ok: false, reason: "checkpoint-mismatch", seq: checkpoint.seq } : { ok: true, count: 0, head: null };
      }
      if (checkpoint) {
        if (checkpoint.seq > head.seq) return { ok: false, reason: "checkpoint-mismatch", seq: checkpoint.seq };
        if (checkpoint.seq < head.anchorSeq) return { ok: false, reason: "checkpoint-purged", seq: checkpoint.seq };
        if (checkpoint.seq === head.anchorSeq && checkpoint.hash !== head.anchorHash) return { ok: false, reason: "checkpoint-mismatch", seq: checkpoint.seq };
      }
      if (head.anchorSeq > 0) {
        const stale = await store.scan(tenantId, 0, head.anchorSeq, 1);
        if (stale[0]) return { ok: false, reason: "purged-rows-present", seq: stale[0].seq };
      }
      let expectedSeq = head.anchorSeq + 1;
      let prevHash = head.anchorHash;
      let count = 0;
      for (;;) {
        const rows = await store.scan(tenantId, expectedSeq - 1, head.seq, 500);
        for (const entry of rows) {
          if (entry.seq !== expectedSeq) return { ok: false, reason: "sequence-gap", seq: expectedSeq };
          if (entry.prevHash !== prevHash) return { ok: false, reason: "broken-link", seq: entry.seq };
          const { hash, ...body } = entry;
          if ((await digest(body)) !== hash) return { ok: false, reason: "hash-mismatch", seq: entry.seq };
          if (checkpoint && checkpoint.seq === entry.seq && checkpoint.hash !== hash) return { ok: false, reason: "checkpoint-mismatch", seq: entry.seq };
          prevHash = hash;
          expectedSeq++;
          count++;
        }
        if (rows.length < 500 || expectedSeq > head.seq) break;
      }
      if (expectedSeq !== head.seq + 1) return { ok: false, reason: "sequence-gap", seq: expectedSeq };
      if (prevHash !== head.hash) return { ok: false, reason: "head-mismatch", seq: head.seq };
      return { ok: true, count, head };
    },

    /** Trusted server only: the tenant's current head, to store outside the database as a checkpoint. */
    async checkpoint(tenantId: string): Promise<{ seq: number; hash: string } | null> {
      const head = await store.head(tenant(tenantId));
      return head ? { seq: head.seq, hash: head.hash } : null;
    },

    /**
     * Trusted server only, from a scheduled job: deletes entries older than the retention period for one tenant
     * (or every tenant). The chain anchor moves to the last purged entry, so verifyChain still passes afterwards.
     */
    async purgeExpired(tenantId?: string): Promise<{ purged: number; cutoff: number }> {
      const cutoff = now() - retentionMs;
      const tenants = tenantId === undefined ? await store.tenants() : [tenant(tenantId)];
      let purged = 0;
      for (const id of tenants) purged += await store.purge(id, cutoff);
      return { purged, cutoff };
    },

    retentionMs,
  };
}

export type AuditLog<Tx = unknown> = ReturnType<typeof createAuditLog<Tx>>;
