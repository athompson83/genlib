// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Bloom filter with deterministic FNV-1a double hashing and a portable serialized form. Original
// source; copy and adapt. bloomSizeFor(n, p): m = ceil(-n ln p / ln(2)^2) bits (at least 8), k = max(1,
// floor(m/n ln 2 + 0.5)). An item is hashed as h = FNV-1a 64 of its UTF-8 bytes (BigInt, wrapping mod 2^64); h1 = low
// 32 bits, h2 = high 32 bits and position i is (h1 + i*h2) mod 2^64 mod m. Bit j lives in byte j >> 3 under mask
// 1 << (j & 7); serialize() is base64url without padding, so filters move between the Genlib languages.
// countEstimate() is -m/k ln(1 - X/m) rounded half up (X = set bits), or null when saturated. Failures throw
// BloomError (a RangeError). Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart modules.

export class BloomError extends RangeError { override name = "BloomError"; }

const M64 = (1n << 64n) - 1n;
const utf8 = new TextEncoder();

/** FNV-1a 64-bit hash of bytes as an unsigned BigInt. */
export function fnv1a64(data: Uint8Array): bigint {
  let h = 0xcbf29ce484222325n;
  for (const b of data) h = ((h ^ BigInt(b)) * 0x100000001b3n) & M64;
  return h;
}

/** Bits m and hash count k for n items at false-positive rate p. */
export function bloomSizeFor(n: number, p: number): { m: number; k: number } {
  if (!Number.isInteger(n) || n < 1 || !(p > 0 && p < 1)) throw new BloomError("n must be >= 1 and 0 < p < 1");
  const m = Math.max(8, Math.ceil((-n * Math.log(p)) / Math.LN2 ** 2));
  return { m, k: Math.max(1, Math.floor((m / n) * Math.LN2 + 0.5)) };
}

const popcount = (b: number): number => { let c = 0; for (; b; b &= b - 1) c++; return c; };

export class BloomFilter {
  readonly bits: Uint8Array;

  /** Creates an empty filter of m bits and k hashes, or one holding the given ceil(m/8) bytes of state. */
  constructor(readonly m: number, readonly k: number, bits?: Uint8Array) {
    if (!Number.isSafeInteger(m) || m < 8 || !Number.isInteger(k) || k < 1 || k > 64) {
      throw new BloomError("m must be >= 8 and 1 <= k <= 64");
    }
    const size = Math.ceil(m / 8);
    if (bits && bits.length !== size) throw new BloomError("state length does not match m");
    this.bits = bits ? Uint8Array.from(bits) : new Uint8Array(size);
  }

  /** The k bit positions for an item. */
  positions(item: string): number[] {
    const h = fnv1a64(utf8.encode(item));
    const h1 = h & 0xffffffffn, h2 = h >> 32n, m = BigInt(this.m);
    return Array.from({ length: this.k }, (_, i) => Number(((h1 + BigInt(i) * h2) & M64) % m));
  }

  /** Adds an item. */
  add(item: string): void {
    for (const j of this.positions(item)) this.bits[j >> 3] = (this.bits[j >> 3] ?? 0) | (1 << (j & 7));
  }

  /** False when the item was certainly never added; true when it probably was. */
  mightContain(item: string): boolean {
    return this.positions(item).every((j) => ((this.bits[j >> 3] ?? 0) & (1 << (j & 7))) !== 0);
  }

  /** Estimated number of distinct items added, or null when every bit is set. */
  countEstimate(): number | null {
    let x = 0;
    for (const b of this.bits) x += popcount(b);
    if (x >= this.m) return null;
    return Math.floor((-this.m / this.k) * Math.log(1 - x / this.m) + 0.5);
  }

  /** The bit array as base64url without padding. */
  serialize(): string {
    let bin = "";
    for (const b of this.bits) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** Rebuilds a filter from serialize() output; throws on bad base64url or a wrong length. */
  static deserialize(m: number, k: number, text: string): BloomFilter {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new BloomError("invalid base64url state");
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    return new BloomFilter(m, k, Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  /** A new filter containing the items of both (same m and k required). */
  union(other: BloomFilter): BloomFilter {
    if (this.m !== other.m || this.k !== other.k) throw new BloomError("filters differ in m or k");
    return new BloomFilter(this.m, this.k, this.bits.map((b, i) => b | (other.bits[i] ?? 0)));
  }
}
