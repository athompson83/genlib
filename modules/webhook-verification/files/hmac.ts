// SPDX-License-Identifier: Apache-2.0
// Web Crypto HMAC-SHA256 primitives for webhook verification. No environment or credential discovery.

export type VerifyFailureReason = "missing-header" | "malformed" | "expired" | "mismatch";
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailureReason };

/** Raw request body bytes. A string is UTF-8 encoded; never pass re-serialized JSON. */
export type WebhookPayload = Uint8Array | ArrayBuffer | string;
/** One secret or a rotation list (current first). Strings are UTF-8 key bytes. */
export type SecretInput = string | Uint8Array | readonly (string | Uint8Array)[];

export const MAX_SECRETS = 10;
const MAX_SECRET_BYTES = 4096;
const encoder = new TextEncoder();

export const fail = (reason: VerifyFailureReason): VerifyResult => ({ ok: false, reason });
export const OK: VerifyResult = Object.freeze({ ok: true });

/** Configuration errors throw a fixed message that never includes secret material. */
export function configError(what: string): TypeError {
  return new TypeError(`Webhook verification configuration is invalid: ${what}.`);
}

/** Copy into a fresh ArrayBuffer-backed view (Web Crypto rejects shared buffers). */
export function toBytes(value: WebhookPayload): Uint8Array<ArrayBuffer> {
  const source = typeof value === "string" ? encoder.encode(value)
    : value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

export function isPayload(value: unknown): value is WebhookPayload {
  return typeof value === "string" || value instanceof Uint8Array || value instanceof ArrayBuffer;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const part of parts) total += part.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

/** Normalize secrets to key bytes; throws a redacted TypeError for invalid configuration. */
export function normalizeSecrets(
  secrets: SecretInput,
  decodeString: (secret: string) => Uint8Array | null = s => encoder.encode(s),
): Uint8Array<ArrayBuffer>[] {
  const list: readonly (string | Uint8Array)[] = typeof secrets === "string" || secrets instanceof Uint8Array
    ? [secrets] : Array.isArray(secrets) ? secrets : [];
  if (list.length === 0 || list.length > MAX_SECRETS) throw configError(`provide 1-${MAX_SECRETS} secrets`);
  return list.map(secret => {
    const bytes = typeof secret === "string" ? decodeString(secret)
      : secret instanceof Uint8Array ? secret : null;
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_SECRET_BYTES) throw configError("secret");
    return toBytes(bytes);
  });
}

export async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

/** Constant-time for equal-length inputs; differing lengths return false immediately (lengths are public). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Strict lowercase/uppercase hex of an exact SHA-256 length, or null. */
export function decodeHex64(value: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Strict standard base64 (with padding optional), or null. */
export function decodeBase64(value: string): Uint8Array | null {
  if (value.length === 0 || value.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** True when any secret's HMAC over data equals any candidate signature. */
export async function matchesAny(
  keys: readonly Uint8Array<ArrayBuffer>[],
  data: Uint8Array<ArrayBuffer>,
  candidates: readonly Uint8Array[],
): Promise<boolean> {
  for (const key of keys) {
    const expected = await hmacSha256(key, data);
    let matched = false;
    for (const candidate of candidates) matched = timingSafeEqual(expected, candidate) || matched;
    if (matched) return true;
  }
  return false;
}

export interface HmacVerifyOptions {
  secret: SecretInput;
  payload: WebhookPayload;
  /** Hex HMAC-SHA256 digest supplied by the sender (64 hex characters). */
  signatureHex: string | null | undefined;
}

/** Generic HMAC-SHA256 verification over the exact raw body bytes. Never throws on bad input. */
export async function verifyHmacSha256(options: HmacVerifyOptions): Promise<VerifyResult> {
  const keys = normalizeSecrets(options.secret);
  if (options.signatureHex === null || options.signatureHex === undefined || options.signatureHex === "") {
    return fail("missing-header");
  }
  if (typeof options.signatureHex !== "string" || !isPayload(options.payload)) return fail("malformed");
  const signature = decodeHex64(options.signatureHex.trim());
  if (!signature) return fail("malformed");
  return await matchesAny(keys, toBytes(options.payload), [signature]) ? OK : fail("mismatch");
}
