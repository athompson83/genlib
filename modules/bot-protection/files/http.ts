// SPDX-License-Identifier: Apache-2.0
// Fetch Request/Response adapters:
//   GET {prefix}/challenge?form=<formId>  -> 200 PowChallenge (cache-control: no-store)
//   protect(handler, guard)               -> runs the guard on POST/PUT/PATCH/DELETE bodies, then your handler
// A refused submission gets 403 {"error":"bot-check-failed"} with no hint of which check failed.
import type { BotCheckResult, BotGuard } from "./guard.js";
import type { Pow } from "./pow.js";

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

export interface ChallengeHandlerOptions {
  readonly pow: Pow;
  readonly prefix: string;
  /** Form ids this endpoint will issue challenges for. Other values get 400. */
  readonly forms: readonly string[];
}

export function createChallengeHandler(options: ChallengeHandlerOptions): (request: Request) => Promise<Response> {
  const path = options.prefix.replace(/\/+$/, "") + "/challenge";
  const forms = new Set(options.forms);
  if (forms.size === 0) throw new TypeError("forms must list at least one form id");
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== path) return json(404, { error: "not-found" });
    if (request.method !== "GET") return json(405, { error: "method-not-allowed" }, { allow: "GET" });
    const form = url.searchParams.get("form") ?? "";
    if (!forms.has(form)) return json(400, { error: "invalid-form" });
    return json(200, await options.pow.issue(form));
  };
}

export interface ProtectOptions {
  /** Largest accepted request body in bytes. Default 65,536. Larger bodies get 413 before the guard runs. */
  readonly maxBodyBytes?: number;
  /** Server-side hook for logging or metrics; receives the stage-prefixed reasons the client never sees. */
  readonly onReject?: (result: BotCheckResult, request: Request) => void | Promise<void>;
}

class BodyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

async function readBounded(request: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > max) throw new BodyError(413, "payload-too-large");
  const out = new Uint8Array(max);
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > max) {
        await reader.cancel().catch(() => undefined);
        throw new BodyError(413, "payload-too-large");
      }
      out.set(value, size);
      size += value.byteLength;
    }
  }
  return out.slice(0, size);
}

/** Parse urlencoded, multipart or JSON bytes into a flat field map. Files become their file name; repeats keep the first. */
export async function parseFormBody(contentType: string, bytes: Uint8Array<ArrayBuffer>): Promise<Record<string, unknown>> {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (type === "application/json") {
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new BodyError(400, "invalid-body"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BodyError(400, "invalid-body");
    for (const [name, field] of Object.entries(value)) fields[name] = field;
    return fields;
  }
  if (type === "application/x-www-form-urlencoded" || type === "multipart/form-data") {
    let data: FormData;
    try { data = await new Response(bytes, { headers: { "content-type": contentType } }).formData(); } catch { throw new BodyError(400, "invalid-body"); }
    for (const [name, field] of data) {
      if (!(name in fields)) fields[name] = typeof field === "string" ? field : (field as File).name;
    }
    return fields;
  }
  throw new BodyError(415, "unsupported-media-type");
}

/**
 * Wrap a Fetch handler so state-changing requests pass the guard first. GET, HEAD and OPTIONS pass straight
 * through. The handler receives a fresh Request with the same body bytes, so it can parse the form itself.
 */
export function protect(
  handler: (request: Request) => Response | Promise<Response>,
  guard: BotGuard,
  options: ProtectOptions = {},
): (request: Request) => Promise<Response> {
  const max = options.maxBodyBytes ?? 65_536;
  if (!Number.isSafeInteger(max) || max < 1) throw new TypeError("maxBodyBytes must be a positive integer");
  return async (request) => {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return handler(request);
    let bytes: Uint8Array<ArrayBuffer>;
    let fields: Record<string, unknown>;
    try {
      bytes = await readBounded(request, max);
      fields = await parseFormBody(request.headers.get("content-type") ?? "", bytes);
    } catch (error) {
      if (error instanceof BodyError) return json(error.status, { error: error.code });
      throw error;
    }
    const result = await guard.check(request, fields);
    if (!result.ok) {
      await options.onReject?.(result, request);
      return json(403, { error: "bot-check-failed" });
    }
    return handler(new Request(request.url, { method: request.method, headers: request.headers, body: bytes }));
  };
}
