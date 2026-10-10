// SPDX-License-Identifier: Apache-2.0
// Thin wrapper around `jose` for verifying OIDC ID tokens / JWT access tokens.
// jose performs signature verification, JWKS caching, kid selection and
// cooldown-limited refetch on unknown kid; this file only fixes the policy.
import { createRemoteJWKSet, jwtVerify, errors, type JWTPayload } from "jose";

export interface OidcVerifierOptions {
  issuer: string;               // exact `iss` expected (from discovery `issuer`)
  audience: string | string[];  // your client_id (ID token) or API identifier (access token)
  jwksUri: string | URL;        // from discovery `jwks_uri`; must be https in production
  algorithms?: string[];        // allow-list; never include "none" or HS* with public JWKS
  clockToleranceSec?: number;   // small leeway for exp/nbf/iat (default 60s)
  maxTokenAgeSec?: number;      // optional upper bound on `iat` age
  cacheMaxAgeMs?: number;       // JWKS cache lifetime (default 10 min)
  cooldownMs?: number;          // minimum gap between kid-miss refetches (default 30 s)
}

export type OidcVerifyResult =
  | { ok: true; claims: JWTPayload }
  | { ok: false; code: string; message: string };

export function createOidcVerifier(opts: OidcVerifierOptions) {
  const algorithms = opts.algorithms ?? ["RS256", "ES256"];
  if (algorithms.some((a) => a === "none" || a.startsWith("HS"))) {
    throw new Error("symmetric or 'none' algorithms are not allowed with a public JWKS");
  }
  const jwks = createRemoteJWKSet(new URL(opts.jwksUri), {
    cacheMaxAge: opts.cacheMaxAgeMs ?? 10 * 60_000,
    cooldownDuration: opts.cooldownMs ?? 30_000,
    timeoutDuration: 5_000,
  });

  return async function verify(token: string, expected: { nonce?: string } = {}): Promise<OidcVerifyResult> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: opts.issuer,
        audience: opts.audience,
        algorithms,
        clockTolerance: opts.clockToleranceSec ?? 60,
        maxTokenAge: opts.maxTokenAgeSec,
        requiredClaims: ["sub", "exp", "iat"],
      });
      // nonce binds the ID token to the authorization request (OIDC Core 3.1.3.7).
      if (expected.nonce !== undefined && payload.nonce !== expected.nonce) {
        return { ok: false, code: "ERR_NONCE_MISMATCH", message: "nonce mismatch" };
      }
      return { ok: true, claims: payload };
    } catch (e) {
      if (e instanceof errors.JOSEError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  };
}
