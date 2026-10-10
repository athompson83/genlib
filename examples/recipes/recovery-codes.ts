// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: MFA recovery (backup) codes: generate, normalize, keyed hash, lookup. Original source; copy and adapt.
// Show codes to the user once, store only HMAC-SHA256 hashes keyed with a server-side secret
// ("pepper") kept outside the database, delete a hash after it is used, rate-limit attempts and
// notify the user when a code is consumed. Uses Web Crypto; nothing is hand-rolled.

/** Crockford base32 without I, L, O, U (unambiguous when read aloud or handwritten). */
export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export interface RecoveryCodeFormat { groups?: number; groupLength?: number }

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  return c;
}

function shape(format: RecoveryCodeFormat): { groups: number; groupLength: number } {
  const { groups = 2, groupLength = 5 } = format;
  if (!Number.isInteger(groups) || groups < 1 || groups > 8) throw new RangeError("groups must be an integer from 1 to 8");
  if (!Number.isInteger(groupLength) || groupLength < 2 || groupLength > 16) throw new RangeError("groupLength must be an integer from 2 to 16");
  return { groups, groupLength };
}

/**
 * Unique codes such as "7K3QX-9MNP2". Each symbol takes the low 5 bits of a CSPRNG byte;
 * 256 is a multiple of 32, so selection is unbiased.
 */
export function generateRecoveryCodes(count = 10, format: RecoveryCodeFormat = {}): string[] {
  const { groups, groupLength } = shape(format);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError("count must be an integer from 1 to 100");
  if (groups * groupLength < 8) throw new RangeError("codes must have at least 8 symbols (40 bits)");
  const codes = new Set<string>();
  while (codes.size < count) {
    const bytes = webCrypto().getRandomValues(new Uint8Array(groups * groupLength));
    const symbols = Array.from(bytes, (b) => RECOVERY_ALPHABET[b & 31]).join("");
    const parts: string[] = [];
    for (let i = 0; i < groups; i++) parts.push(symbols.slice(i * groupLength, (i + 1) * groupLength));
    codes.add(parts.join("-"));
  }
  return [...codes];
}

/** Uppercases, drops spaces/hyphens, maps O->0 and I/L->1; throws on other characters or wrong length. */
export function normalizeRecoveryCode(input: string, format: RecoveryCodeFormat = {}): string {
  const { groups, groupLength } = shape(format);
  const code = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  for (const ch of code) {
    if (!RECOVERY_ALPHABET.includes(ch)) throw new Error(`Invalid recovery code character: ${JSON.stringify(ch)}`);
  }
  if (code.length !== groups * groupLength) throw new Error(`Recovery code must have ${groups * groupLength} characters`);
  return code;
}

/** Lowercase hex HMAC-SHA256(key, normalized code). */
export async function hashRecoveryCode(code: string, key: Uint8Array, format: RecoveryCodeFormat = {}): Promise<string> {
  if (key.length < 1) throw new RangeError("key is required");
  const { subtle } = webCrypto();
  const cryptoKey = await subtle.importKey("raw", new Uint8Array(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(normalizeRecoveryCode(code, format))));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Index of the stored hash matching `input`, or -1 (also for malformed input). Compares against
 * every stored hash without exiting early. Remove the matched hash so the code works once.
 */
export async function findRecoveryCode(input: string, storedHashes: readonly string[], key: Uint8Array, format: RecoveryCodeFormat = {}): Promise<number> {
  let hash: string;
  try { hash = await hashRecoveryCode(input, key, format); } catch (error) {
    if (error instanceof RangeError) throw error;
    return -1;
  }
  let found = -1;
  storedHashes.forEach((stored, index) => {
    if (constantTimeEqual(stored.toLowerCase(), hash) && found < 0) found = index;
  });
  return found;
}
