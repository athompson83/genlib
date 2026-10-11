// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Roman numerals 1..3999 in standard subtractive form. Original source; copy and adapt.
// fromRoman is case-insensitive but accepts only the canonical form: a string is valid exactly when toRoman(value)
// equals it upper-cased, so "IIII", "IC", "VX" and "" throw. Failures throw RangeError.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart roman-numerals modules.

const PAIRS: ReadonlyArray<readonly [number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"],
  [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
const VALUES: Readonly<Record<string, number>> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** Formats an integer 1..3999 as an upper-case Roman numeral. */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new RangeError("roman numerals cover 1..3999");
  let out = "";
  for (const [value, symbol] of PAIRS) {
    while (n >= value) { out += symbol; n -= value; }
  }
  return out;
}

/** Parses a canonical Roman numeral (any case) to its integer value. */
export function fromRoman(text: string): number {
  const u = text.replace(/[a-z]/g, (c) => c.toUpperCase());
  const vals = Array.from(u, (c) => (Object.hasOwn(VALUES, c) ? VALUES[c] : undefined));
  if (!vals.length || vals.some((v) => v === undefined)) throw new RangeError("not a roman numeral");
  let total = 0;
  vals.forEach((v = 0, i) => { total += i + 1 < vals.length && (vals[i + 1] ?? 0) > v ? -v : v; });
  if (total < 1 || total > 3999 || toRoman(total) !== u) throw new RangeError("not a canonical roman numeral");
  return total;
}
