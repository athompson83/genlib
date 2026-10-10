// SPDX-License-Identifier: Apache-2.0
// Request correlation for Fetch-standard Request objects (Node 22+, Bun, Deno, Workers).

import type { Logger } from "./logger.js";

/** Accepted incoming IDs: 1–128 characters of letters, digits, ".", "_", ":", "-". */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface WithRequestOptions {
  /** Header to read. Default "x-request-id". */
  header?: string;
  /** Reuse a well-formed incoming ID. Default true; set false when the edge is untrusted. */
  trustIncoming?: boolean;
  /** ID generator. Default crypto.randomUUID(). */
  generate?: () => string;
}

export interface RequestLogger {
  readonly logger: Logger;
  readonly requestId: string;
}

/**
 * Bind a request ID to a child logger. Malformed incoming IDs are replaced, never logged.
 * Set the same ID on the response yourself, for example `headers.set("x-request-id", requestId)`.
 */
export function withRequest(logger: Logger, request: Request, options: WithRequestOptions = {}): RequestLogger {
  const header = options.header ?? "x-request-id";
  const incoming = options.trustIncoming === false ? null : request.headers.get(header);
  let requestId: string;
  if (incoming !== null && REQUEST_ID_PATTERN.test(incoming)) {
    requestId = incoming;
  } else {
    const generate = options.generate ?? (() => globalThis.crypto.randomUUID());
    requestId = generate();
    if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
      throw new TypeError("structured-logger: generated request ID is invalid.");
    }
  }
  return Object.freeze({ logger: logger.child({ requestId }), requestId });
}
