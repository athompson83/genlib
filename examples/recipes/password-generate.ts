// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: password and passphrase generation with an injectable byte source. Original source; copy and adapt.
// nextByte returns an integer 0..255. It defaults to the platform CSPRNG (crypto.getRandomValues, buffered); never
// use Math.random. Inject a deterministic source only in tests. randomIndex is unbiased (rejection sampling over k
// big-endian bytes, n <= 2^48). generatePassword picks one character from each class in class order, fills the rest
// from the union of the classes and Fisher-Yates shuffles; excludeAmbiguous removes "Il1O0o" from every class.
// Invalid arguments throw RangeError. Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart
// password-generate modules for the same byte source.

export type NextByte = () => number;
export type CharClass = "lower" | "upper" | "digits" | "symbols";
export const CLASSES: Readonly<Record<CharClass, string>> = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!#$%&*+-=?@^_~",
};
const DEFAULT_CLASSES: readonly CharClass[] = ["lower", "upper", "digits", "symbols"];

const pool = new Uint8Array(256);
let poolPos = pool.length;
/** One byte from crypto.getRandomValues (the default byte source). */
export function cryptoByte(): number {
  if (poolPos >= pool.length) { crypto.getRandomValues(pool); poolPos = 0; }
  return pool[poolPos++] ?? 0;
}

/** Unbiased index in [0, n) by rejection sampling over big-endian bytes. */
export function randomIndex(n: number, nextByte: NextByte = cryptoByte): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 48) throw new RangeError("n must be an integer 1..2^48");
  if (n === 1) return 0;
  let k = 1;
  while (256 ** k < n) k++;
  const limit = Math.floor(256 ** k / n) * n;
  for (;;) {
    let x = 0;
    for (let i = 0; i < k; i++) {
      const b = nextByte();
      if (!Number.isInteger(b) || b < 0 || b > 255) throw new RangeError("nextByte must return 0..255");
      x = x * 256 + b;
    }
    if (x < limit) return x % n;
  }
}

/** Random password with at least one character of each class (CSPRNG unless nextByte is given). */
export function generatePassword(length = 16, classes: readonly CharClass[] = DEFAULT_CLASSES, nextByte: NextByte = cryptoByte, excludeAmbiguous = false): string {
  if (!classes.length || new Set(classes).size !== classes.length || classes.some((c) => !Object.hasOwn(CLASSES, c))) {
    throw new RangeError("bad classes");
  }
  if (!Number.isInteger(length) || length < classes.length || length > 1024) throw new RangeError("bad length");
  const alphabets = classes.map((c) => Array.from(CLASSES[c]).filter((ch) => !(excludeAmbiguous && "Il1O0o".includes(ch))));
  const out = alphabets.map((a) => a[randomIndex(a.length, nextByte)] ?? "");
  const union = alphabets.flat();
  for (let i = classes.length; i < length; i++) out.push(union[randomIndex(union.length, nextByte)] ?? "");
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, nextByte);
    [out[i], out[j]] = [out[j] ?? "", out[i] ?? ""];
  }
  return out.join("");
}

/** Joins count words chosen uniformly from words (CSPRNG unless nextByte is given). */
export function generatePassphrase(words: readonly string[], count = 5, separator = "-", nextByte: NextByte = cryptoByte): string {
  if (!Number.isInteger(count) || count < 1 || count > 64) throw new RangeError("count must be 1..64");
  if (new Set(words).size < 2 || words.some((w) => !w)) throw new RangeError("need at least 2 distinct non-empty words");
  return Array.from({ length: count }, () => words[randomIndex(words.length, nextByte)]).join(separator);
}

/** length * log2(alphabetSize), rounded to 2 decimals (for strength meters). */
export function entropyBits(alphabetSize: number, length: number): number {
  if (!(alphabetSize >= 1) || !(length >= 0)) throw new RangeError("bad arguments");
  return Math.round(length * Math.log2(alphabetSize) * 100) / 100;
}
