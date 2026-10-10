// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: HOTP/TOTP one-time passwords for MFA (RFC 4226, RFC 6238). Original source; copy and adapt.
// Uses Web Crypto HMAC (globalThis.crypto.subtle) and crypto.getRandomValues; no SHA/HMAC is
// hand-rolled. Store the shared secret encrypted at rest, rate-limit verification attempts and
// remember the last accepted counter per user so a code cannot be replayed inside its window.

export type OtpAlgorithm = "SHA1" | "SHA256" | "SHA512";

const HASH: Record<OtpAlgorithm, string> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  return c;
}

function checkOptions(digits: number, algorithm: OtpAlgorithm): void {
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new RangeError("digits must be an integer from 6 to 10");
  if (!Object.hasOwn(HASH, algorithm)) throw new RangeError(`Unsupported algorithm: ${String(algorithm)}`);
}

/** RFC 4226 HOTP with dynamic truncation; returns a zero-padded decimal string. */
export async function hotp(secret: Uint8Array, counter: number | bigint, digits = 6, algorithm: OtpAlgorithm = "SHA1"): Promise<string> {
  checkOptions(digits, algorithm);
  if (typeof counter === "number" && !Number.isSafeInteger(counter)) throw new RangeError("counter must be a safe integer");
  const value = BigInt(counter);
  if (value < 0n || value > 0xffffffffffffffffn) throw new RangeError("counter must fit in an unsigned 64-bit integer");
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, value);
  const { subtle } = webCrypto();
  const key = await subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: HASH[algorithm] }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", key, message));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export interface TotpOptions { step?: number; digits?: number; algorithm?: OtpAlgorithm; t0?: number }

function counterAt(unixSeconds: number, step: number, t0: number): number {
  if (!Number.isFinite(unixSeconds) || !Number.isFinite(t0)) throw new RangeError("time values must be finite");
  if (!Number.isInteger(step) || step <= 0) throw new RangeError("step must be a positive integer");
  const counter = Math.floor((unixSeconds - t0) / step);
  if (counter < 0) throw new RangeError("time is before t0");
  return counter;
}

/** RFC 6238 TOTP for a Unix time in seconds. */
export async function totp(secret: Uint8Array, unixSeconds: number, options: TotpOptions = {}): Promise<string> {
  const { step = 30, digits = 6, algorithm = "SHA1", t0 = 0 } = options;
  return hotp(secret, counterAt(unixSeconds, step, t0), digits, algorithm);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Accepts a code whose counter is within +/- `window` steps of now. Every candidate is computed
 * and compared in constant time. Malformed or wrong-length codes return false.
 */
export async function verifyTotp(code: string, secret: Uint8Array, unixSeconds: number, options: TotpOptions & { window?: number } = {}): Promise<boolean> {
  const { window = 1, step = 30, digits = 6, algorithm = "SHA1", t0 = 0 } = options;
  if (!Number.isInteger(window) || window < 0 || window > 10) throw new RangeError("window must be an integer from 0 to 10");
  checkOptions(digits, algorithm);
  if (typeof code !== "string" || code.length !== digits || !/^[0-9]+$/.test(code)) return false;
  const now = counterAt(unixSeconds, step, t0);
  let matched = false;
  for (let delta = -window; delta <= window; delta++) {
    const counter = now + delta;
    if (counter < 0) continue;
    if (constantTimeEqual(await hotp(secret, counter, digits, algorithm), code)) matched = true;
  }
  return matched;
}

/** RFC 4648 base32 without padding. */
export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) { out += BASE32[(buffer >> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

/** Case-insensitive; ignores spaces, hyphens and trailing "=" padding; throws on other characters. */
export function base32Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error(`Invalid base32 character: ${JSON.stringify(ch)}`);
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((buffer >> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Uint8Array.from(out);
}

/** Provisioning URI for authenticator apps (render as a QR code; never log it). */
export function otpauthUri(issuer: string, account: string, secretBase32: string, digits = 6, period = 30, algorithm: OtpAlgorithm = "SHA1"): string {
  checkOptions(digits, algorithm);
  if (!issuer || !account) throw new Error("issuer and account are required");
  if (!Number.isInteger(period) || period <= 0) throw new RangeError("period must be a positive integer");
  const secret = secretBase32.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  if (!secret || base32Decode(secret).length === 0) throw new Error("secret is empty");
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(account)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=${algorithm}&digits=${digits}&period=${period}`;
}

/** Random shared secret from the CSPRNG; 20 bytes (160 bits) is the RFC 4226 recommendation. */
export function generateSecret(bytes = 20): Uint8Array {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) throw new RangeError("bytes must be an integer from 16 to 64");
  return webCrypto().getRandomValues(new Uint8Array(bytes));
}
