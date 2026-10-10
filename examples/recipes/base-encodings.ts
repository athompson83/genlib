// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: strict base32 (RFC 4648 sections 6 and 7), Bitcoin base58 and unpadded base64url
// (RFC 4648 section 5). Original source; copy and adapt. Hand-written so every Genlib language accepts
// and rejects exactly the same inputs. Decoders throw RangeError for unknown characters, bad padding or
// lengths, and non-canonical trailing bits.

export type Base32Alphabet = "rfc4648" | "hex";
const B32: Record<Base32Alphabet, string> = {
  rfc4648: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  hex: "0123456789ABCDEFGHIJKLMNOPQRSTUV",
};
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function table(alphabet: Base32Alphabet): string {
  const t = B32[alphabet];
  if (typeof t !== "string" || !Object.hasOwn(B32, alphabet)) throw new RangeError("base32 alphabet must be 'rfc4648' or 'hex'");
  return t;
}

export function base32Encode(bytes: Uint8Array, alphabet: Base32Alphabet = "rfc4648", padding = true): string {
  const t = table(alphabet);
  let bits = 0, n = 0, out = "";
  for (const byte of bytes) {
    bits = ((bits << 8) | byte) & 0xffff; n += 8;
    while (n >= 5) { n -= 5; out += t[(bits >> n) & 31]; }
  }
  if (n) out += t[(bits << (5 - n)) & 31];
  return padding ? out + "=".repeat((8 - (out.length % 8)) % 8) : out;
}

/** Case-insensitive; padded input needs a multiple of 8 characters and 0, 1, 3, 4 or 6 "=". */
export function base32Decode(text: string, alphabet: Base32Alphabet = "rfc4648", padding = true): Uint8Array {
  const t = table(alphabet);
  let s = text.toUpperCase();
  if (padding) {
    if (s.length % 8) throw new RangeError("padded base32 length must be a multiple of 8");
    const body = s.replace(/=+$/, "");
    if (![0, 1, 3, 4, 6].includes(s.length - body.length)) throw new RangeError("invalid base32 padding");
    s = body;
  } else if (s.includes("=")) throw new RangeError("unexpected base32 padding");
  if ([1, 3, 6].includes(s.length % 8)) throw new RangeError("invalid base32 length");
  let bits = 0, n = 0;
  const out: number[] = [];
  for (const ch of s) {
    const i = t.indexOf(ch);
    if (i < 0 || ch.length !== 1) throw new RangeError(`invalid base32 character ${JSON.stringify(ch)}`);
    bits = ((bits << 5) | i) & 0xffff; n += 5;
    if (n >= 8) { n -= 8; out.push((bits >> n) & 255); }
  }
  if (bits & ((1 << n) - 1)) throw new RangeError("non-canonical base32 (non-zero trailing bits)");
  return Uint8Array.from(out);
}

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let out = "";
  while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
  return "1".repeat(zeros) + out;
}

export function base58Decode(text: string): Uint8Array {
  let num = 0n, zeros = 0, leading = true;
  for (const ch of text) {
    const i = B58.indexOf(ch);
    if (i < 0 || ch.length !== 1) throw new RangeError(`invalid base58 character ${JSON.stringify(ch)}`);
    if (leading && ch === "1") zeros++; else leading = false;
    num = num * 58n + BigInt(i);
  }
  const body: number[] = [];
  while (num > 0n) { body.unshift(Number(num & 255n)); num >>= 8n; }
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...body]);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const len = Math.min(3, bytes.length - i);
    const v = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    for (let k = 0; k <= len; k++) out += B64U[(v >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** Unpadded base64url only: "=", "+", "/", other characters and length % 4 == 1 are rejected. */
export function base64UrlDecode(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new RangeError("invalid base64url length");
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let v = 0;
    for (const ch of chunk) {
      const k = B64U.indexOf(ch);
      if (k < 0 || ch.length !== 1) throw new RangeError(`invalid base64url character ${JSON.stringify(ch)}`);
      v = v * 64 + k;
    }
    const nbytes = Math.floor((chunk.length * 6) / 8), extra = chunk.length * 6 - nbytes * 8;
    if (v % 2 ** extra) throw new RangeError("non-canonical base64url (non-zero trailing bits)");
    v = Math.floor(v / 2 ** extra);
    for (let k = nbytes - 1; k >= 0; k--) out.push(Math.floor(v / 2 ** (8 * k)) & 255);
  }
  return Uint8Array.from(out);
}
