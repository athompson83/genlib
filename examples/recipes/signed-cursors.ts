// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: HMAC-SHA256 signed, expiring pagination cursors. Original source; copy and adapt.
// Token = base64url(body) "." base64url(HMAC-SHA256(secret, body)), body = "v1\n<expiresAt>\n<values...>".
// Uses Web Crypto (globalThis.crypto.subtle), whose HMAC verify compares in constant time.
// Signing proves the server issued the cursor; values stay readable, so never put secrets in
// them, and still re-authorize every page request.

export type CursorErrorCode = "malformed" | "bad signature" | "expired";

export class CursorError extends Error {
  readonly code: CursorErrorCode;
  constructor(code: CursorErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.name = "CursorError";
  }
}

const MAX_VALUES = 16;
const MIN_SECRET_BYTES = 32;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  return s;
}

function checkSecret(secret: Uint8Array): void {
  if (!(secret instanceof Uint8Array) || secret.length < MIN_SECRET_BYTES) {
    throw new RangeError(`secret must be at least ${MIN_SECRET_BYTES} bytes`);
  }
}

function checkTime(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer of unix seconds`);
}

async function hmacKey(secret: Uint8Array, usage: "sign" | "verify"): Promise<CryptoKey> {
  return subtle().importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes unpadded base64url; a non-canonical spelling (stray low bits) raises `onAlias`. */
function fromBase64Url(text: string, onAlias: CursorErrorCode): Uint8Array<ArrayBuffer> {
  if (text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) {
    throw new CursorError("malformed", "invalid base64url");
  }
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (toBase64Url(bytes) !== text) throw new CursorError(onAlias, "non-canonical base64url");
  return bytes;
}

/** Signs `values` (1 to 16 strings without "\n") with an expiry in unix seconds. */
export async function encodeCursor(values: readonly string[], secret: Uint8Array, expiresAt: number): Promise<string> {
  checkSecret(secret);
  checkTime(expiresAt, "expiresAt");
  if (expiresAt <= 0) throw new RangeError("expiresAt must be positive");
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_VALUES) {
    throw new RangeError(`values must hold 1 to ${MAX_VALUES} strings`);
  }
  for (const v of values) {
    if (typeof v !== "string" || v.includes("\n")) throw new RangeError("each value must be a string without a newline");
  }
  const body = new TextEncoder().encode(`v1\n${expiresAt}\n${values.join("\n")}`);
  const mac = new Uint8Array(await subtle().sign("HMAC", await hmacKey(secret, "sign"), body));
  return `${toBase64Url(body)}.${toBase64Url(mac)}`;
}

/** Verifies the signature (constant time), then the header and expiry; throws CursorError otherwise. */
export async function decodeCursor(token: string, secret: Uint8Array, now: number): Promise<string[]> {
  checkSecret(secret);
  checkTime(now, "now");
  if (typeof token !== "string") throw new CursorError("malformed", "token must be a string");
  const dot = token.lastIndexOf(".");
  if (dot < 0) throw new CursorError("malformed", "missing signature");
  const body = fromBase64Url(token.slice(0, dot), "malformed");
  // A re-spelled signature is never the issued token, so it fails as a bad signature.
  const mac = fromBase64Url(token.slice(dot + 1), "bad signature");
  if (!(await subtle().verify("HMAC", await hmacKey(secret, "verify"), mac, body))) throw new CursorError("bad signature");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new CursorError("malformed", "body is not UTF-8");
  }
  const [version, expiry, ...values] = text.split("\n");
  if (version !== "v1" || expiry === undefined || !/^\d+$/.test(expiry) || values.length === 0) {
    throw new CursorError("malformed", "bad header");
  }
  if (BigInt(now) >= BigInt(expiry)) throw new CursorError("expired");
  return values;
}
