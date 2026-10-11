// SPDX-License-Identifier: Apache-2.0
// Server-side Web Push: store browser subscriptions per user and deliver encrypted messages to push services
// with VAPID. Web Crypto and Fetch only; the store and fetch are injected.
import {
  MAX_PAYLOAD_BYTES, base64UrlDecode, createVapidJwt, encryptPushPayload, importUserAgentKey, importVapidSigningKey,
  isVapidSubject, vapidAuthorization,
} from "./crypto.js";

export type WebPushErrorCode =
  | "invalid-user" | "invalid-subscription" | "invalid-endpoint" | "endpoint-not-allowed" | "invalid-keys"
  | "invalid-ttl" | "invalid-urgency" | "invalid-topic" | "payload-too-large" | "invalid-vapid" | "invalid-concurrency"
  | "bad-request";

export class WebPushError extends Error {
  readonly code: WebPushErrorCode;
  constructor(code: WebPushErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "WebPushError";
  }
}

export interface PushSubscriptionRecord {
  readonly endpoint: string;
  readonly userId: string;
  /** base64url 65-octet P-256 public key from the browser. */
  readonly p256dh: string;
  /** base64url 16-octet authentication secret from the browser. */
  readonly auth: string;
  readonly createdAt: number;
  readonly lastSuccessAt: number | null;
  readonly failureCount: number;
}

export interface PushSubscriptionStore {
  /** Inserts or replaces by endpoint (keeps createdAt, resets failureCount) and returns the stored row. */
  upsert(subscription: Omit<PushSubscriptionRecord, "lastSuccessAt" | "failureCount">): Promise<PushSubscriptionRecord>;
  listByUser(userId: string): Promise<PushSubscriptionRecord[]>;
  /** Deletes the endpoint (only when it belongs to userId, if given). True when this call removed a row. */
  remove(endpoint: string, userId?: string): Promise<boolean>;
  recordSuccess(endpoint: string, at: number): Promise<void>;
  /** Atomically increments failure_count; returns the new count, or null when the row is gone. */
  recordFailure(endpoint: string): Promise<number | null>;
}

export type Urgency = "very-low" | "low" | "normal" | "high";

export interface SendOptions {
  /** Seconds the push service may hold the message, 0 to 2,419,200 (28 days). Required. */
  readonly ttl: number;
  readonly urgency?: Urgency;
  /** Replaces an undelivered message with the same topic: 1 to 32 base64url characters. */
  readonly topic?: string;
}

export type DeliveryOutcome =
  | "sent" | "gone" | "too-large" | "rate-limited" | "vapid-error" | "server-error" | "rejected" | "network-error";

export interface DeliveryResult {
  readonly userId: string;
  readonly endpoint: string;
  readonly ok: boolean;
  readonly outcome: DeliveryOutcome;
  /** Push service HTTP status; absent on network errors. */
  readonly status?: number;
  /** Seconds to wait before retrying, from Retry-After on 429 (or 503). */
  readonly retryAfterSeconds?: number;
  /** True when the subscription was deleted (404/410). */
  readonly removed: boolean;
}

export interface WebPushOptions {
  readonly vapid: { readonly publicKey: string; readonly privateKey: string; readonly subject: string };
  readonly store: PushSubscriptionStore;
  readonly fetch: typeof fetch;
  /** Milliseconds clock. Default Date.now. */
  readonly now?: () => number;
  /**
   * Hosts subscription endpoints may use. An entry starting with "." matches subdomains.
   * Default DEFAULT_PUSH_SERVICE_HOSTS (Chrome/Edge FCM, Firefox autopush, Safari/Apple, Windows WNS).
   */
  readonly allowedHosts?: readonly string[];
  /** Accept any https endpoint (self-hosted or unlisted push services). Default false. */
  readonly allowAnyHttpsEndpoint?: boolean;
  /** Parallel push requests in send and sendMany. Default 8, 1 to 64. */
  readonly concurrency?: number;
  /** VAPID JWT lifetime in seconds, 60 to 86,400. Default 43,200. */
  readonly vapidTtlSeconds?: number;
  /** Most subscriptions one user may hold; older ones are not evicted, new ones are refused. Default 20. */
  readonly maxSubscriptionsPerUser?: number;
}

export interface WebPush {
  readonly vapidPublicKey: string;
  subscribe(userId: string, subscription: unknown): Promise<PushSubscriptionRecord>;
  unsubscribe(endpoint: string, userId?: string): Promise<boolean>;
  send(userId: string, payload: PushPayload, options: SendOptions): Promise<DeliveryResult[]>;
  sendMany(userIds: readonly string[], payload: PushPayload, options: SendOptions): Promise<DeliveryResult[]>;
}

/** A string or bytes is sent as is; any other value is sent as JSON. */
export type PushPayload = string | Uint8Array | Record<string, unknown> | readonly unknown[];

export const DEFAULT_PUSH_SERVICE_HOSTS: readonly string[] = [
  "fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com",
  "web.push.apple.com", ".push.apple.com", ".notify.windows.com",
];

const URGENCIES: readonly string[] = ["very-low", "low", "normal", "high"];
const TOPIC = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_TTL = 2_419_200;
const encoder = new TextEncoder();

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => (entry.startsWith(".") ? host.endsWith(entry) && host.length > entry.length : host === entry));
}

function validateSendOptions(options: SendOptions): void {
  if (!Number.isInteger(options.ttl) || options.ttl < 0 || options.ttl > MAX_TTL) throw new WebPushError("invalid-ttl", `ttl must be a whole number of seconds, 0 to ${MAX_TTL}`);
  if (options.urgency !== undefined && !URGENCIES.includes(options.urgency)) throw new WebPushError("invalid-urgency", "urgency must be very-low, low, normal or high");
  if (options.topic !== undefined && !TOPIC.test(options.topic)) throw new WebPushError("invalid-topic", "topic must be 1 to 32 base64url characters");
}

function encodePayload(payload: PushPayload): Uint8Array {
  const bytes = typeof payload === "string" ? encoder.encode(payload) : payload instanceof Uint8Array ? payload : encoder.encode(JSON.stringify(payload));
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new WebPushError("payload-too-large", `Payload is ${bytes.length} bytes; the limit is ${MAX_PAYLOAD_BYTES}`);
  return bytes;
}

/** Parses Retry-After (delta seconds or HTTP date) into whole seconds from now. */
function retryAfter(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  if (/^\d{1,10}$/.test(header.trim())) return Number(header.trim());
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

async function pool<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createWebPush(options: WebPushOptions): WebPush {
  const { store } = options;
  const now = options.now ?? Date.now;
  const allowedHosts = options.allowedHosts ?? DEFAULT_PUSH_SERVICE_HOSTS;
  const concurrency = options.concurrency ?? 8;
  const maxPerUser = options.maxSubscriptionsPerUser ?? 20;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new WebPushError("invalid-concurrency", "concurrency must be 1 to 64");
  if (!isVapidSubject(options.vapid.subject)) throw new WebPushError("invalid-vapid", "VAPID subject must be a mailto: or https: contact");
  let signingKey: Promise<CryptoKey> | undefined;
  const key = () => {
    signingKey ??= importVapidSigningKey(options.vapid).catch((error: unknown) => {
      signingKey = undefined;
      throw new WebPushError("invalid-vapid", `VAPID keys could not be imported: ${error instanceof Error ? error.message : String(error)}`);
    });
    return signingKey;
  };

  function checkEndpoint(endpoint: unknown): string {
    if (typeof endpoint !== "string" || endpoint.length > 2048) throw new WebPushError("invalid-endpoint", "endpoint must be an https URL");
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new WebPushError("invalid-endpoint", "endpoint must be an https URL");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new WebPushError("invalid-endpoint", "endpoint must be an https URL without credentials or fragment");
    if (!options.allowAnyHttpsEndpoint && !hostAllowed(url.hostname.toLowerCase(), allowedHosts)) {
      throw new WebPushError("endpoint-not-allowed", `Push service host ${url.hostname} is not allowed`);
    }
    return endpoint;
  }

  async function deliver(subscription: PushSubscriptionRecord, plaintext: Uint8Array, send: SendOptions): Promise<DeliveryResult> {
    const base = { userId: subscription.userId, endpoint: subscription.endpoint };
    const body = await encryptPushPayload(plaintext, base64UrlDecode(subscription.p256dh), base64UrlDecode(subscription.auth));
    const jwt = await createVapidJwt(await key(), {
      audience: new URL(subscription.endpoint).origin, subject: options.vapid.subject, now: now(),
      ...(options.vapidTtlSeconds === undefined ? {} : { ttlSeconds: options.vapidTtlSeconds }),
    });
    const headers: Record<string, string> = {
      "content-type": "application/octet-stream", "content-encoding": "aes128gcm", ttl: String(send.ttl),
      urgency: send.urgency ?? "normal", authorization: vapidAuthorization(jwt, options.vapid.publicKey),
    };
    if (send.topic !== undefined) headers.topic = send.topic;
    let response: Response;
    try {
      response = await options.fetch(subscription.endpoint, { method: "POST", headers, body, redirect: "manual" });
    } catch {
      await store.recordFailure(subscription.endpoint);
      return { ...base, ok: false, outcome: "network-error", removed: false };
    }
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (status === 201 || status === 202) {
      await store.recordSuccess(subscription.endpoint, now());
      return { ...base, ok: true, outcome: "sent", status, removed: false };
    }
    if (status === 404 || status === 410) {
      return { ...base, ok: false, outcome: "gone", status, removed: await store.remove(subscription.endpoint) };
    }
    await store.recordFailure(subscription.endpoint);
    const wait = retryAfter(response.headers.get("retry-after"), now());
    const retry = wait === undefined ? {} : { retryAfterSeconds: wait };
    if (status === 413) return { ...base, ok: false, outcome: "too-large", status, removed: false };
    if (status === 429) return { ...base, ok: false, outcome: "rate-limited", status, removed: false, ...retry };
    if (status === 400 || status === 401 || status === 403) return { ...base, ok: false, outcome: "vapid-error", status, removed: false };
    if (status >= 500) return { ...base, ok: false, outcome: "server-error", status, removed: false, ...retry };
    return { ...base, ok: false, outcome: "rejected", status, removed: false };
  }

  async function deliverAll(subscriptions: readonly PushSubscriptionRecord[], payload: PushPayload, send: SendOptions) {
    validateSendOptions(send);
    const plaintext = encodePayload(payload);
    await key();
    return pool(subscriptions, concurrency, (subscription) => deliver(subscription, plaintext, send));
  }

  const checkUser = (userId: unknown): string => {
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 256) throw new WebPushError("invalid-user", "userId must be a non-empty string");
    return userId;
  };

  return {
    vapidPublicKey: options.vapid.publicKey,

    async subscribe(userId, subscription) {
      checkUser(userId);
      if (!subscription || typeof subscription !== "object") throw new WebPushError("invalid-subscription", "Expected {endpoint, keys: {p256dh, auth}}");
      const record = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
      const endpoint = checkEndpoint(record.endpoint);
      const keys = record.keys;
      if (!keys || typeof keys !== "object" || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
        throw new WebPushError("invalid-keys", "keys.p256dh and keys.auth are required");
      }
      try {
        const p256dh = base64UrlDecode(keys.p256dh);
        const auth = base64UrlDecode(keys.auth);
        if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) throw new TypeError("length");
        await importUserAgentKey(p256dh); // rejects points that are not on P-256
      } catch {
        throw new WebPushError("invalid-keys", "p256dh must be a 65-octet P-256 public key and auth 16 octets, base64url");
      }
      const existing = await store.listByUser(userId);
      if (!existing.some((item) => item.endpoint === endpoint) && existing.length >= maxPerUser) {
        throw new WebPushError("invalid-subscription", `A user may hold at most ${maxPerUser} subscriptions`);
      }
      return store.upsert({ endpoint, userId, p256dh: keys.p256dh.replace(/=+$/, ""), auth: keys.auth.replace(/=+$/, ""), createdAt: now() });
    },

    async unsubscribe(endpoint, userId) {
      if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) throw new WebPushError("invalid-endpoint", "endpoint is required");
      return store.remove(endpoint, userId);
    },

    async send(userId, payload, send) {
      checkUser(userId);
      validateSendOptions(send);
      encodePayload(payload);
      return deliverAll(await store.listByUser(userId), payload, send);
    },

    async sendMany(userIds, payload, send) {
      userIds.forEach(checkUser);
      validateSendOptions(send);
      encodePayload(payload);
      const lists = await pool([...new Set(userIds)], concurrency, (userId) => store.listByUser(userId));
      return deliverAll(lists.flat(), payload, send);
    },
  };
}
