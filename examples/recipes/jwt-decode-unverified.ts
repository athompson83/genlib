// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: decode a JWT WITHOUT verifying it. Original source; copy and adapt.
//
// WARNING: INSPECTION ONLY. NEVER USE FOR AUTHENTICATION OR AUTHORIZATION.
// The output is attacker-controllable until a server verifies the signature, issuer, audience
// and expiry with a maintained JOSE library and pinned algorithms. Acceptable uses: showing a
// display name, scheduling a token refresh before `exp`, or debugging. Do not log full tokens.

export interface UnverifiedJwt {
  readonly verified: false;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

function base64UrlToText(segment: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) throw new Error("Malformed token segment");
  const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "="));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function jsonObject(segment: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(base64UrlToText(segment)); } catch { throw new Error("Malformed token segment"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Token segment is not a JSON object");
  return value as Record<string, unknown>;
}

/** Decodes a compact JWS (header.payload.signature). Rejects encrypted JWE (5 parts) and oversized input. */
export function decodeJwtUnverified(token: string, maxLength = 16_384): UnverifiedJwt {
  if (token.length > maxLength) throw new Error("Token too long");
  const parts = token.trim().split(".");
  if (parts.length === 5) throw new Error("Encrypted JWE tokens cannot be decoded without a key");
  if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error("Not a compact JWT");
  return { verified: false, header: jsonObject(parts[0]), payload: jsonObject(parts[1]) };
}

const numericDate = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/**
 * Seconds until `exp` (negative when past), or undefined when absent. For UI and refresh
 * scheduling only; the server's verification decides whether the token is accepted.
 */
export function secondsUntilExpiry(jwt: UnverifiedJwt, nowMs: number = Date.now()): number | undefined {
  const exp = numericDate(jwt.payload.exp);
  return exp === undefined ? undefined : Math.floor(exp - nowMs / 1000);
}

/** True when `exp` is within `skewSeconds` of now: refresh proactively rather than wait for a 401. */
export function shouldRefresh(jwt: UnverifiedJwt, skewSeconds = 60, nowMs: number = Date.now()): boolean {
  const left = secondsUntilExpiry(jwt, nowMs);
  return left !== undefined && left <= skewSeconds;
}
