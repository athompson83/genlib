// SPDX-License-Identifier: Apache-2.0
// Default password hasher: scrypt from node:crypto (Node.js 22+, also Bun and Deno's node:crypto), salted with
// 16 random bytes and encoded as a PHC-style string `$scrypt$ln=17,r=8,p=1$<salt>$<hash>` (unpadded base64).
// Verification recomputes the key and compares it with timingSafeEqual. Passwords are NFKC-normalized before
// hashing, as NIST SP 800-63B recommends, so hash and verify must both go through this hasher.
// node:crypto is imported lazily, so importing this file has no side effects and needs no Node type packages.

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Never throws for a malformed stored hash; returns false. */
  verify(password: string, stored: string): Promise<boolean>;
  /** True when the stored hash is malformed or uses weaker parameters than this hasher; rehash after sign-in. */
  needsRehash?(stored: string): boolean;
}

export interface ScryptHasherOptions {
  /** log2 of the CPU/memory cost N. Default 17 (N = 131,072, OWASP); 15 to 20. */
  readonly cost?: number;
  /** Block size r. Default 8; 8 to 32. */
  readonly blockSize?: number;
  /** Parallelization p. Default 1; 1 to 16. */
  readonly parallelization?: number;
  /** Derived key bytes. Default 32; 16 to 64. */
  readonly keyLength?: number;
  /** Salt bytes. Default 16; 16 to 64. */
  readonly saltLength?: number;
}

interface NodeCryptoSubset {
  scrypt(
    password: Uint8Array, salt: Uint8Array, keylen: number,
    options: { N: number; r: number; p: number; maxmem: number },
    callback: (error: Error | null, key: Uint8Array) => void,
  ): void;
  randomBytes(size: number): Uint8Array;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

interface ScryptParams { ln: number; r: number; p: number; salt: Uint8Array; key: Uint8Array }

let nodeCrypto: Promise<NodeCryptoSubset> | undefined;
function loadCrypto(): Promise<NodeCryptoSubset> {
  // A computed specifier keeps TypeScript from requiring @types/node; the module is resolved at runtime.
  const specifier = "node:crypto";
  return (nodeCrypto ??= import(specifier) as Promise<NodeCryptoSubset>);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "");
}

function fromBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+$/.test(text)) return null;
  try {
    const binary = atob(text + "=".repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

const MAX_MEMORY = 1024 * 1024 * 1024;
const PHC = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Parses a `$scrypt$` string, refusing parameters outside safe bounds (a stored hash cannot force huge work). */
export function parseScryptHash(stored: string): ScryptParams | null {
  const match = typeof stored === "string" ? PHC.exec(stored) : null;
  if (!match) return null;
  const ln = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  const salt = fromBase64(match[4] ?? "");
  const key = fromBase64(match[5] ?? "");
  if (ln < 10 || ln > 20 || r < 1 || r > 32 || p < 1 || p > 16 || 128 * 2 ** ln * r > MAX_MEMORY) return null;
  if (!salt || !key || salt.length < 8 || salt.length > 64 || key.length < 16 || key.length > 64) return null;
  return { ln, r, p, salt, key };
}

function derive(cryptoModule: NodeCryptoSubset, password: string, salt: Uint8Array, ln: number, r: number, p: number, keyLength: number): Promise<Uint8Array> {
  const N = 2 ** ln;
  const input = new TextEncoder().encode(password.normalize("NFKC"));
  return new Promise((resolve, reject) => {
    cryptoModule.scrypt(input, salt, keyLength, { N, r, p, maxmem: 2 * 128 * N * r * p + 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(new Uint8Array(key));
    });
  });
}

function check(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

export function createScryptHasher(options: ScryptHasherOptions = {}): PasswordHasher & { needsRehash(stored: string): boolean } {
  const ln = check(options.cost ?? 17, 15, 20, "cost");
  const r = check(options.blockSize ?? 8, 8, 32, "blockSize");
  const p = check(options.parallelization ?? 1, 1, 16, "parallelization");
  const keyLength = check(options.keyLength ?? 32, 16, 64, "keyLength");
  const saltLength = check(options.saltLength ?? 16, 16, 64, "saltLength");
  if (128 * 2 ** ln * r > MAX_MEMORY) throw new RangeError("cost and blockSize exceed 1 GiB of scrypt memory");

  return {
    async hash(password) {
      if (typeof password !== "string") throw new TypeError("password must be a string");
      const cryptoModule = await loadCrypto();
      const salt = new Uint8Array(cryptoModule.randomBytes(saltLength));
      const key = await derive(cryptoModule, password, salt, ln, r, p, keyLength);
      return `$scrypt$ln=${ln},r=${r},p=${p}$${toBase64(salt)}$${toBase64(key)}`;
    },
    async verify(password, stored) {
      const parsed = parseScryptHash(stored);
      if (!parsed || typeof password !== "string") return false;
      const cryptoModule = await loadCrypto();
      const key = await derive(cryptoModule, password, parsed.salt, parsed.ln, parsed.r, parsed.p, parsed.key.length);
      return key.length === parsed.key.length && cryptoModule.timingSafeEqual(key, parsed.key);
    },
    needsRehash(stored) {
      const parsed = parseScryptHash(stored);
      if (!parsed) return true;
      return parsed.ln < ln || parsed.r < r || parsed.p < p || parsed.salt.length < saltLength || parsed.key.length !== keyLength;
    },
  };
}
