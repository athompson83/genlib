// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for webhook endpoint management. Mount it under one prefix with your
// framework's catch-all route. authenticate(request) returns the signed-in actor (or null for 401); every operation
// then goes through the core's authorize(actor, tenantId, action), so the tenant in the path is never trusted alone.
//   GET    {prefix}/{tenant}/endpoints                      -> 200 {endpoints}
//   POST   {prefix}/{tenant}/endpoints                      -> 201 {endpoint, secret}   (secret shown once)
//   GET    {prefix}/{tenant}/endpoints/{id}                 -> 200 endpoint
//   PATCH  {prefix}/{tenant}/endpoints/{id}                 -> 200 endpoint
//   DELETE {prefix}/{tenant}/endpoints/{id}                 -> 204
//   POST   {prefix}/{tenant}/endpoints/{id}/rotate-secret   -> 200 {endpoint, secret}   (secret shown once)
//   GET    {prefix}/{tenant}/deliveries?status=&endpointId=&limit=  -> 200 {deliveries}
//   GET    {prefix}/{tenant}/deliveries/{id}                -> 200 delivery
//   GET    {prefix}/{tenant}/deliveries/{id}/attempts       -> 200 {attempts}
//   POST   {prefix}/{tenant}/deliveries/{id}/replay         -> 200 delivery
// Mutations require an Origin in allowedOrigins. Responses carry cache-control: no-store.
import { WebhookDeliveryError, type DeliveryStatus, type WebhookDelivery } from "./core.js";

export interface WebhookEndpointsHttpOptions {
  readonly delivery: WebhookDelivery<never> | WebhookDelivery<unknown>;
  readonly prefix: string;
  readonly allowedOrigins: readonly string[];
  /** The signed-in actor from your session; null or undefined responds 401. */
  readonly authenticate: (request: Request) => unknown | Promise<unknown>;
  /** Largest accepted JSON body in bytes. Default 16,384. */
  readonly maxRequestBytes?: number;
}

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });

const STATUS: Record<WebhookDeliveryError["code"], number> = {
  "forbidden": 403, "not-found": 404, "invalid-url": 400, "bad-request": 400, "payload-too-large": 413,
  "conflict": 409, "not-replayable": 409, "limit-exceeded": 409,
};

class BodyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function readJson(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new BodyError(400, "Expected application/json");
  if (Number(request.headers.get("content-length") ?? "0") > limit) throw new BodyError(413, "Body too large");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel().catch(() => undefined); throw new BodyError(413, "Body too large"); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BodyError(400, "invalid-json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BodyError(400, "Expected a JSON object");
  return value as Record<string, unknown>;
}

export function createWebhookEndpointsHandler(options: WebhookEndpointsHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const limit = options.maxRequestBytes ?? 16_384;
  const delivery = options.delivery as WebhookDelivery<unknown>;

  return async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    let parts: string[];
    try {
      parts = url.pathname.slice(prefix.length + 1).split("/").map(decodeURIComponent);
    } catch {
      return json(400, { error: "bad-request" });
    }
    const [tenantId = "", collection, id, action, ...extra] = parts;
    if (extra.length > 0 || !tenantId || (collection !== "endpoints" && collection !== "deliveries")) return json(404, { error: "not-found" });
    const method = request.method;
    const allowed = collection === "endpoints"
      ? (id === undefined ? ["GET", "POST"] : action === undefined ? ["GET", "PATCH", "DELETE"] : action === "rotate-secret" ? ["POST"] : [])
      : (id === undefined ? ["GET"] : action === undefined ? ["GET"] : action === "attempts" ? ["GET"] : action === "replay" ? ["POST"] : []);
    if (allowed.length === 0) return json(404, { error: "not-found" });
    if (!allowed.includes(method)) return json(405, { error: "method-not-allowed" });

    const actor = await options.authenticate(request);
    if (actor === null || actor === undefined) return json(401, { error: "unauthenticated" });
    if (method !== "GET" && !origins.has(request.headers.get("origin") ?? "")) return json(403, { error: "forbidden", message: "Origin not allowed" });

    try {
      if (collection === "endpoints") {
        if (id === undefined) {
          if (method === "GET") return json(200, { endpoints: await delivery.listEndpoints(actor, tenantId) });
          const body = await readJson(request, limit);
          const created = await delivery.createEndpoint(actor, tenantId, body as never);
          return json(201, created);
        }
        if (action === "rotate-secret") {
          const graceMs = url.searchParams.get("graceMs");
          return json(200, await delivery.rotateSecret(actor, tenantId, id, graceMs === null ? {} : { graceMs: Number(graceMs) }));
        }
        if (method === "GET") return json(200, await delivery.getEndpoint(actor, tenantId, id));
        if (method === "DELETE") {
          await delivery.deleteEndpoint(actor, tenantId, id);
          return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
        }
        const body = await readJson(request, limit);
        return json(200, await delivery.updateEndpoint(actor, tenantId, id, body as never));
      }
      if (id === undefined) {
        const filter: { status?: DeliveryStatus; endpointId?: string; limit?: number } = {};
        const status = url.searchParams.get("status");
        const endpointId = url.searchParams.get("endpointId");
        const max = url.searchParams.get("limit");
        if (status !== null) filter.status = status as DeliveryStatus;
        if (endpointId !== null) filter.endpointId = endpointId;
        if (max !== null) filter.limit = Number(max);
        return json(200, { deliveries: await delivery.listDeliveries(actor, tenantId, filter) });
      }
      if (action === "attempts") return json(200, { attempts: await delivery.listAttempts(actor, tenantId, id) });
      if (action === "replay") return json(200, await delivery.replay(actor, tenantId, id));
      return json(200, await delivery.getDelivery(actor, tenantId, id));
    } catch (error) {
      if (error instanceof WebhookDeliveryError) return json(STATUS[error.code], { error: error.code, message: error.message });
      if (error instanceof BodyError) return json(error.status, { error: error.status === 413 ? "payload-too-large" : "bad-request", message: error.message });
      if (error instanceof RangeError) return json(400, { error: "bad-request", message: error.message });
      throw error;
    }
  };
}
