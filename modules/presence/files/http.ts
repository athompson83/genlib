// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for presence over Server-Sent Events.
//   GET  {prefix}/stream?tenantId&room&connectionId -> 200 text/event-stream
//        joins on open, sends `event: snapshot`, then join/update/leave events with `id: seq`,
//        a `: ping` comment (and a presence heartbeat) every 15 s, and leaves when the request is aborted.
//   POST {prefix}/heartbeat {tenantId, room, connectionId, state?} -> 200 {expiresAt}
//   POST {prefix}/leave     {tenantId, room, connectionId}         -> 200 {left}
// Long-lived streams need a runtime that keeps the response open (Node 22, Bun, Deno, Workers); serverless
// functions with short timeouts end the stream, and the browser's EventSource reconnects with a fresh snapshot.
import { PresenceError } from "./core.js";
import type { Actor, JsonValue, Presence, PresenceEvent } from "./core.js";

export interface PresenceHttpOptions {
  readonly presence: Presence;
  readonly prefix: string;
  /** Resolve the signed-in user from trusted server context (session cookie, verified JWT). Return null when signed out. */
  readonly authenticate: (request: Request) => Promise<Actor | null>;
  /** Exact allowed origins. POSTs need a matching Origin; a stream request that sends Origin must match too. */
  readonly allowedOrigins: readonly string[];
  /** Largest accepted JSON request body in bytes. Default 8,192. */
  readonly maxRequestBytes?: number;
  /** Interval between keep-alive comments on a stream. Default 15,000 ms. */
  readonly pingMs?: number;
  /** Repeating timer used for keep-alives. Default setInterval. Returns a cancel function. */
  readonly interval?: (fn: () => void, ms: number) => () => void;
}

const STATUS: Record<string, number> = {
  forbidden: 403, "not-owner": 403, "not-found": 404, "room-full": 409, "invalid-tenant": 400, "invalid-room": 400,
  "invalid-connection": 400, "invalid-state": 400, "state-too-large": 413, "bad-request": 400, "too-large": 413,
};

const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });
const text = (value: unknown): string => (typeof value === "string" ? value : "");

function defaultInterval(fn: () => void, ms: number): () => void {
  const handle = setInterval(fn, ms) as unknown as { unref?: () => void };
  handle.unref?.();
  return () => clearInterval(handle as unknown as ReturnType<typeof setInterval>);
}

class TooLarge extends Error {}

async function readBounded(request: Request, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) throw new TooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(all);
}

export function createPresenceHandler(options: PresenceHttpOptions): (request: Request) => Promise<Response> {
  const prefix = options.prefix.replace(/\/+$/, "");
  const origins = new Set(options.allowedOrigins);
  const maxRequest = options.maxRequestBytes ?? 8192;
  const pingMs = options.pingMs ?? 15_000;
  const interval = options.interval ?? defaultInterval;
  const { presence } = options;

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new PresenceError("bad-request", "Expected application/json");
    const raw = await readBounded(request, maxRequest);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PresenceError("bad-request", "Expected a JSON object");
    return value as Record<string, unknown>;
  }

  async function stream(request: Request, user: Actor, url: URL): Promise<Response> {
    const ref = {
      tenantId: url.searchParams.get("tenantId") ?? "",
      room: url.searchParams.get("room") ?? "",
      connectionId: url.searchParams.get("connectionId") ?? "",
    };
    // Subscribe before joining so no event between the join and the snapshot is lost; buffer until the snapshot.
    const buffered: PresenceEvent[] = [];
    let deliver: ((event: PresenceEvent) => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let joined = false;
    try {
      unsubscribe = presence.subscribe(ref.tenantId, ref.room, (event) => { if (deliver) deliver(event); else buffered.push(event); });
      await presence.join(user, ref);
      joined = true;
      const snapshot = await presence.list(user, ref);
      const encoder = new TextEncoder();
      let closed = false;
      let stopPing: (() => void) | null = null;
      let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        stopPing?.();
        unsubscribe?.();
        request.signal.removeEventListener("abort", onAbort);
        void presence.leave(user, ref).catch(() => undefined);
        try { controllerRef?.close(); } catch { /* already closed */ }
      };
      const onAbort = (): void => cleanup();
      const send = (chunk: string): void => {
        if (closed || !controllerRef) return;
        try { controllerRef.enqueue(encoder.encode(chunk)); } catch { cleanup(); }
      };
      const sendEvent = (event: PresenceEvent): void => {
        if (event.seq <= snapshot.seq) return;
        send(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controllerRef = controller;
          send("retry: 3000\n");
          send(`id: ${snapshot.seq}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
          for (const event of buffered.splice(0)) sendEvent(event);
          deliver = sendEvent;
          stopPing = interval(() => {
            send(": ping\n\n");
            void presence.heartbeat(user, ref).catch(() => undefined);
          }, pingMs);
          if (request.signal.aborted) cleanup();
          else request.signal.addEventListener("abort", onAbort, { once: true });
        },
        cancel() { cleanup(); },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
      });
    } catch (error) {
      unsubscribe?.();
      if (joined) await presence.leave(user, ref).catch(() => undefined);
      throw error;
    }
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const route = url.pathname.slice(prefix.length);
    try {
      const origin = request.headers.get("origin");
      if (request.method === "POST" ? !origins.has(origin ?? "") : origin !== null && !origins.has(origin)) {
        return json(403, { error: "forbidden", message: "Origin not allowed" });
      }
      if (route !== "/stream" && route !== "/heartbeat" && route !== "/leave") return json(404, { error: "not-found" });
      const expected = route === "/stream" ? "GET" : "POST";
      if (request.method !== expected) return new Response(JSON.stringify({ error: "method-not-allowed" }), { status: 405, headers: { ...HEADERS, allow: expected } });
      const user = await options.authenticate(request);
      if (!user) return json(401, { error: "unauthenticated" });
      if (route === "/stream") return await stream(request, user, url);
      const body = await readBody(request);
      const ref = { tenantId: text(body.tenantId), room: text(body.room), connectionId: text(body.connectionId) };
      if (route === "/heartbeat") {
        const connection = await presence.heartbeat(user, { ...ref, ...("state" in body ? { state: body.state as JsonValue } : {}) });
        return json(200, { expiresAt: connection.expiresAt });
      }
      return json(200, await presence.leave(user, ref));
    } catch (error) {
      if (error instanceof PresenceError) return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
      if (error instanceof TooLarge) return json(413, { error: "too-large", message: "Request body too large" });
      if (error instanceof SyntaxError) return json(400, { error: "invalid-json" });
      throw error;
    }
  };
}
