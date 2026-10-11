// SPDX-License-Identifier: Apache-2.0
// Transactional email outbox: enqueue rendered messages idempotently, dispatch them with leases, retries with
// full-jitter backoff and dead-lettering, and apply delivery, bounce and complaint events (with a suppression list).
// Delivery is at least once: a worker that crashes after the provider accepted a message will send it again after
// its lease expires, so transports pass the message key as the provider idempotency key where the provider has one.
// Framework-neutral. The receiving application supplies the store, the transport and the templates.

export type EmailStatus =
  | "queued" | "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "dead" | "cancelled" | "suppressed";

export interface EmailMessage {
  readonly id: string;
  /** Caller-chosen idempotency key, unique across the outbox (for example `welcome:user-42`). */
  readonly key: string;
  readonly tenantId: string | null;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly tags: Readonly<Record<string, string>>;
  /** SHA-256 of the canonical enqueue input; a reused key with a different fingerprint is refused. */
  readonly fingerprint: string;
  readonly status: EmailStatus;
  /** Send attempts started (incremented when a worker claims the message). */
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly providerId: string | null;
  readonly lastError: string | null;
  readonly createdAt: number;
  readonly sentAt: number | null;
}

export interface RenderedEmail { readonly subject: string; readonly text: string; readonly html?: string }
export type EmailTemplate = (data: unknown) => RenderedEmail | Promise<RenderedEmail>;

/** What a transport receives. `from` comes from the outbox configuration. */
export interface OutgoingEmail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly tags: Readonly<Record<string, string>>;
  readonly key: string;
  readonly id: string;
}

export type SendResult =
  | { readonly status: "sent"; readonly providerId: string }
  | { readonly status: "retryable"; readonly error: string; readonly retryAfterMs?: number }
  | { readonly status: "permanent"; readonly error: string };

export interface EmailTransport {
  /** Must reuse `idempotencyKey` on every attempt of the same message. A thrown error is treated as retryable. */
  send(message: OutgoingEmail, context: { readonly idempotencyKey: string }): Promise<SendResult>;
}

export interface CompletePatch {
  readonly status: "queued" | "sent" | "failed" | "dead" | "suppressed";
  readonly providerId?: string;
  readonly lastError?: string;
  readonly nextAttemptAt?: number;
  readonly sentAt?: number;
}

export interface EmailOutboxStore {
  /** Inserts the message unless its key exists; returns the stored row (the new one or the existing one). Atomic. */
  insertIfAbsent(message: EmailMessage): Promise<EmailMessage>;
  findByKey(key: string): Promise<EmailMessage | null>;
  findByProviderId(providerId: string): Promise<EmailMessage | null>;
  /**
   * Atomically claims up to `limit` messages that are queued and due, or sending with an expired lease: sets status
   * sending, the lease owner and expiry, and increments attempts. Two concurrent claims never return the same row.
   */
  claim(input: { now: number; limit: number; workerId: string; leaseMs: number }): Promise<EmailMessage[]>;
  /** Applies `patch` only while the message is sending and leased by `workerId`; clears the lease. False otherwise. */
  complete(id: string, workerId: string, patch: CompletePatch): Promise<boolean>;
  /** queued -> cancelled; returns the updated message, or null when it was not queued. */
  cancel(key: string): Promise<EmailMessage | null>;
  /** Sets `to` only while the message's status is one of `from`; returns the updated message or null. */
  transitionByProviderId(providerId: string, from: readonly EmailStatus[], to: EmailStatus): Promise<EmailMessage | null>;
  /** Adds the address (already lower-cased) unless present. */
  suppress(address: string, reason: string, at: number): Promise<void>;
  isSuppressed(address: string): Promise<boolean>;
}

export interface BackoffOptions {
  /** First retry ceiling in ms. Default 30,000. */
  readonly baseMs?: number;
  /** Largest ceiling in ms. Default 3,600,000 (one hour). */
  readonly maxMs?: number;
  /** Uniform random in [0, 1). Default Math.random; inject a fixed function in tests. */
  readonly random?: () => number;
}

export interface EmailOutboxOptions {
  readonly store: EmailOutboxStore;
  readonly transport: EmailTransport;
  readonly templates: Readonly<Record<string, EmailTemplate>>;
  /** Sender, for example `Acme <no-reply@acme.example>`. */
  readonly from: string;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Attempts before a retryable failure becomes dead. Default 6. */
  readonly maxAttempts?: number;
  /** Full-jitter exponential backoff settings, or a function from attempt number (1-based) to delay in ms. */
  readonly backoff?: BackoffOptions | ((attempt: number) => number);
  /** Extra suppression check (for example your own unsubscribe list), consulted with the store's list. */
  readonly suppress?: (address: string) => boolean | Promise<boolean>;
}

export interface EnqueueInput {
  readonly key: string;
  readonly to: string;
  readonly template: string;
  readonly data?: unknown;
  readonly tenantId?: string;
  /** Earliest send time, epoch ms. Default now. */
  readonly sendAt?: number;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface DispatchInput {
  readonly workerId: string;
  /** Messages claimed per call. Default 20, at most 500. */
  readonly batch?: number;
  /** Lease length in ms; must exceed batch x transport timeout. Default 120,000. */
  readonly leaseMs?: number;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  dead: number;
  suppressed: number;
  /** Results discarded because another worker reclaimed the lease first. */
  lostLease: number;
}

export interface EmailEvent {
  readonly type: "delivered" | "bounced" | "complained";
  readonly providerId: string;
  readonly at: number;
  /** For bounces: true for a permanent (hard) bounce. Soft bounces change nothing. */
  readonly hard?: boolean;
}

export interface EventResult { readonly applied: boolean; readonly message: EmailMessage | null }

export type EmailOutboxErrorCode =
  | "invalid-key" | "invalid-address" | "invalid-header" | "invalid-template" | "invalid-data" | "invalid-tenant"
  | "invalid-send-at" | "invalid-tags" | "invalid-render" | "render-failed" | "key-reused" | "suppressed"
  | "invalid-event" | "invalid-worker" | "not-found" | "not-cancellable";

export class EmailOutboxError extends Error {
  readonly code: EmailOutboxErrorCode;
  constructor(code: EmailOutboxErrorCode, message: string) {
    super(message);
    this.name = "EmailOutboxError";
    this.code = code;
  }
}

export interface EmailOutbox {
  enqueue(input: EnqueueInput): Promise<EmailMessage>;
  dispatch(input: DispatchInput): Promise<DispatchSummary>;
  handleEvent(event: EmailEvent): Promise<EventResult>;
  cancel(key: string): Promise<EmailMessage>;
  get(key: string): Promise<EmailMessage | null>;
}

const CRLF = /[\r\n]/;
const KEY = /^[\x21-\x7e]{1,255}$/;
const TAG_NAME = /^[A-Za-z0-9_-]{1,256}$/;

/** Pragmatic address check: exactly one @, non-empty parts, no whitespace or control characters, at most 254 characters. */
export function isValidAddress(address: unknown): address is string {
  if (typeof address !== "string" || address.length === 0 || address.length > 254) return false;
  if (CRLF.test(address) || /[\s\x00-\x1f\x7f<>]/.test(address)) return false;
  const parts = address.split("@");
  return parts.length === 2 && parts[0]!.length > 0 && parts[1]!.length > 0 && parts[0]!.length <= 64;
}

/** Lower-cases an address for suppression lookups. */
export const normalizeAddress = (address: string): string => address.trim().toLowerCase();

/** Full-jitter exponential backoff: a uniform delay in [0, min(maxMs, baseMs * 2^(attempt-1))). */
export function fullJitterBackoff(options: BackoffOptions = {}): (attempt: number) => number {
  const base = options.baseMs ?? 30_000;
  const max = options.maxMs ?? 3_600_000;
  const random = options.random ?? Math.random;
  return (attempt) => Math.floor(random() * Math.min(max, base * 2 ** Math.max(0, attempt - 1)));
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new EmailOutboxError("invalid-data", "data must be JSON");
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") throw new EmailOutboxError("invalid-data", "data must be JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const entries = Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined);
  return "{" + entries.map((k) => JSON.stringify(k) + ":" + canonical((value as Record<string, unknown>)[k])).join(",") + "}";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const emptySummary = (): DispatchSummary => ({ claimed: 0, sent: 0, retried: 0, failed: 0, dead: 0, suppressed: 0, lostLease: 0 });
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 1000);

export function createEmailOutbox(options: EmailOutboxOptions): EmailOutbox {
  const { store, transport, templates } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const maxAttempts = options.maxAttempts ?? 6;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new RangeError("maxAttempts must be 1-100");
  if (typeof options.from !== "string" || !options.from.includes("@") || CRLF.test(options.from) || options.from.length > 320) {
    throw new EmailOutboxError("invalid-header", "from must be one header-safe address");
  }
  const backoff = typeof options.backoff === "function" ? options.backoff : fullJitterBackoff(options.backoff);

  async function isSuppressed(address: string): Promise<boolean> {
    const normalized = normalizeAddress(address);
    if (await store.isSuppressed(normalized)) return true;
    return options.suppress ? Boolean(await options.suppress(normalized)) : false;
  }

  function validateTags(tags: unknown): Record<string, string> {
    if (tags === undefined) return {};
    if (!tags || typeof tags !== "object" || Array.isArray(tags)) throw new EmailOutboxError("invalid-tags", "tags must be an object of strings");
    const out: Record<string, string> = {};
    const entries = Object.entries(tags as Record<string, unknown>);
    if (entries.length > 20) throw new EmailOutboxError("invalid-tags", "At most 20 tags");
    for (const [name, value] of entries) {
      if (typeof value !== "string") throw new EmailOutboxError("invalid-tags", "Tag values must be strings");
      if (CRLF.test(name) || CRLF.test(value)) throw new EmailOutboxError("invalid-header", "Tags must not contain CR or LF");
      if (!TAG_NAME.test(name) || value.length > 256) throw new EmailOutboxError("invalid-tags", "Tag names are letters, digits, _ or -; values at most 256 characters");
      out[name] = value;
    }
    return out;
  }

  async function render(template: EmailTemplate, data: unknown): Promise<RenderedEmail> {
    let rendered: RenderedEmail;
    try {
      rendered = await template(data);
    } catch (error) {
      throw new EmailOutboxError("render-failed", "Template failed: " + errorText(error));
    }
    if (!rendered || typeof rendered.subject !== "string" || typeof rendered.text !== "string" ||
      (rendered.html !== undefined && typeof rendered.html !== "string")) {
      throw new EmailOutboxError("invalid-render", "A template returns {subject, text, html?} strings");
    }
    if (CRLF.test(rendered.subject)) throw new EmailOutboxError("invalid-header", "The subject must not contain CR or LF");
    if (rendered.subject.trim().length === 0 || rendered.subject.length > 998) throw new EmailOutboxError("invalid-render", "The subject must be 1-998 characters");
    return rendered;
  }

  return {
    async enqueue(input) {
      if (typeof input?.key !== "string" || !KEY.test(input.key)) throw new EmailOutboxError("invalid-key", "key must be 1-255 visible ASCII characters");
      if (!isValidAddress(input.to)) throw new EmailOutboxError("invalid-address", "to must be one valid email address");
      if (typeof input.template !== "string" || !Object.hasOwn(templates, input.template)) throw new EmailOutboxError("invalid-template", "Unknown template");
      if (input.tenantId !== undefined && (typeof input.tenantId !== "string" || input.tenantId.length === 0 || input.tenantId.length > 128 || CRLF.test(input.tenantId))) {
        throw new EmailOutboxError("invalid-tenant", "tenantId must be 1-128 characters");
      }
      if (input.sendAt !== undefined && (typeof input.sendAt !== "number" || !Number.isSafeInteger(input.sendAt) || input.sendAt < 0)) {
        throw new EmailOutboxError("invalid-send-at", "sendAt must be epoch milliseconds");
      }
      const tags = validateTags(input.tags);
      const fingerprint = await sha256Hex(canonical({
        to: input.to, template: input.template, data: input.data ?? null, tenantId: input.tenantId ?? null,
        sendAt: input.sendAt ?? null, tags,
      }));

      const existing = await store.findByKey(input.key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new EmailOutboxError("key-reused", "This key was used for a different message");
        return existing;
      }
      if (await isSuppressed(input.to)) throw new EmailOutboxError("suppressed", "The recipient is on the suppression list");
      const rendered = await render(templates[input.template]!, input.data);
      const at = now();
      const message: EmailMessage = {
        id: newId(), key: input.key, tenantId: input.tenantId ?? null, to: input.to, subject: rendered.subject, text: rendered.text,
        html: rendered.html ?? null, tags, fingerprint, status: "queued", attempts: 0, nextAttemptAt: input.sendAt ?? at,
        leaseOwner: null, leaseExpiresAt: null, providerId: null, lastError: null, createdAt: at, sentAt: null,
      };
      const stored = await store.insertIfAbsent(message);
      // A concurrent enqueue with the same key won the insert: apply the same reuse rule to its row.
      if (stored.id !== message.id && stored.fingerprint !== fingerprint) throw new EmailOutboxError("key-reused", "This key was used for a different message");
      return stored;
    },

    async dispatch(input) {
      if (typeof input?.workerId !== "string" || !/^[\w.:-]{1,128}$/.test(input.workerId)) throw new EmailOutboxError("invalid-worker", "workerId must be 1-128 word characters");
      const batch = input.batch ?? 20;
      const leaseMs = input.leaseMs ?? 120_000;
      if (!Number.isSafeInteger(batch) || batch < 1 || batch > 500) throw new RangeError("batch must be 1-500");
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000) throw new RangeError("leaseMs must be at least 1000");
      const summary = emptySummary();
      const claimed = await store.claim({ now: now(), limit: batch, workerId: input.workerId, leaseMs });
      summary.claimed = claimed.length;

      for (const message of claimed) {
        const finish = async (patch: CompletePatch, counter: keyof DispatchSummary) => {
          if (await store.complete(message.id, input.workerId, patch)) summary[counter]++;
          else summary.lostLease++;
        };
        // A reclaimed message whose earlier attempts used up the budget (worker crashes) is not sent again.
        if (message.attempts > maxAttempts) { await finish({ status: "dead", lastError: message.lastError ?? "lease expired after the last attempt" }, "dead"); continue; }
        if (await isSuppressed(message.to)) { await finish({ status: "suppressed", lastError: "suppressed" }, "suppressed"); continue; }

        let result: SendResult;
        try {
          result = await transport.send({
            from: options.from, to: message.to, subject: message.subject, text: message.text, html: message.html,
            tags: message.tags, key: message.key, id: message.id,
          }, { idempotencyKey: message.key });
        } catch (error) {
          result = { status: "retryable", error: "network: " + errorText(error) };
        }

        if (result.status === "sent") {
          await finish({ status: "sent", providerId: result.providerId, sentAt: now() }, "sent");
        } else if (result.status === "permanent") {
          await finish({ status: "failed", lastError: result.error }, "failed");
        } else if (message.attempts >= maxAttempts) {
          await finish({ status: "dead", lastError: result.error }, "dead");
        } else {
          const delay = Math.max(backoff(message.attempts), result.retryAfterMs ?? 0);
          await finish({ status: "queued", lastError: result.error, nextAttemptAt: now() + delay }, "retried");
        }
      }
      return summary;
    },

    async handleEvent(event) {
      if (!event || !["delivered", "bounced", "complained"].includes(event.type) || typeof event.providerId !== "string" ||
        event.providerId.length === 0 || event.providerId.length > 256 || typeof event.at !== "number" || !Number.isFinite(event.at)) {
        throw new EmailOutboxError("invalid-event", "Expected {type, providerId, at}");
      }
      const message = await store.findByProviderId(event.providerId);
      if (!message) return { applied: false, message: null };
      if (event.type === "delivered") {
        const updated = await store.transitionByProviderId(event.providerId, ["sent"], "delivered");
        return { applied: updated !== null, message: updated ?? message };
      }
      if (event.type === "bounced" && event.hard !== true) return { applied: false, message };
      const reason = event.type === "complained" ? "complaint" : "hard-bounce";
      await store.suppress(normalizeAddress(message.to), reason, event.at);
      const from: EmailStatus[] = event.type === "bounced" ? ["sent", "delivered"] : ["sent", "delivered", "bounced"];
      const updated = await store.transitionByProviderId(event.providerId, from, event.type);
      return { applied: updated !== null, message: updated ?? message };
    },

    async cancel(key) {
      const cancelled = await store.cancel(key);
      if (cancelled) return cancelled;
      const existing = await store.findByKey(key);
      if (!existing) throw new EmailOutboxError("not-found", "No message with this key");
      throw new EmailOutboxError("not-cancellable", "Only queued messages can be cancelled; status is " + existing.status);
    },

    get: (key) => store.findByKey(key),
  };
}
