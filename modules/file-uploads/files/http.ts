// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response adapter for file uploads. Mount it under one path prefix with your framework's
// catch-all route (Next.js route handler, Hono, Remix, Workers, Node 22 fetch servers).
//   POST   {prefix}/tenants/{tenantId}/files?filename=<name>   raw file bytes as the body, Content-Type = file type
//          -> 201 {id, filename, contentType, size, status: "quarantined", createdAt}
//   GET    {prefix}/files/{id}   -> 200 bytes as an attachment (clean files only), 409 while quarantined
//   DELETE {prefix}/files/{id}   -> 204
// The body is the file itself, not multipart/form-data, so the size limit can be enforced while streaming. Errors are
// JSON {error: code}: 400 bad-request/invalid-name, 401 unauthenticated, 403 forbidden/bad-origin, 404 not-found, 409 quarantined,
// 410 infected, 413 too-large/quota-exceeded, 415 unsupported-type/type-mismatch.
import { FileUploadError } from "./core.js";
import type { FileUploadErrorCode, FileUploads, UploadRecord } from "./core.js";

export interface FileUploadHttpOptions<User> {
  readonly uploads: FileUploads<User>;
  readonly prefix: string;
  /** The signed-in user from your session, or null. Return null for anonymous requests. */
  readonly authenticate: (request: Request) => User | null | Promise<User | null>;
  /** Exact allowed origins; POST and DELETE without a matching Origin header are refused. */
  readonly allowedOrigins: readonly string[];
  /** Server-side observer for unexpected errors (they reach the client only as 500 internal). */
  readonly onError?: (error: unknown) => void;
}

const BASE_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "content-type": "application/json" } });

const STATUS: Record<FileUploadErrorCode, number> = {
  "bad-request": 400, "invalid-name": 400, forbidden: 403, "not-found": 404, quarantined: 409, infected: 410, "too-large": 413,
  "quota-exceeded": 413, "unsupported-type": 415, "type-mismatch": 415, "scan-failed": 503,
};
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Characters RFC 8187 attr-char allows unencoded; encodeURIComponent leaves ' ( ) * which it does not. */
function encodeRfc8187(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * RFC 6266 Content-Disposition for a download: always `attachment`, an ASCII fallback `filename` with quotes,
 * backslashes, controls and non-ASCII replaced by "_", and the exact UTF-8 name in `filename*`.
 */
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, "_") || "file";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc8187(filename)}`;
}

/** Headers for serving a stored upload: attachment, nosniff, the stored detected type and a sandboxing CSP. */
export function servingHeaders(record: UploadRecord): Record<string, string> {
  return {
    "content-type": record.contentType === "text/plain" ? "text/plain; charset=utf-8" : record.contentType,
    "content-length": String(record.size),
    "content-disposition": contentDisposition(record.filename),
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  };
}

const publicView = (record: UploadRecord) => ({
  id: record.id, filename: record.filename, contentType: record.contentType, size: record.size, status: record.status, createdAt: record.createdAt,
});

async function cancelBody(request: Request): Promise<void> {
  try {
    if (request.body && !request.body.locked) await request.body.cancel();
  } catch {
    // Already closed.
  }
}

export function createFileUploadHandler<User>(options: FileUploadHttpOptions<User>) {
  const prefix = options.prefix.replace(/\/+$/, "");
  if (!prefix.startsWith("/")) throw new RangeError("prefix must start with /");
  const origins = new Set(options.allowedOrigins);

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix + "/")) return json(404, { error: "not-found" });
    const parts = url.pathname.slice(prefix.length + 1).split("/");
    const method = request.method.toUpperCase();
    const upload = parts.length === 3 && parts[0] === "tenants" && parts[2] === "files";
    const file = parts.length === 2 && parts[0] === "files";
    if (!upload && !file) { await cancelBody(request); return json(404, { error: "not-found" }); }
    if ((upload && method !== "POST") || (file && method !== "GET" && method !== "DELETE")) {
      await cancelBody(request);
      return json(405, { error: "method-not-allowed" });
    }
    if (method !== "GET" && !origins.has(request.headers.get("origin") ?? "")) {
      await cancelBody(request);
      return json(403, { error: "bad-origin" });
    }
    try {
      const user = await options.authenticate(request);
      if (user === null || user === undefined) { await cancelBody(request); return json(401, { error: "unauthenticated" }); }
      if (upload) {
        const tenantId = parts[1] ?? "";
        const lengthHeader = request.headers.get("content-length");
        if (lengthHeader !== null && !/^\d{1,15}$/.test(lengthHeader)) { await cancelBody(request); return json(400, { error: "bad-request" }); }
        const record = await options.uploads.upload({
          user, tenantId, filename: url.searchParams.get("filename") ?? "",
          declaredType: request.headers.get("content-type"),
          contentLength: lengthHeader === null ? null : Number(lengthHeader),
          body: request.body,
        });
        return json(201, publicView(record));
      }
      const id = parts[1] ?? "";
      if (!ID.test(id)) return json(404, { error: "not-found" });
      if (method === "DELETE") {
        await options.uploads.remove(user, id);
        return new Response(null, { status: 204, headers: BASE_HEADERS });
      }
      const { record, bytes } = await options.uploads.download(user, id);
      return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: servingHeaders(record) });
    } catch (error) {
      await cancelBody(request);
      if (error instanceof FileUploadError) return json(STATUS[error.code], { error: error.code });
      options.onError?.(error);
      return json(500, { error: "internal" });
    }
  };
}
