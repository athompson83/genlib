// SPDX-License-Identifier: Apache-2.0
// Web Push payload encryption (RFC 8291 over the RFC 8188 "aes128gcm" content coding) and VAPID application
// server identification (RFC 8292), with Web Crypto only. Server-side code: keep the VAPID private key out of
// client bundles.
//
// Encryption, for one subscription (ua_public = p256dh, auth_secret = auth):
//   ecdh_secret = ECDH(as_private, ua_public)                    as_* is a fresh P-256 key pair per message
//   IKM   = HKDF-SHA-256(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info" || 0x00 || ua_public || as_public, 32)
//   CEK   = HKDF-SHA-256(salt=salt, ikm=IKM, info="Content-Encoding: aes128gcm" || 0x00, 16)
//   NONCE = HKDF-SHA-256(salt=salt, ikm=IKM, info="Content-Encoding: nonce" || 0x00, 12)
//   body  = salt(16) || rs(4, 4096) || idlen(1, 65) || as_public(65) || AES-128-GCM(CEK, NONCE, plaintext || 0x02)
// Only one record is written, so the plaintext plus delimiter and tag must fit in rs, and the whole body must
// fit in the 4096 octets push services are required to accept: at most MAX_PAYLOAD_BYTES (3993) of plaintext.

export type Bytes = Uint8Array<ArrayBuffer>;

/** Record size written in the header. */
export const RECORD_SIZE = 4096;
/** Header length: salt 16 + rs 4 + idlen 1 + 65-octet uncompressed P-256 key. */
export const HEADER_BYTES = 86;
/** Largest plaintext that fits one record and a 4096-octet push message body (4096 - 86 - 16 tag - 1 delimiter). */
export const MAX_PAYLOAD_BYTES = 3993;
/** RFC 8292 caps the VAPID JWT lifetime at 24 hours. */
export const MAX_VAPID_TTL_SECONDS = 86_400;

const encoder = new TextEncoder();

export function concat(...parts: readonly Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes unpadded or padded base64url. Throws TypeError on any other character. */
export function base64UrlDecode(value: string): Bytes {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) throw new TypeError("Invalid base64url");
  const plain = value.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  if (plain.length % 4 === 1) throw new TypeError("Invalid base64url length");
  const binary = atob(plain + "=".repeat((4 - (plain.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** Converts a 65-octet uncompressed P-256 point to JWK x/y members. */
export function pointToJwk(point: Uint8Array): { kty: "EC"; crv: "P-256"; x: string; y: string } {
  if (point.length !== 65 || point[0] !== 4) throw new TypeError("Expected a 65-octet uncompressed P-256 public key");
  return { kty: "EC", crv: "P-256", x: base64UrlEncode(point.subarray(1, 33)), y: base64UrlEncode(point.subarray(33)) };
}

/** Imports a subscription's p256dh key (validates that it is a point on P-256). */
export function importUserAgentKey(p256dh: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", p256dh, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

export interface EncryptOptions {
  /** 16 random octets by default; fixed only to reproduce test vectors. */
  readonly salt?: Bytes;
  /** A fresh ECDH key pair by default; fixed only to reproduce test vectors. Never reuse one in production. */
  readonly serverKeys?: { readonly privateKey: CryptoKey; readonly publicKey: Bytes };
}

/**
 * Encrypts one push message for one subscription and returns the complete aes128gcm request body.
 * `p256dh` is the user agent's 65-octet public key and `auth` its 16-octet authentication secret.
 */
export async function encryptPushPayload(plaintext: Uint8Array, p256dh: Bytes, auth: Bytes, options: EncryptOptions = {}): Promise<Bytes> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new RangeError(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  if (auth.length !== 16) throw new TypeError("auth must be 16 octets");
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new TypeError("salt must be 16 octets");
  const uaKey = await importUserAgentKey(p256dh);
  let serverKeys = options.serverKeys;
  if (!serverKeys) {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    serverKeys = { privateKey: pair.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
  }
  const asPublic = serverKeys.publicKey;
  if (asPublic.length !== 65) throw new TypeError("Server public key must be 65 octets");

  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKeys.privateKey, 256));
  const keyInfo = concat(encoder.encode("WebPush: info\0"), p256dh, asPublic);
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(plaintext, Uint8Array.of(0x02));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded));

  const header = new Uint8Array(HEADER_BYTES);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

// ---------------------------------------------------------------------------------------------- VAPID (RFC 8292)

export interface VapidKeys {
  /** base64url 65-octet uncompressed P-256 public key (the browser's applicationServerKey). */
  readonly publicKey: string;
  /** base64url 32-octet P-256 private scalar. Server secret. */
  readonly privateKey: string;
}

/** Generates a VAPID key pair. Store the private key as a server secret; publish the public key. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("Private key export failed");
  return { publicKey: base64UrlEncode(publicKey), privateKey: jwk.d };
}

/** Imports VAPID keys as an ECDSA signing key, checking that the private scalar matches the public key. */
export async function importVapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const point = base64UrlDecode(keys.publicKey);
  const d = base64UrlDecode(keys.privateKey);
  if (d.length !== 32) throw new TypeError("VAPID private key must be 32 octets");
  const jwk: JsonWebKey = { ...pointToJwk(point), d: base64UrlEncode(d), ext: false };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

const SUBJECT = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/;

/** True for a `mailto:` address or an `https:` URL, the two contact forms RFC 8292 allows. */
export function isVapidSubject(subject: string): boolean {
  if (!SUBJECT.test(subject) || subject.length > 512) return false;
  if (subject.startsWith("mailto:")) return true;
  try {
    return new URL(subject).protocol === "https:";
  } catch {
    return false;
  }
}

export interface VapidJwtInput {
  /** The push service origin, e.g. https://fcm.googleapis.com (derive it from the endpoint). */
  readonly audience: string;
  readonly subject: string;
  /** Current time in milliseconds. */
  readonly now: number;
  /** Lifetime in seconds, 60 to 86,400. Default 43,200 (12 hours). */
  readonly ttlSeconds?: number;
}

/** Builds an ES256 JWT (header.payload.signature, signature raw r||s) for the VAPID Authorization header. */
export async function createVapidJwt(signingKey: CryptoKey, input: VapidJwtInput): Promise<string> {
  const ttl = input.ttlSeconds ?? 43_200;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > MAX_VAPID_TTL_SECONDS) throw new RangeError("VAPID ttlSeconds must be 60 to 86400");
  if (!isVapidSubject(input.subject)) throw new TypeError("VAPID subject must be a mailto: or https: contact");
  const audience = new URL(input.audience).origin;
  const exp = Math.floor(input.now / 1000) + ttl;
  const segment = (value: unknown) => base64UrlEncode(encoder.encode(JSON.stringify(value)));
  const signingInput = `${segment({ typ: "JWT", alg: "ES256" })}.${segment({ aud: audience, exp, sub: input.subject })}`;
  // Web Crypto ECDSA emits the IEEE P1363 form (r || s, 64 octets), which is what JWS ES256 requires.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, encoder.encode(signingInput)));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/** `vapid t=<jwt>, k=<public key>` for the Authorization request header (RFC 8292 Section 3). */
export function vapidAuthorization(jwt: string, publicKey: string): string {
  return `vapid t=${jwt}, k=${publicKey}`;
}
