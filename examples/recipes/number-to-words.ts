// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: English number words in US style without "and": cardinals, ordinals, suffixes and money. Original
// source; copy and adapt. numberToWords() covers |n| < 10^15 with thousand/million/billion/trillion groups,
// hyphenated 21-99 ("forty-two"), "one hundred five" and omitted zero groups ("one million one"); negatives start
// with "negative". ordinalWords() makes the last word ordinal ("twenty-first", "one hundredth", "zeroth").
// ordinalSuffix() gives "1st", "11th", "112th", "-22nd". moneyWords() spells an amount in minor units ("one dollar
// and one cent", "zero dollars"); the minor part is omitted when it is 0 or the exponent is 0. Plurals only add
// "s". Failures throw RangeError. For other languages or locales use Intl or a translation catalog instead.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart number-words modules.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];
const IRREGULAR: Readonly<Record<string, string>> = {
  one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth",
};

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) parts.push((TENS[Math.floor(n / 10)] ?? "") + (n % 10 ? "-" + ONES[n % 10] : ""));
  else if (n > 0) parts.push(ONES[n] ?? "");
  return parts.join(" ");
}

/** Spells an integer with |n| < 10^15 in English words ("one million two hundred thirty-four thousand"). */
export function numberToWords(n: number): string {
  if (!Number.isSafeInteger(n) || Math.abs(n) >= 1e15) throw new RangeError("number must be an integer with |n| < 10^15");
  if (n === 0) return "zero";
  if (n < 0) return "negative " + numberToWords(-n);
  const groups: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) groups.unshift(under1000(g) + (SCALES[i] ? " " + SCALES[i] : ""));
  }
  return groups.join(" ");
}

const ordinal = (w: string): string => IRREGULAR[w] ?? (w.endsWith("y") ? w.slice(0, -1) + "ieth" : w + "th");

/** Spells a non-negative integer as an ordinal ("twenty-first"). */
export function ordinalWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("ordinal needs a non-negative integer");
  const words = numberToWords(n).split(" ");
  const last = words.pop() ?? "";
  const dash = last.indexOf("-");
  words.push(dash >= 0 ? last.slice(0, dash + 1) + ordinal(last.slice(dash + 1)) : ordinal(last));
  return words.join(" ");
}

/** The integer followed by st, nd, rd or th ("1st", "12th", "-22nd"). */
export function ordinalSuffix(n: number): string {
  if (!Number.isSafeInteger(n)) throw new RangeError("ordinal suffix needs an integer");
  const a = Math.abs(n);
  const suffix = a % 100 >= 11 && a % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][a % 10] ?? "th");
  return `${n}${suffix}`;
}

/** Spells an amount given in minor units ("one hundred twenty-three dollars and forty-five cents"). */
export function moneyWords(minor: number, major: string, minorName: string, exponent = 2): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || ![0, 1, 2, 3].includes(exponent)) {
    throw new RangeError("minor must be a non-negative integer and exponent 0..3");
  }
  const unit = 10 ** exponent;
  const whole = Math.floor(minor / unit), frac = minor % unit;
  let out = `${numberToWords(whole)} ${major}${whole === 1 ? "" : "s"}`;
  if (exponent && frac) out += ` and ${numberToWords(frac)} ${minorName}${frac === 1 ? "" : "s"}`;
  return out;
}
