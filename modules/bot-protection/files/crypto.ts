// SPDX-License-Identifier: Apache-2.0
// Web Crypto helpers shared by the proof-of-work and honeypot checks. No environment reads or key discovery.

export type BotProtectionErrorCode = "invalid-config" | "invalid-form" | "invalid-input";

/** Configuration and input errors. Messages are fixed text and never include keys, secrets or tokens. */
export class BotProtectionError extends Error {
  readonly code: BotProtectionErrorCode;
  constructor(code: BotProtectionErrorCode, message: string) {
    super(message);
    this.name = "BotProtectionError";
    this.code = code;
  }
}

const encoder = new TextEncoder();
export const FORM_ID = /^[A-Za-z0-9_.-]{1,64}$/;

export function assertFormId(formId: unknown): asserts formId is string {
  if (typeof formId !== "string" || !FORM_ID.test(formId)) throw new BotProtectionError("invalid-form", "Form id must be 1-64 letters, digits, '_', '.' or '-'");
}

/** Server keys: a string (UTF-8) or bytes of at least 32 bytes. Throws a redacted error otherwise. */
export function keyBytes(key: unknown, what: string): Uint8Array<ArrayBuffer> {
  const source = typeof key === "string" ? encoder.encode(key) : key instanceof Uint8Array ? key : null;
  if (!source || source.byteLength < 32 || source.byteLength > 4096) throw new BotProtectionError("invalid-config", `${what} must be 32-4096 bytes`);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function importHmacKey(key: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacHex(key: CryptoKey, value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

/** Constant-time comparison of two strings of equal length; differing lengths return false (lengths are public). */
export function timingSafeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Uniform random integer in [0, max] from Web Crypto, without modulo bias. */
export function randomInt(max: number): number {
  const range = max + 1;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % range;
  }
}
