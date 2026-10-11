// SPDX-License-Identifier: Apache-2.0
// Server-only Fetch Request/Response helper: authenticate a request by `Authorization: Bearer <api key>`.
//
//   const auth = await authenticateRequest(keys, request, ["invoices:read"]);
//   if (!auth.ok) return auth.response;            // 401 or 403, ready to send
//   handle(auth.principal);                        // { tenantId, keyId, prefix, environment, scopes }
//
// 401 for a missing, malformed, unknown, wrong, revoked, expired or wrong-environment key, with
// `www-authenticate: Bearer realm=..., error="invalid_token"` (RFC 6750); 403 with error="insufficient_scope" and
// the required scopes when the key is valid but lacks one. Bodies never echo the presented key.
import { ApiKeyError } from "./core.js";
import type { ApiKeyPrincipal, ApiKeys } from "./core.js";

export interface AuthenticateOptions {
  /** realm in the WWW-Authenticate challenge. Default "api". */
  readonly realm?: string;
}

export type AuthenticateResult =
  | { readonly ok: true; readonly principal: ApiKeyPrincipal }
  | { readonly ok: false; readonly status: 401 | 403; readonly response: Response };

const quoted = (value: string) => `"${value.replace(/["\\]/g, "")}"`;

function failure(status: 401 | 403, error: string, challenge: string): AuthenticateResult {
  return {
    ok: false, status,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": challenge },
    }),
  };
}

export async function authenticateRequest(
  keys: Pick<ApiKeys, "verify">, request: Request, requiredScopes: readonly string[] = [], options: AuthenticateOptions = {},
): Promise<AuthenticateResult> {
  const realm = quoted(options.realm ?? "api");
  const header = request.headers.get("authorization");
  if (header === null || header === "") return failure(401, "unauthenticated", `Bearer realm=${realm}`);
  const match = /^Bearer ([^\s,]+)$/i.exec(header.trim());
  if (!match || match[1] === undefined) return failure(401, "invalid-key", `Bearer realm=${realm}, error="invalid_request"`);
  try {
    return { ok: true, principal: await keys.verify(match[1], requiredScopes) };
  } catch (error) {
    if (!(error instanceof ApiKeyError)) throw error;
    if (error.code === "insufficient-scope") {
      return failure(403, "insufficient-scope", `Bearer realm=${realm}, error="insufficient_scope", scope=${quoted(requiredScopes.join(" "))}`);
    }
    return failure(401, error.code, `Bearer realm=${realm}, error="invalid_token"`);
  }
}
