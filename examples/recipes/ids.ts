// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: time-ordered unique IDs, UUIDv7 (RFC 9562) and ULID. Original source; copy and adapt.
// The pure builders take the timestamp and 10 random bytes so tests and replays are deterministic;
// newUuidV7/newUlid use crypto.getRandomValues and Date.now. IDs sort by creation time (to the
// millisecond) but reveal it: do not use them as secrets or unguessable capability tokens.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_MS = 2 ** 48 - 1;

function checkInputs(unixMs: number, random: Uint8Array): void {
  if (!Number.isSafeInteger(unixMs) || unixMs < 0 || unixMs > MAX_MS) throw new RangeError("unixMs must be an integer from 0 to 2^48-1");
  if (!(random instanceof Uint8Array) || random.length !== 10) throw new RangeError("random must be exactly 10 bytes");
}

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error("crypto.getRandomValues is not available in this runtime");
  return c;
}

/** 48-bit big-endian time, then random bytes with version 7 and the RFC 9562 variant; lowercase 8-4-4-4-12. */
export function uuidV7(unixMs: number, random10: Uint8Array): string {
  checkInputs(unixMs, random10);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(unixMs / 2 ** (8 * (5 - i))) % 256;
  bytes.set(random10, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** (unixMs << 80 | random) as 26 Crockford base32 characters (uppercase). */
export function ulid(unixMs: number, random10: Uint8Array): string {
  checkInputs(unixMs, random10);
  let value = BigInt(unixMs);
  for (const byte of random10) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let i = 25; i >= 0; i--) out += CROCKFORD[Number((value >> BigInt(5 * i)) & 31n)];
  return out;
}

/** Timestamp of a UUIDv7 (case-insensitive). Rejects other formats, versions and variants. */
export function uuidV7Time(text: string): number {
  if (typeof text !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new RangeError("not a UUID in 8-4-4-4-12 hex form");
  }
  if (text[14] !== "7") throw new RangeError("not a version 7 UUID");
  if (!/[89ab]/i.test(text[19] ?? "")) throw new RangeError("UUID variant is not RFC 9562");
  return parseInt(text.slice(0, 8) + text.slice(9, 13), 16);
}

/** Timestamp of a ULID (case-insensitive). Rejects wrong length/characters and overflowing first char. */
export function ulidTime(text: string): number {
  if (typeof text !== "string" || text.length !== 26) throw new RangeError("ULID must be 26 characters");
  const upper = text.toUpperCase();
  let ms = 0;
  for (let i = 0; i < 26; i++) {
    const value = CROCKFORD.indexOf(upper[i] ?? "");
    if (value < 0) throw new RangeError(`invalid ULID character: ${JSON.stringify(text[i])}`);
    if (i === 0 && value > 7) throw new RangeError("ULID timestamp overflows 48 bits");
    if (i < 10) ms = ms * 32 + value;
  }
  return ms;
}

/** New UUIDv7 from the system clock and the CSPRNG. */
export function newUuidV7(): string {
  return uuidV7(Date.now(), webCrypto().getRandomValues(new Uint8Array(10)));
}

/** New ULID from the system clock and the CSPRNG (not monotonic within one millisecond). */
export function newUlid(): string {
  return ulid(Date.now(), webCrypto().getRandomValues(new Uint8Array(10)));
}
