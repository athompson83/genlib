// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: expiring signed URLs ("...&expires=<unix s>&signature=<base64url HMAC-SHA256>"). Original source; copy and adapt.
// Uses Web Crypto HMAC (globalThis.crypto.subtle). The MAC covers the path, existing query and expiry
// exactly as sent. A signed URL is a bearer credential until it expires: keep expiries short, serve
// over HTTPS and keep the secret on the server.

export type SignedUrlErrorCode = "malformed" | "bad signature" | "expired";

export class SignedUrlError extends Error {
  constructor(readonly code: SignedUrlErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SignedUrlError";
  }
}

const encoder = new TextEncoder();
const MARK = "&signature=";

async function mac(secret: string, message: string): Promise<string> {
  if (typeof secret !== "string" || secret.length === 0) throw new RangeError("secret must be a non-empty string");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await subtle.sign("HMAC", key, encoder.encode(message)));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function queryParams(url: string): string[] {
  const q = url.indexOf("?");
  return q < 0 ? [] : url.slice(q + 1).split("&").filter((p) => p !== "");
}

const paramName = (p: string): string => p.split("=", 1)[0] ?? "";

function checkSeconds(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer of unix seconds`);
}

/** Appends expires and a signature to a "/path?query" target (no "#", no existing expires/signature). */
export async function signUrl(target: string, secret: string, expiresUnixSeconds: number): Promise<string> {
  if (typeof target !== "string" || !target.startsWith("/") || target.includes("#")) {
    throw new RangeError("target must be a path (plus optional query) starting with '/' and without '#'");
  }
  checkSeconds(expiresUnixSeconds, "expiresUnixSeconds");
  const names = queryParams(target).map(paramName);
  if (names.includes("expires") || names.includes("signature")) throw new RangeError("target already has an expires or signature parameter");
  const message = `${target}${target.includes("?") ? "&" : "?"}expires=${expiresUnixSeconds}`;
  return message + MARK + (await mac(secret, message));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Resolves to the expiry when the signature matches (constant-time) and now <= expires.
 * Throws SignedUrlError with code "malformed", "bad signature" or "expired".
 */
export async function verifyUrl(signed: string, secret: string, nowUnixSeconds: number): Promise<number> {
  checkSeconds(nowUnixSeconds, "nowUnixSeconds");
  if (typeof secret !== "string" || secret.length === 0) throw new RangeError("secret must be a non-empty string");
  if (typeof signed !== "string") throw new SignedUrlError("malformed", "signed URL must be a string");
  const cut = signed.lastIndexOf(MARK);
  if (cut < 0) throw new SignedUrlError("malformed", "missing signature");
  const message = signed.slice(0, cut);
  const signature = signed.slice(cut + MARK.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new SignedUrlError("malformed", "signature must be 43 base64url characters at the end");
  const expires = queryParams(message).filter((p) => paramName(p) === "expires").map((p) => p.slice("expires=".length));
  const value = expires[0];
  if (expires.length !== 1 || value === undefined || !/^[0-9]{1,15}$/.test(value)) {
    throw new SignedUrlError("malformed", "need exactly one decimal expires parameter");
  }
  if (!constantTimeEqual(await mac(secret, message), signature)) throw new SignedUrlError("bad signature");
  const expiry = Number(value);
  if (nowUnixSeconds > expiry) throw new SignedUrlError("expired");
  return expiry;
}
