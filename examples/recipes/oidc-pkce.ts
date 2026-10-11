// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: OAuth 2.0 authorization code + PKCE request side for OpenID Connect SSO. Original source; copy and adapt.
//
// SCOPE: this builds and checks the browser leg only (verifier, challenge, state, nonce,
// authorization URL, callback parsing, token request body). ID token and access token
// VERIFICATION (signature, issuer, audience, expiry, nonce) must use a vetted OIDC/JOSE library
// (see the Tier B cookbook). Never decode a token to make an auth decision here.
// Keep the verifier, state and nonce server-side or in an HttpOnly session, bound to one login.

const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  return c;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 7636 code verifier: 43-128 unreserved characters chosen without modulo bias. */
export function generateCodeVerifier(length = 64): string {
  if (!Number.isInteger(length) || length < 43 || length > 128) throw new RangeError("verifier length must be from 43 to 128");
  const limit = 256 - (256 % UNRESERVED.length);
  let out = "";
  while (out.length < length) {
    for (const byte of webCrypto().getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += UNRESERVED[byte % UNRESERVED.length];
    }
  }
  return out;
}

/** base64url(SHA-256(ASCII verifier)) without padding. */
export async function codeChallengeS256(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error("Invalid code verifier");
  const digest = await webCrypto().subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Opaque random value for `state` and `nonce`. */
export function randomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 256) throw new RangeError("bytes must be from 16 to 256");
  return base64Url(webCrypto().getRandomValues(new Uint8Array(bytes)));
}

export interface AuthorizationRequest {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string | readonly string[];
  state: string;
  nonce: string;
  codeChallenge: string;
  extraParams?: Record<string, string> | readonly (readonly [string, string])[];
}

const RESERVED = new Set(["response_type", "client_id", "redirect_uri", "scope", "state", "nonce", "code_challenge", "code_challenge_method"]);

function checkEndpoint(raw: string): void {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("authorizationEndpoint is not a valid URL"); }
  const loopback = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !loopback) throw new Error("authorizationEndpoint must use https (http only for localhost)");
  if (url.hash || raw.includes("#")) throw new Error("authorizationEndpoint must not contain a fragment");
}

export function buildAuthorizationUrl(request: AuthorizationRequest): string {
  const { authorizationEndpoint, clientId, redirectUri, state, nonce, codeChallenge } = request;
  checkEndpoint(authorizationEndpoint);
  const scopes = typeof request.scope === "string" ? request.scope.split(/\s+/).filter(Boolean) : [...request.scope];
  if (!scopes.includes("openid")) throw new Error('scope must include "openid"');
  for (const [name, value] of Object.entries({ clientId, redirectUri, state, nonce, codeChallenge })) {
    if (!value) throw new Error(`${name} is required`);
  }
  const params: [string, string][] = [
    ["response_type", "code"], ["client_id", clientId], ["redirect_uri", redirectUri], ["scope", scopes.join(" ")],
    ["state", state], ["nonce", nonce], ["code_challenge", codeChallenge], ["code_challenge_method", "S256"],
  ];
  const extra = request.extraParams === undefined ? [] : Array.isArray(request.extraParams) ? request.extraParams : Object.entries(request.extraParams);
  for (const [name, value] of extra as readonly (readonly [string, string])[]) {
    if (RESERVED.has(name)) throw new Error(`extraParams must not override ${name}`);
    params.push([name, value]);
  }
  const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const separator = !authorizationEndpoint.includes("?") ? "?" : /[?&]$/.test(authorizationEndpoint) ? "" : "&";
  return authorizationEndpoint + separator + query;
}

/** Callback failure: `error` is the provider's OAuth error code, or state_mismatch / missing_code / invalid_callback. */
export class OAuthCallbackError extends Error {
  readonly error: string;
  readonly errorDescription: string | undefined;
  constructor(error: string, errorDescription?: string) {
    super(errorDescription ? `${error}: ${errorDescription}` : error);
    this.error = error;
    this.errorDescription = errorDescription;
    this.name = "OAuthCallbackError";
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Parses the redirect back from the provider. Throws OAuthCallbackError; returns only the code. */
export function parseCallback(callbackUrl: string, expectedState: string): { code: string } {
  let params: URLSearchParams;
  try { params = new URL(callbackUrl).searchParams; } catch { throw new OAuthCallbackError("invalid_callback", "Callback is not a valid URL"); }
  for (const name of ["code", "state", "error"]) {
    if (params.getAll(name).length > 1) throw new OAuthCallbackError("invalid_callback", `Duplicate ${name} parameter`);
  }
  const error = params.get("error");
  if (error !== null) throw new OAuthCallbackError(error, params.get("error_description") ?? undefined);
  if (!expectedState || !constantTimeEqual(params.get("state") ?? "", expectedState)) throw new OAuthCallbackError("state_mismatch");
  const code = params.get("code");
  if (!code) throw new OAuthCallbackError("missing_code");
  return { code };
}

/** application/x-www-form-urlencoded body for the token endpoint (POST it server-side). */
export function tokenRequestBody(input: { code: string; redirectUri: string; clientId: string; codeVerifier: string }): string {
  for (const [name, value] of Object.entries(input)) if (!value) throw new Error(`${name} is required`);
  return new URLSearchParams([
    ["grant_type", "authorization_code"], ["code", input.code], ["redirect_uri", input.redirectUri],
    ["client_id", input.clientId], ["code_verifier", input.codeVerifier],
  ]).toString();
}
