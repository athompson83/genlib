// SPDX-License-Identifier: Apache-2.0
// Outgoing webhook delivery: tenant-scoped endpoint management behind an injected authorize hook, a durable delivery
// queue written on the caller's transaction, a leased worker that signs each attempt with Standard Webhooks headers,
// enforces a per-attempt AbortSignal timeout and the SSRF guard, retries with exponential backoff and jitter, and
// dead-letters after maxAttempts with manual replay. Delivery is at least once: the webhook-id stays the same for one
// (event, endpoint) pair across retries and replays so receivers can deduplicate. Framework-neutral; the application
// supplies the store, fetch, DNS resolver and authorization.
import { guardWebhookUrl, type ResolveHost } from "./ssrf.js";
import { generateWebhookSecret, signWebhook } from "./signing.js";

export type DeliveryStatus = "pending" | "delivering" | "succeeded" | "dead";
export type AttemptOutcome = "success" | "http-error" | "redirect" | "network-error" | "timeout" | "blocked";
export type WebhookAction =
  | "endpoint:create" | "endpoint:read" | "endpoint:update" | "endpoint:delete" | "endpoint:rotate-secret"
  | "delivery:read" | "delivery:replay";

export interface StoredSecret {
  readonly id: string;
  /** `whsec_` secret, or the sealed form when a secretBox is configured. */
  readonly value: string;
  readonly createdAt: number;
  /** Null while current; set at rotation to the end of the grace period. */
  readonly expiresAt: number | null;
}

export interface StoredEndpoint {
  readonly id: string;
  readonly tenantId: string;
  readonly url: string;
  readonly description: string;
  /** Event types this endpoint receives; null means every type. */
  readonly eventTypes: readonly string[] | null;
  readonly enabled: boolean;
  readonly secrets: readonly StoredSecret[];
  /** Optimistic concurrency version, incremented by every update. */
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** What callers see: never secret values, only their ids and lifetimes. */
export interface EndpointView {
  readonly id: string;
  readonly tenantId: string;
  readonly url: string;
  readonly description: string;
  readonly eventTypes: readonly string[] | null;
  readonly enabled: boolean;
  readonly secrets: readonly { readonly id: string; readonly createdAt: number; readonly expiresAt: number | null }[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface DeliveryRecord {
  /** Sent as webhook-id; one per (event, endpoint), stable across retries and replay. */
  readonly id: string;
  readonly tenantId: string;
  readonly endpointId: string;
  readonly eventId: string;
  readonly eventType: string;
  /** The exact JSON body, serialized once at enqueue. */
  readonly body: string;
  readonly status: DeliveryStatus;
  /** Attempts started (incremented at claim). */
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly lastError: string | null;
  readonly lastStatusCode: number | null;
  readonly createdAt: number;
  readonly completedAt: number | null;
}

export type DeliveryView = Omit<DeliveryRecord, "body" | "leaseOwner" | "leaseExpiresAt">;

export interface AttemptRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly outcome: AttemptOutcome;
  readonly statusCode: number | null;
  readonly error: string | null;
  /** The first maxResponseBytes of the response body, decoded as UTF-8. */
  readonly responseBody: string | null;
}

export interface CompletePatch {
  readonly status: "pending" | "succeeded" | "dead";
  readonly nextAttemptAt?: number;
  readonly lastError?: string | null;
  readonly lastStatusCode?: number | null;
  readonly completedAt?: number | null;
}

export interface EndpointPatch {
  readonly url?: string;
  readonly description?: string;
  readonly eventTypes?: readonly string[] | null;
  readonly enabled?: boolean;
  readonly secrets?: readonly StoredSecret[];
}

export interface DeliveryFilter {
  readonly endpointId?: string;
  readonly status?: DeliveryStatus;
  readonly limit: number;
}

/**
 * Persistence. Every read and write except claim/complete/recordAttempt is scoped by tenantId. `Tx` is whatever your
 * store accepts as a transaction handle; enqueue passes it to endpointsForEvent and insertDeliveries.
 */
export interface WebhookDeliveryStore<Tx = unknown> {
  insertEndpoint(endpoint: StoredEndpoint): Promise<void>;
  getEndpoint(tenantId: string, id: string): Promise<StoredEndpoint | null>;
  listEndpoints(tenantId: string): Promise<StoredEndpoint[]>;
  /** Applies the patch only when the stored version equals expectedVersion; returns the new row or null. */
  updateEndpoint(tenantId: string, id: string, expectedVersion: number, patch: EndpointPatch, updatedAt: number): Promise<StoredEndpoint | null>;
  deleteEndpoint(tenantId: string, id: string): Promise<boolean>;
  /** Enabled endpoints of the tenant that subscribe to eventType (or to every type). */
  endpointsForEvent(tenantId: string, eventType: string, tx?: Tx): Promise<StoredEndpoint[]>;
  /** Inserts rows unless (endpointId, eventId) exists; returns the stored row for every input pair. Atomic per row. */
  insertDeliveries(rows: readonly DeliveryRecord[], tx?: Tx): Promise<DeliveryRecord[]>;
  /**
   * Atomically claims up to `limit` rows that are pending and due, or delivering with an expired lease: sets status
   * delivering, the lease owner and expiry, and increments attempts. Two concurrent claims never return the same row.
   */
  claim(input: { now: number; limit: number; workerId: string; leaseMs: number }): Promise<DeliveryRecord[]>;
  /** Applies the patch only while the row is delivering and leased by workerId; clears the lease. False otherwise. */
  complete(id: string, workerId: string, patch: CompletePatch): Promise<boolean>;
  /** Sets leaseExpiresAt only while the row is delivering and leased by workerId (even if the lease lapsed). */
  renewLease(id: string, workerId: string, leaseExpiresAt: number): Promise<boolean>;
  recordAttempt(attempt: AttemptRecord): Promise<void>;
  getDelivery(tenantId: string, id: string): Promise<DeliveryRecord | null>;
  /** Newest first. */
  listDeliveries(tenantId: string, filter: DeliveryFilter): Promise<DeliveryRecord[]>;
  /** Oldest attempt first (by start time; attempt numbers restart after a replay). */
  listAttempts(tenantId: string, deliveryId: string): Promise<AttemptRecord[]>;
  /** dead or succeeded -> pending with attempts 0 and nextAttemptAt now; null otherwise. */
  replay(tenantId: string, id: string, now: number): Promise<DeliveryRecord | null>;
}

/** Fetch-compatible function. The third argument carries the checked addresses for a pinning implementation. */
export type WebhookFetch = (url: string, init: RequestInit, context: { readonly addresses: readonly string[] }) => Promise<Response>;

export interface SecretBox {
  /** Encrypt a `whsec_` secret before it is stored. */
  seal(secret: string): Promise<string>;
  open(sealed: string): Promise<string>;
}

export interface BackoffOptions {
  /** First retry delay before jitter. Default 30,000 ms. */
  readonly baseMs?: number;
  /** Largest delay before jitter. Default 6 hours. */
  readonly maxMs?: number;
}

export interface WebhookDeliveryOptions<Tx = unknown> {
  readonly store: WebhookDeliveryStore<Tx>;
  readonly fetch: WebhookFetch;
  readonly resolveHost: ResolveHost;
  /** Must return exactly true to allow; anything else is refused with `forbidden`. */
  readonly authorize: (actor: unknown, tenantId: string, action: WebhookAction) => boolean | Promise<boolean>;
  readonly now?: () => number;
  /** Uniform [0, 1) source for jitter. Default Math.random. */
  readonly random?: () => number;
  readonly newId?: () => string;
  /** Per-attempt timeout covering DNS, connect, response headers and the capped body read. Default 10,000 ms. */
  readonly timeoutMs?: number;
  /** Creates the per-attempt signal. Default AbortSignal.timeout. Inject for deterministic tests. */
  readonly timeoutSignal?: (ms: number) => AbortSignal;
  /** Attempts before a delivery is dead. Default 10. */
  readonly maxAttempts?: number;
  readonly backoff?: BackoffOptions;
  /** Response bytes kept in the attempt log. Default 4,096. */
  readonly maxResponseBytes?: number;
  /** Largest serialized body. Default 256 KiB. */
  readonly maxPayloadBytes?: number;
  /** Endpoints per tenant. Default 50. */
  readonly maxEndpointsPerTenant?: number;
  /** Permit http: endpoints (tests only). Address checks still apply. Default false. */
  readonly allowHttp?: boolean;
  /** Default rotation grace period for the previous secret. Default 24 hours. */
  readonly rotationGraceMs?: number;
  readonly secretBox?: SecretBox;
  readonly userAgent?: string;
}

export interface EnqueueInput {
  readonly tenantId: string;
  /** Stable id of the business event (for example `order.paid:o_123`); enqueue is idempotent on it. Default random. */
  readonly eventId?: string;
  readonly type: string;
  readonly data: unknown;
  /** Epoch ms written as the body timestamp. Default now. */
  readonly occurredAt?: number;
}

export interface RunOptions {
  /** Unique per process. */
  readonly workerId: string;
  /** Deliveries claimed per call. Default 10, at most 500. */
  readonly limit?: number;
  /** Parallel attempts. Default 5, at most 50. */
  readonly concurrency?: number;
  /**
   * Lease length. The claim takes it once for the batch and each attempt renews it when it starts. Must be at least
   * timeoutMs x ceil(limit / concurrency) and at least timeoutMs + 1 s. Default the larger of those plus 30 s.
   */
  readonly leaseMs?: number;
}

export interface RunSummary {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
  /** Results discarded because another worker reclaimed the lease first. */
  lostLease: number;
}

export interface CreateEndpointInput {
  readonly url: string;
  readonly description?: string;
  readonly eventTypes?: readonly string[] | null;
}

export interface UpdateEndpointInput {
  readonly url?: string;
  readonly description?: string;
  readonly eventTypes?: readonly string[] | null;
  readonly enabled?: boolean;
}

export interface WebhookDelivery<Tx = unknown> {
  /** Returns the endpoint and its secret; the secret is never returned again. */
  createEndpoint(actor: unknown, tenantId: string, input: CreateEndpointInput): Promise<{ endpoint: EndpointView; secret: string }>;
  listEndpoints(actor: unknown, tenantId: string): Promise<EndpointView[]>;
  getEndpoint(actor: unknown, tenantId: string, id: string): Promise<EndpointView>;
  updateEndpoint(actor: unknown, tenantId: string, id: string, input: UpdateEndpointInput): Promise<EndpointView>;
  deleteEndpoint(actor: unknown, tenantId: string, id: string): Promise<void>;
  /** Adds a new secret (returned once) and expires the current ones after graceMs. */
  rotateSecret(actor: unknown, tenantId: string, id: string, options?: { graceMs?: number }): Promise<{ endpoint: EndpointView; secret: string }>;
  /** Writes one delivery per subscribed endpoint. Pass your transaction as `tx` so rows commit with your change. */
  enqueue(input: EnqueueInput, options?: { tx?: Tx }): Promise<DeliveryView[]>;
  runOnce(options: RunOptions): Promise<RunSummary>;
  listDeliveries(actor: unknown, tenantId: string, filter?: { endpointId?: string; status?: DeliveryStatus; limit?: number }): Promise<DeliveryView[]>;
  getDelivery(actor: unknown, tenantId: string, id: string): Promise<DeliveryView>;
  listAttempts(actor: unknown, tenantId: string, deliveryId: string): Promise<AttemptRecord[]>;
  /** Requeues a dead or succeeded delivery with the same webhook-id and a fresh attempt budget. */
  replay(actor: unknown, tenantId: string, deliveryId: string): Promise<DeliveryView>;
}

export type WebhookErrorCode =
  | "forbidden" | "not-found" | "invalid-url" | "bad-request" | "payload-too-large" | "conflict" | "not-replayable" | "limit-exceeded";

export class WebhookDeliveryError extends Error {
  readonly code: WebhookErrorCode;
  constructor(code: WebhookErrorCode, message: string) {
    super(message);
    this.name = "WebhookDeliveryError";
    this.code = code;
  }
}

/** min(maxMs, baseMs * 2^(attempt-1)) scaled by a uniform factor in [0.5, 1). */
export function exponentialJitterBackoff(attempt: number, options: { baseMs: number; maxMs: number; random: () => number }): number {
  const exponent = Math.min(Math.max(attempt, 1) - 1, 52);
  const ceiling = Math.min(options.maxMs, options.baseMs * 2 ** exponent);
  const r = Math.min(Math.max(options.random(), 0), 1);
  return Math.floor(ceiling * (0.5 + r / 2));
}

const encoder = new TextEncoder();
const TENANT = /^[\x21-\x7e]{1,200}$/;
const EVENT_ID = /^[\x21-\x7e]{1,200}$/;
const EVENT_TYPE = /^[A-Za-z0-9_.:\-]{1,200}$/;
const MAX_SECRETS = 10;
/** Lease time beyond timeoutMs for the attempt log and completion writes after an attempt. */
const LEASE_HEADROOM_MS = 1000;
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);

function intIn(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return v;
}

function toEndpointView(e: StoredEndpoint): EndpointView {
  return {
    id: e.id, tenantId: e.tenantId, url: e.url, description: e.description,
    eventTypes: e.eventTypes ? [...e.eventTypes] : null, enabled: e.enabled,
    secrets: e.secrets.map(s => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt })),
    createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}

function toDeliveryView(d: DeliveryRecord): DeliveryView {
  return {
    id: d.id, tenantId: d.tenantId, endpointId: d.endpointId, eventId: d.eventId, eventType: d.eventType,
    status: d.status, attempts: d.attempts, nextAttemptAt: d.nextAttemptAt, lastError: d.lastError,
    lastStatusCode: d.lastStatusCode, createdAt: d.createdAt, completedAt: d.completedAt,
  };
}

/** Rejects when the signal aborts even if the underlying promise never settles. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const reason = () => signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(reason());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(reason());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      value => { signal.removeEventListener("abort", onAbort); resolve(value); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

/** Reads at most `limit` bytes, then cancels the stream. Never throws; returns what was read. */
async function readCapped(response: Response, limit: number, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      const take = value.subarray(0, Math.min(value.byteLength, limit - size));
      chunks.push(take);
      size += take.byteLength;
    }
  } catch {
    // Timeout or stream error: keep the partial body.
  }
  reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

interface AttemptResult {
  outcome: AttemptOutcome;
  statusCode: number | null;
  error: string | null;
  responseBody: string | null;
}

export function createWebhookDelivery<Tx = unknown>(options: WebhookDeliveryOptions<Tx>): WebhookDelivery<Tx> {
  const { store } = options;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const newId = options.newId ?? (() => crypto.randomUUID().replaceAll("-", ""));
  const timeoutMs = intIn(options.timeoutMs, 10_000, 1, 120_000, "timeoutMs");
  const timeoutSignal = options.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));
  const maxAttempts = intIn(options.maxAttempts, 10, 1, 100, "maxAttempts");
  const baseMs = intIn(options.backoff?.baseMs, 30_000, 1, 86_400_000, "backoff.baseMs");
  const maxMs = intIn(options.backoff?.maxMs, 21_600_000, baseMs, 7 * 86_400_000, "backoff.maxMs");
  const maxResponseBytes = intIn(options.maxResponseBytes, 4096, 0, 1_048_576, "maxResponseBytes");
  const maxPayloadBytes = intIn(options.maxPayloadBytes, 262_144, 1, 10_485_760, "maxPayloadBytes");
  const maxEndpoints = intIn(options.maxEndpointsPerTenant, 50, 1, 10_000, "maxEndpointsPerTenant");
  const defaultGrace = intIn(options.rotationGraceMs, 86_400_000, 0, 30 * 86_400_000, "rotationGraceMs");
  const allowHttp = options.allowHttp === true;
  const userAgent = options.userAgent ?? "genlib-webhook-delivery/0.1";
  const seal = (secret: string) => (options.secretBox ? options.secretBox.seal(secret) : Promise.resolve(secret));
  const open = (value: string) => (options.secretBox ? options.secretBox.open(value) : Promise.resolve(value));

  async function allow(actor: unknown, tenantId: string, action: WebhookAction): Promise<void> {
    if (typeof tenantId !== "string" || !TENANT.test(tenantId)) throw new WebhookDeliveryError("bad-request", "Invalid tenant id");
    if ((await options.authorize(actor, tenantId, action)) !== true) throw new WebhookDeliveryError("forbidden", `Not allowed: ${action}`);
  }

  async function checkUrl(url: unknown): Promise<string> {
    if (typeof url !== "string") throw new WebhookDeliveryError("invalid-url", "Endpoint URL refused: invalid-url");
    const result = await guardWebhookUrl(url, { resolveHost: options.resolveHost, allowHttp });
    if (!result.ok) throw new WebhookDeliveryError("invalid-url", `Endpoint URL refused: ${result.reason}`);
    return result.url;
  }

  function checkDescription(value: unknown): string {
    if (value === undefined) return "";
    if (typeof value !== "string" || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new WebhookDeliveryError("bad-request", "description must be at most 500 characters without control characters");
    }
    return value;
  }

  function checkEventTypes(value: unknown): readonly string[] | null {
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value) || value.length === 0 || value.length > 100 || !value.every(t => typeof t === "string" && EVENT_TYPE.test(t))) {
      throw new WebhookDeliveryError("bad-request", "eventTypes must be null or 1-100 event type names");
    }
    return [...new Set(value as string[])];
  }

  async function newSecret(at: number): Promise<{ record: StoredSecret; plain: string }> {
    const plain = generateWebhookSecret();
    return { plain, record: { id: "sec_" + newId(), value: await seal(plain), createdAt: at, expiresAt: null } };
  }

  async function loadEndpoint(tenantId: string, id: unknown): Promise<StoredEndpoint> {
    const endpoint = typeof id === "string" && id.length > 0 && id.length <= 200 ? await store.getEndpoint(tenantId, id) : null;
    if (!endpoint || endpoint.tenantId !== tenantId) throw new WebhookDeliveryError("not-found", "Endpoint not found");
    return endpoint;
  }

  async function loadDelivery(tenantId: string, id: unknown): Promise<DeliveryRecord> {
    const delivery = typeof id === "string" && id.length > 0 && id.length <= 300 ? await store.getDelivery(tenantId, id) : null;
    if (!delivery || delivery.tenantId !== tenantId) throw new WebhookDeliveryError("not-found", "Delivery not found");
    return delivery;
  }

  async function update(endpoint: StoredEndpoint, patch: EndpointPatch): Promise<StoredEndpoint> {
    const updated = await store.updateEndpoint(endpoint.tenantId, endpoint.id, endpoint.version, patch, now());
    if (!updated) throw new WebhookDeliveryError("conflict", "The endpoint changed concurrently; retry");
    return updated;
  }

  async function attempt(delivery: DeliveryRecord, endpoint: StoredEndpoint, startedAt: number): Promise<AttemptResult> {
    const signal = timeoutSignal(timeoutMs);
    try {
      // Everything in the attempt, including secretBox.open and signing, ends at the deadline.
      return await abortable(send(delivery, endpoint, startedAt, signal), signal);
    } catch (error) {
      if (signal.aborted || isTimeout(error)) return { outcome: "timeout", statusCode: null, error: "timeout", responseBody: null };
      return { outcome: "network-error", statusCode: null, error: errorText(error), responseBody: null };
    }
  }

  async function send(delivery: DeliveryRecord, endpoint: StoredEndpoint, startedAt: number, signal: AbortSignal): Promise<AttemptResult> {
    const guard = await abortable(guardWebhookUrl(endpoint.url, { resolveHost: options.resolveHost, allowHttp, signal }), signal);
      if (!guard.ok) return { outcome: "blocked", statusCode: null, error: `endpoint address refused: ${guard.reason}`, responseBody: null };
      const active = endpoint.secrets.filter(s => s.expiresAt === null || s.expiresAt > startedAt).slice(0, MAX_SECRETS);
      if (active.length === 0) return { outcome: "blocked", statusCode: null, error: "no active signing secret", responseBody: null };
      const secrets = await Promise.all(active.map(s => open(s.value)));
      const signed = await signWebhook({ id: delivery.id, timestamp: Math.floor(startedAt / 1000), body: delivery.body, secrets });
      const headers: Record<string, string> = { "content-type": "application/json", "user-agent": userAgent, ...signed };
      const response = await abortable(
        options.fetch(guard.url, { method: "POST", headers, body: delivery.body, redirect: "manual", signal }, { addresses: guard.addresses }),
        signal,
      );
      const status = response.status;
      if (response.type === "opaqueredirect" || (status >= 300 && status < 400)) {
        response.body?.cancel().catch(() => undefined);
        return { outcome: "redirect", statusCode: status || null, error: `redirect ${status} not followed`, responseBody: null };
      }
      const body = await readCapped(response, maxResponseBytes, signal);
      if (status >= 200 && status < 300) return { outcome: "success", statusCode: status, error: null, responseBody: body };
      return { outcome: "http-error", statusCode: status, error: `http ${status}`, responseBody: body };
  }

  return {
    async createEndpoint(actor, tenantId, input) {
      await allow(actor, tenantId, "endpoint:create");
      const description = checkDescription(input?.description);
      const eventTypes = checkEventTypes(input?.eventTypes);
      const url = await checkUrl(input?.url);
      if ((await store.listEndpoints(tenantId)).length >= maxEndpoints) {
        throw new WebhookDeliveryError("limit-exceeded", `At most ${maxEndpoints} endpoints per tenant`);
      }
      const at = now();
      const { record, plain } = await newSecret(at);
      const endpoint: StoredEndpoint = {
        id: "ep_" + newId(), tenantId, url, description, eventTypes, enabled: true, secrets: [record], version: 1, createdAt: at, updatedAt: at,
      };
      await store.insertEndpoint(endpoint);
      return { endpoint: toEndpointView(endpoint), secret: plain };
    },

    async listEndpoints(actor, tenantId) {
      await allow(actor, tenantId, "endpoint:read");
      return (await store.listEndpoints(tenantId)).filter(e => e.tenantId === tenantId).map(toEndpointView);
    },

    async getEndpoint(actor, tenantId, id) {
      await allow(actor, tenantId, "endpoint:read");
      return toEndpointView(await loadEndpoint(tenantId, id));
    },

    async updateEndpoint(actor, tenantId, id, input) {
      await allow(actor, tenantId, "endpoint:update");
      const endpoint = await loadEndpoint(tenantId, id);
      const patch: { -readonly [K in keyof EndpointPatch]: EndpointPatch[K] } = {};
      if (input?.url !== undefined) patch.url = await checkUrl(input.url);
      if (input?.description !== undefined) patch.description = checkDescription(input.description);
      if (input?.eventTypes !== undefined) patch.eventTypes = checkEventTypes(input.eventTypes);
      if (input?.enabled !== undefined) {
        if (typeof input.enabled !== "boolean") throw new WebhookDeliveryError("bad-request", "enabled must be a boolean");
        patch.enabled = input.enabled;
      }
      return toEndpointView(await update(endpoint, patch));
    },

    async deleteEndpoint(actor, tenantId, id) {
      await allow(actor, tenantId, "endpoint:delete");
      const endpoint = await loadEndpoint(tenantId, id);
      if (!(await store.deleteEndpoint(tenantId, endpoint.id))) throw new WebhookDeliveryError("not-found", "Endpoint not found");
    },

    async rotateSecret(actor, tenantId, id, rotateOptions = {}) {
      await allow(actor, tenantId, "endpoint:rotate-secret");
      const graceMs = intIn(rotateOptions.graceMs, defaultGrace, 0, 30 * 86_400_000, "graceMs");
      const endpoint = await loadEndpoint(tenantId, id);
      const at = now();
      const kept = endpoint.secrets
        .filter(s => s.expiresAt === null || s.expiresAt > at)
        .map(s => ({ ...s, expiresAt: Math.min(s.expiresAt ?? Infinity, at + graceMs) }))
        .filter(s => s.expiresAt > at);
      if (kept.length >= MAX_SECRETS) throw new WebhookDeliveryError("limit-exceeded", `At most ${MAX_SECRETS} active secrets`);
      const { record, plain } = await newSecret(at);
      const updated = await update(endpoint, { secrets: [...kept, record] });
      return { endpoint: toEndpointView(updated), secret: plain };
    },

    async enqueue(input, enqueueOptions = {}) {
      if (!input || typeof input.tenantId !== "string" || !TENANT.test(input.tenantId)) throw new WebhookDeliveryError("bad-request", "Invalid tenant id");
      if (typeof input.type !== "string" || !EVENT_TYPE.test(input.type)) throw new WebhookDeliveryError("bad-request", "Invalid event type");
      const eventId = input.eventId ?? "evt_" + newId();
      if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) throw new WebhookDeliveryError("bad-request", "Invalid event id");
      const at = now();
      const occurredAt = input.occurredAt ?? at;
      if (!Number.isFinite(occurredAt)) throw new WebhookDeliveryError("bad-request", "Invalid occurredAt");
      let body: string;
      try {
        body = JSON.stringify({ type: input.type, timestamp: new Date(occurredAt).toISOString(), data: input.data ?? null });
      } catch {
        throw new WebhookDeliveryError("bad-request", "data must be JSON-serializable");
      }
      if (encoder.encode(body).byteLength > maxPayloadBytes) throw new WebhookDeliveryError("payload-too-large", `Body exceeds ${maxPayloadBytes} bytes`);
      const tx = enqueueOptions.tx;
      const endpoints = (await store.endpointsForEvent(input.tenantId, input.type, tx))
        .filter(e => e.tenantId === input.tenantId && e.enabled && (e.eventTypes === null || e.eventTypes.includes(input.type)));
      if (endpoints.length === 0) return [];
      const rows: DeliveryRecord[] = endpoints.map(e => ({
        id: "msg_" + newId(), tenantId: input.tenantId, endpointId: e.id, eventId, eventType: input.type, body,
        status: "pending", attempts: 0, nextAttemptAt: at, leaseOwner: null, leaseExpiresAt: null,
        lastError: null, lastStatusCode: null, createdAt: at, completedAt: null,
      }));
      return (await store.insertDeliveries(rows, tx)).map(toDeliveryView);
    },

    async runOnce(run) {
      if (typeof run?.workerId !== "string" || run.workerId.length === 0 || run.workerId.length > 200) throw new RangeError("workerId is required");
      const limit = intIn(run.limit, 10, 1, 500, "limit");
      const concurrency = intIn(run.concurrency, 5, 1, 50, "concurrency");
      // The claim lease must cover a lane's queue; each renewed lease must cover one attempt plus the store writes after it.
      const minimumLease = Math.max(timeoutMs * Math.ceil(limit / concurrency), timeoutMs + LEASE_HEADROOM_MS);
      const leaseMs = intIn(run.leaseMs, minimumLease + 30_000, 1, 86_400_000, "leaseMs");
      if (leaseMs < minimumLease) {
        throw new RangeError(`leaseMs must be at least max(timeoutMs x ceil(limit / concurrency), timeoutMs + ${LEASE_HEADROOM_MS}) = ${minimumLease}`);
      }
      const workerId = run.workerId;
      const summary: RunSummary = { claimed: 0, succeeded: 0, retried: 0, dead: 0, lostLease: 0 };
      const claimed = await store.claim({ now: now(), limit, workerId, leaseMs });
      summary.claimed = claimed.length;

      const processOne = async (delivery: DeliveryRecord) => {
        const finish = async (patch: CompletePatch, counter: "succeeded" | "retried" | "dead") => {
          if (await store.complete(delivery.id, workerId, patch)) summary[counter]++;
          else summary.lostLease++;
        };
        // Crash loops: a reclaimed row whose earlier attempts used up the budget is not sent again.
        if (delivery.attempts > maxAttempts) {
          return finish({ status: "dead", lastError: delivery.lastError ?? "lease expired after the last attempt", completedAt: now() }, "dead");
        }
        const endpoint = await store.getEndpoint(delivery.tenantId, delivery.endpointId);
        if (!endpoint || endpoint.tenantId !== delivery.tenantId) return finish({ status: "dead", lastError: "endpoint not found", completedAt: now() }, "dead");
        if (!endpoint.enabled) return finish({ status: "dead", lastError: "endpoint disabled", completedAt: now() }, "dead");
        // Renew the lease as the attempt starts. If it lapsed and another worker reclaimed the row, skip it: that worker owns it.
        if (!(await store.renewLease(delivery.id, workerId, now() + leaseMs))) { summary.lostLease++; return; }
        const startedAt = now();
        const result = await attempt(delivery, endpoint, startedAt);
        const finishedAt = now();
        await store.recordAttempt({
          id: "att_" + newId(), tenantId: delivery.tenantId, deliveryId: delivery.id, attempt: delivery.attempts, startedAt,
          durationMs: Math.max(0, finishedAt - startedAt), outcome: result.outcome, statusCode: result.statusCode,
          error: result.error, responseBody: result.responseBody,
        });
        if (result.outcome === "success") {
          return finish({ status: "succeeded", lastError: null, lastStatusCode: result.statusCode, completedAt: finishedAt }, "succeeded");
        }
        if (delivery.attempts >= maxAttempts) {
          return finish({ status: "dead", lastError: result.error, lastStatusCode: result.statusCode, completedAt: finishedAt }, "dead");
        }
        const delay = exponentialJitterBackoff(delivery.attempts, { baseMs, maxMs, random });
        return finish({ status: "pending", nextAttemptAt: finishedAt + delay, lastError: result.error, lastStatusCode: result.statusCode }, "retried");
      };

      let next = 0;
      const errors: unknown[] = [];
      const lanes = Array.from({ length: Math.min(concurrency, claimed.length) }, async () => {
        while (next < claimed.length) {
          const delivery = claimed[next++]!;
          try { await processOne(delivery); } catch (error) { errors.push(error); }
        }
      });
      await Promise.all(lanes);
      if (errors.length > 0) throw errors[0];
      return summary;
    },

    async listDeliveries(actor, tenantId, filter = {}) {
      await allow(actor, tenantId, "delivery:read");
      const limit = intIn(filter.limit, 50, 1, 200, "limit");
      const query: { -readonly [K in keyof DeliveryFilter]: DeliveryFilter[K] } = { limit };
      if (filter.endpointId !== undefined) query.endpointId = String(filter.endpointId);
      if (filter.status !== undefined) {
        if (!["pending", "delivering", "succeeded", "dead"].includes(filter.status)) throw new WebhookDeliveryError("bad-request", "Invalid status");
        query.status = filter.status;
      }
      return (await store.listDeliveries(tenantId, query)).filter(d => d.tenantId === tenantId).map(toDeliveryView);
    },

    async getDelivery(actor, tenantId, id) {
      await allow(actor, tenantId, "delivery:read");
      return toDeliveryView(await loadDelivery(tenantId, id));
    },

    async listAttempts(actor, tenantId, deliveryId) {
      await allow(actor, tenantId, "delivery:read");
      const delivery = await loadDelivery(tenantId, deliveryId);
      return (await store.listAttempts(tenantId, delivery.id)).filter(a => a.tenantId === tenantId);
    },

    async replay(actor, tenantId, deliveryId) {
      await allow(actor, tenantId, "delivery:replay");
      const delivery = await loadDelivery(tenantId, deliveryId);
      const replayed = await store.replay(tenantId, delivery.id, now());
      if (!replayed) throw new WebhookDeliveryError("not-replayable", "Only dead or succeeded deliveries can be replayed");
      return toDeliveryView(replayed);
    },
  };
}
