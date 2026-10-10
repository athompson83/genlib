// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: non-cryptographic hashes for checksums, sharding, cache keys and bucketing: CRC-32
// (IEEE 802.3), FNV-1a 32/64, MurmurHash3 x86_32 and Lamping & Veach jump consistent hash. Original
// source; copy and adapt. Never use these for passwords, MACs, signatures or anything an attacker must
// not be able to collide (use Web Crypto / node:crypto). Strings are hashed as UTF-8.

export type HashInput = Uint8Array | string;
const bytesOf = (input: HashInput): Uint8Array => (typeof input === "string" ? new TextEncoder().encode(input) : input);

const CRC_TABLE = Array.from({ length: 256 }, (_v, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  return c >>> 0;
});

/** IEEE CRC-32 (reflected, polynomial 0xEDB88320); crc32("123456789") === 0xCBF43926. */
export function crc32(input: HashInput): number {
  let c = 0xffffffff;
  for (const b of bytesOf(input)) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function fnv1a32(input: HashInput): number {
  let h = 0x811c9dc5;
  for (const b of bytesOf(input)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

/** FNV-1a 64 as an unsigned bigint; format with .toString(16).padStart(16, "0"). */
export function fnv1a64(input: HashInput): bigint {
  let h = 0xcbf29ce484222325n;
  for (const b of bytesOf(input)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return h;
}

const rotl = (x: number, r: number): number => ((x << r) | (x >>> (32 - r))) >>> 0;
const mix = (k: number): number => Math.imul(rotl(Math.imul(k, 0xcc9e2d51), 15), 0x1b873593) >>> 0;

/** MurmurHash3 x86_32 with little-endian 4-byte blocks. */
export function murmur3_32(input: HashInput, seed = 0): number {
  const data = bytesOf(input), n = data.length, full = n - (n % 4);
  const at = (i: number): number => data[i] ?? 0;
  let h = seed >>> 0;
  for (let i = 0; i < full; i += 4) {
    h ^= mix((at(i) | (at(i + 1) << 8) | (at(i + 2) << 16) | (at(i + 3) << 24)) >>> 0);
    h = (Math.imul(rotl(h >>> 0, 13), 5) + 0xe6546b64) >>> 0;
  }
  if (n % 4) {
    let k = 0;
    for (let i = n - 1; i >= full; i--) k = (k << 8) | at(i);
    h ^= mix(k >>> 0);
  }
  h = (h ^ n) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Jump consistent hash: unsigned 64-bit key -> bucket in [0, buckets), buckets 1..2^31-1. */
export function jumpHash(key: bigint, buckets: number): number {
  if (typeof key !== "bigint" || key < 0n || key > 0xffffffffffffffffn) throw new RangeError("key must be an unsigned 64-bit bigint");
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > 2 ** 31 - 1) throw new RangeError("buckets must be in 1..2^31-1");
  let b = -1, j = 0, k = key;
  while (j < buckets) {
    b = j;
    k = BigInt.asUintN(64, k * 2862933555777941757n + 1n);
    j = Math.floor((b + 1) * (2 ** 31 / (Number(k >> 33n) + 1)));
  }
  return b;
}
