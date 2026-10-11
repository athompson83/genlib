// SPDX-License-Identifier: Apache-2.0
// Webhook adapter for delivery events: POST only, raw body read with a size limit, signature checked by the injected
// `verify` BEFORE parsing, then Resend-style events mapped to outbox.handleEvent:
//   email.delivered -> delivered; email.bounced -> bounced (hard unless data.bounce.type says transient/soft);
//   email.complained -> complained. Other event types are acknowledged and ignored.
// Responses: 200 {applied} or {ignored}; 400 invalid-signature / invalid-json / invalid-event; 405; 413.
// Webhooks are server-to-server, so there is no Origin check; the signature is the authentication.
import { EmailOutboxError } from "./core.js";
import type { EmailEvent, EmailOutbox } from "./core.js";

export interface EmailEventsHandlerOptions {
  readonly outbox: EmailOutbox;
  /** Verify the provider signature over the exact raw body (see the webhook-verification module). */
  readonly verify: (request: Request, rawBody: string) => boolean | Promise<boolean>;
  /** Largest accepted body in bytes. Default 262,144. */
  readonly maxRequestBytes?: number;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const TYPES: Record<string, EmailEvent["type"]> = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained" };

async function readLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createEmailEventsHandler(options: EmailEventsHandlerOptions): (request: Request) => Promise<Response> {
  const max = options.maxRequestBytes ?? 262_144;
  return async (request) => {
    if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
    const raw = await readLimited(request, max);
    if (raw === null) return json(413, { error: "too-large" });
    if (!(await options.verify(request, raw))) return json(400, { error: "invalid-signature" });
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return json(400, { error: "invalid-json" }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json(400, { error: "invalid-json" });
    const body = payload as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> };
    const type = typeof body.type === "string" ? TYPES[body.type] : undefined;
    if (!type) return json(200, { ignored: true });
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const providerId = data.email_id;
    const when = typeof data.created_at === "string" ? data.created_at : body.created_at;
    const at = typeof when === "string" ? Date.parse(when) : Number.NaN;
    if (typeof providerId !== "string" || !Number.isFinite(at)) return json(400, { error: "invalid-event" });
    const bounce = data.bounce && typeof data.bounce === "object" ? (data.bounce as Record<string, unknown>) : {};
    const hard = type === "bounced" ? !/transient|soft|temporary/i.test(String(bounce.type ?? "")) : undefined;
    try {
      const result = await options.outbox.handleEvent({ type, providerId, at, ...(hard === undefined ? {} : { hard }) });
      return json(200, { applied: result.applied, known: result.message !== null });
    } catch (error) {
      if (error instanceof EmailOutboxError) return json(400, { error: error.code });
      throw error;
    }
  };
}
