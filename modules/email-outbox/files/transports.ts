// SPDX-License-Identifier: Apache-2.0
// Fetch transports for email-outbox. Server only: they hold provider API keys. `fetch` is injected so tests and
// edge runtimes choose their own; nothing is sent at import time.
//
// Classification: 2xx -> sent; 408, 409, 429 and 5xx -> retryable (Retry-After honoured); other 4xx -> permanent.
// A network error or timeout is retryable. It may be uncertain (the provider may have accepted the request before
// the connection failed), so the outbox retries with the SAME idempotency key (the message key):
//   - Resend receives it as the `Idempotency-Key` header and returns the original result for a repeated key
//     within its retention window (24 hours at the time of writing), so the retry does not send twice.
//   - Postmark has no idempotency header. The key is sent as Metadata.idempotency_key for reconciliation, and an
//     uncertain Postmark send can produce a duplicate email. Prefer short timeouts and alert on duplicates.
import type { EmailTransport, OutgoingEmail, SendResult } from "./core.js";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpTransportOptions {
  readonly apiKey: string;
  readonly fetch?: FetchLike;
  /** Per-request timeout in ms (AbortSignal.timeout). Default 10,000. */
  readonly timeoutMs?: number;
}

export interface PostmarkTransportOptions extends HttpTransportOptions {
  /** Postmark message stream, for example "outbound". */
  readonly messageStream?: string;
}

export const RESEND_URL = "https://api.resend.com/emails";
export const POSTMARK_URL = "https://api.postmarkapp.com/email";

/** Maps an HTTP status to retryable/permanent; callers handle 2xx themselves. */
export function classifyStatus(status: number, detail: string, retryAfter: string | null): SendResult {
  const error = `http ${status}${detail ? ": " + detail.slice(0, 300) : ""}`;
  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    const seconds = retryAfter !== null && /^\d{1,6}$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : undefined;
    return seconds === undefined ? { status: "retryable", error } : { status: "retryable", error, retryAfterMs: seconds * 1000 };
  }
  return { status: "permanent", error };
}

async function post(options: HttpTransportOptions, url: string, headers: Record<string, string>, body: unknown):
  Promise<{ response: Response; json: Record<string, unknown> | null; text: string } | SendResult> {
  const doFetch = options.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      redirect: "error",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { status: "retryable", error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network: " + (error instanceof Error ? error.message : String(error)) };
  }
  let text = "";
  try { text = await response.text(); } catch { /* body unreadable: classify by status */ }
  let json: Record<string, unknown> | null = null;
  try { const value: unknown = JSON.parse(text); if (value && typeof value === "object") json = value as Record<string, unknown>; } catch { /* not JSON */ }
  return { response, json, text };
}

function requireKey(apiKey: unknown): void {
  if (typeof apiKey !== "string" || apiKey.length === 0 || /[\r\n]/.test(apiKey)) throw new TypeError("apiKey is required");
}

/** Resend: POST https://api.resend.com/emails with Bearer auth and the Idempotency-Key header. */
export function createResendTransport(options: HttpTransportOptions): EmailTransport {
  requireKey(options.apiKey);
  return {
    async send(message: OutgoingEmail, { idempotencyKey }) {
      const result = await post(options, RESEND_URL, { authorization: `Bearer ${options.apiKey}`, "idempotency-key": idempotencyKey }, {
        from: message.from, to: [message.to], subject: message.subject, text: message.text,
        ...(message.html === null ? {} : { html: message.html }),
        tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })),
      });
      if ("status" in result) return result;
      const { response, json, text } = result;
      if (response.ok) {
        const id = json?.id;
        // Accepted but no id: uncertain, so retry under the same idempotency key.
        return typeof id === "string" && id ? { status: "sent", providerId: id } : { status: "retryable", error: "accepted without an id" };
      }
      return classifyStatus(response.status, typeof json?.message === "string" ? json.message : text, response.headers.get("retry-after"));
    },
  };
}

/** Postmark: POST https://api.postmarkapp.com/email with X-Postmark-Server-Token. No idempotency header exists. */
export function createPostmarkTransport(options: PostmarkTransportOptions): EmailTransport {
  requireKey(options.apiKey);
  return {
    async send(message: OutgoingEmail, { idempotencyKey }) {
      const tagEntries = Object.entries(message.tags);
      const result = await post(options, POSTMARK_URL, { "x-postmark-server-token": options.apiKey }, {
        From: message.from, To: message.to, Subject: message.subject, TextBody: message.text,
        ...(message.html === null ? {} : { HtmlBody: message.html }),
        ...(tagEntries.length > 0 ? { Tag: tagEntries[0]![1] } : {}),
        Metadata: { ...message.tags, idempotency_key: idempotencyKey },
        ...(options.messageStream ? { MessageStream: options.messageStream } : {}),
      });
      if ("status" in result) return result;
      const { response, json, text } = result;
      if (response.ok) {
        const id = json?.MessageID;
        if (typeof id === "string" && id && (json?.ErrorCode === undefined || json.ErrorCode === 0)) return { status: "sent", providerId: id };
        return { status: "retryable", error: "accepted without a MessageID" };
      }
      return classifyStatus(response.status, typeof json?.Message === "string" ? json.Message : text, response.headers.get("retry-after"));
    },
  };
}

/** Development transport: logs the message and returns a fake provider id. Never use it in production. */
export function createConsoleTransport(options: { log?: (line: string) => void; newId?: () => string } = {}): EmailTransport {
  const log = options.log ?? ((line: string) => console.log(line));
  const newId = options.newId ?? (() => crypto.randomUUID());
  return {
    async send(message, { idempotencyKey }) {
      const providerId = "console-" + newId();
      log(`[email-outbox] ${providerId} key=${idempotencyKey} to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
      return { status: "sent", providerId };
    },
  };
}
