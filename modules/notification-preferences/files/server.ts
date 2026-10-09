// SPDX-License-Identifier: Apache-2.0
// Server-only entry point. Do not import from browser components.
import {
  createPreferenceSchema,
  defaultPreferences,
  preferencesEqual,
  PreferencesValidationError,
  validateSnapshot,
} from "./core.js";
import type { NotificationPreferences, PreferenceSchema, PreferencesSnapshot } from "./core.js";

export interface PreferenceIdentity {
  readonly subject: string;
  readonly tenant: string;
}

export interface PreferenceStoreWriteResult {
  readonly status: "saved" | "unchanged" | "conflict";
  readonly snapshot: PreferencesSnapshot;
}

export interface PreferencesStore {
  /** Null represents a new identity: defaults with revision 0, not a database write. */
  read(identity: Readonly<PreferenceIdentity>): Promise<PreferencesSnapshot | null>;
  /**
   * Implement atomically using a transaction or compare-and-swap scoped to BOTH identity fields.
   * If values already match, return unchanged without incrementing revision (retry-safe).
   * Otherwise save only when revision matches; a new identity starts at revision 0.
   * A successful change increments revision by one; stale differing writes return conflict.
   */
  compareAndSet(
    identity: Readonly<PreferenceIdentity>,
    expectedRevision: number,
    preferences: NotificationPreferences,
  ): Promise<PreferenceStoreWriteResult>;
}

export interface PreferencesHandlerOptions {
  readonly schema: PreferenceSchema;
  readonly store: PreferencesStore;
  /**
   * Authenticate AND authorize the application session for this endpoint.
   * Derive identity from trusted server context. Enforce your session/CSRF policy.
   * Return null to deny; never obtain subject or tenant from request JSON/query parameters.
   */
  readonly authorize: (
    request: Request,
    context: Readonly<{ action: "read" | "update" }>,
  ) => Promise<PreferenceIdentity | null>;
  /** Exact configured application origins. PUT requires a matching Origin header. */
  readonly allowedOrigins: readonly string[];
}

const maximumBodyBytes = 16_384;

class BodyTooLargeError extends Error {}

function response(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function failure(status: number, code: string, message: string): Response {
  return response(status, { error: { code, message } });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.body === null) throw new PreferencesValidationError("A JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBodyBytes) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    throw new PreferencesValidationError("A valid UTF-8 JSON body is required.");
  }
}

/** Fetch Request/Response adapter. Persistence and application authorization are mandatory. */
export function createPreferencesHandler(options: PreferencesHandlerOptions) {
  const schema = createPreferenceSchema(options.schema);
  if (typeof options.authorize !== "function" ||
      typeof options.store?.read !== "function" || typeof options.store?.compareAndSet !== "function") {
    throw new TypeError("A persistent store and an authorization adapter are required.");
  }
  if (!Array.isArray(options.allowedOrigins) || options.allowedOrigins.length === 0) {
    throw new TypeError("Configure at least one exact application origin.");
  }
  const origins = new Set(options.allowedOrigins.map((value) => {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== value) {
      throw new TypeError("Allowed origins must be exact HTTP(S) origins, without paths or trailing slashes.");
    }
    return url.origin;
  }));

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "PUT") {
      return response(405, { error: { code: "method_not_allowed", message: "Use GET or PUT." } }, {
        Allow: "GET, PUT",
      });
    }
    if (request.method === "PUT" && !origins.has(request.headers.get("origin") ?? "")) {
      return failure(403, "origin_denied", "This request origin is not permitted.");
    }

    let identity: Readonly<PreferenceIdentity>;
    try {
      const authorized = await options.authorize(request, {
        action: request.method === "GET" ? "read" : "update",
      });
      if (!authorized || typeof authorized.subject !== "string" ||
          !authorized.subject.trim() || authorized.subject.length > 512 ||
          typeof authorized.tenant !== "string" || !authorized.tenant.trim() ||
          authorized.tenant.length > 512) {
        return failure(401, "unauthorized", "A permitted authenticated session is required.");
      }
      identity = Object.freeze({ subject: authorized.subject, tenant: authorized.tenant });
    } catch {
      return failure(503, "authorization_unavailable", "Authorization is temporarily unavailable.");
    }

    if (request.method === "GET") {
      try {
        const stored = await options.store.read(identity);
        const snapshot = stored === null
          ? { revision: 0, preferences: defaultPreferences(schema) }
          : validateSnapshot(schema, stored);
        return response(200, snapshot);
      } catch {
        return failure(503, "store_unavailable", "Preferences are temporarily unavailable.");
      }
    }

    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return failure(415, "unsupported_media_type", "Send application/json.");
    }
    let desired: PreferencesSnapshot;
    try {
      desired = validateSnapshot(schema, await readBoundedJson(request));
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return failure(413, "body_too_large", "The request body exceeds 16384 bytes.");
      }
      return failure(400, "invalid_preferences", "Provide a valid revision and the configured preferences only.");
    }

    try {
      const result = await options.store.compareAndSet(identity, desired.revision, desired.preferences);
      const snapshot = validateSnapshot(schema, result.snapshot);
      if (result.status === "conflict") {
        return response(409, {
          error: { code: "revision_conflict", message: "Preferences changed. Review the latest settings." },
          snapshot,
        });
      }
      if (!["saved", "unchanged"].includes(result.status) ||
          !preferencesEqual(snapshot.preferences, desired.preferences) ||
          (result.status === "saved" && snapshot.revision !== desired.revision + 1)) {
        throw new TypeError("The store returned an invalid write result.");
      }
      return response(200, snapshot);
    } catch {
      return failure(503, "store_unavailable", "Preferences could not be saved. Retry with the same values.");
    }
  };
}
