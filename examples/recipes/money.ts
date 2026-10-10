// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: money in integer minor units (parse, rate, allocate, format). Original source; copy and adapt.
// Amounts are safe integers of the currency's minor unit (cents for USD, yen for JPY), using a
// pinned ISO 4217 exponent table. BigInt arithmetic keeps rates and splits off binary floating point.

export type RoundingMode = "half-up" | "half-even" | "floor" | "ceil" | "truncate";

function assertCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError(`Invalid ISO 4217 currency code: ${currency}`);
}
function assertMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw new RangeError("Amount must be a safe integer of minor units");
}

/** Pinned ISO 4217 minor-unit exponents; only these codes are accepted. Extend deliberately. */
export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries([
  ...["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "CNY", "INR", "MXN", "BRL", "SEK", "NOK", "DKK", "NZD", "SGD", "HKD", "ZAR"].map((c) => [c, 2]),
  ...["JPY", "KRW", "VND", "CLP", "ISK"].map((c) => [c, 0]),
  ...["BHD", "KWD", "JOD", "OMR", "TND"].map((c) => [c, 3]),
]));
const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Minor-unit digits (USD 2, JPY 0, KWD 3) from the pinned table; unknown codes throw. */
export function currencyExponent(currency: string): number {
  assertCurrency(currency);
  const exp = CURRENCY_EXPONENTS[currency];
  if (exp === undefined) throw new RangeError(`Unsupported currency: ${currency}`);
  return exp;
}

/** Strict "-?DIGITS(.DIGITS)?" to minor units; more fraction digits than the currency allows is an error. */
export function toMinor(amount: string, currency: string): number {
  const exp = currencyExponent(currency);
  const match = typeof amount === "string" ? DECIMAL.exec(amount) : null;
  if (!match) throw new RangeError(`Invalid decimal amount: ${String(amount)}`);
  const [, sign, whole = "0", frac = ""] = match;
  if (frac.length > exp) throw new RangeError(`Too many decimal places for ${currency}`);
  const result = Number((sign ? -1n : 1n) * BigInt(whole + frac.padEnd(exp, "0")));
  assertMinor(result);
  return result;
}

/** Plain decimal string with exactly the currency's fraction digits; no symbol or grouping. */
export function formatMinor(minor: number, currency: string): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  const digits = BigInt(Math.abs(minor)).toString().padStart(exp + 1, "0");
  const text = exp === 0 ? digits : `${digits.slice(0, -exp)}.${digits.slice(-exp)}`;
  return minor < 0 ? `-${text}` : text;
}

/** Integer division of BigInts with an explicit rounding mode. */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode = "half-even"): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const q = numerator / denominator; // truncates toward zero
  const r = numerator % denominator;
  if (r === 0n) return q;
  const negative = numerator < 0n;
  const twice = (r < 0n ? -r : r) * 2n;
  switch (mode) {
    case "truncate": return q;
    case "floor": return negative ? q - 1n : q;
    case "ceil": return negative ? q : q + 1n;
    case "half-up": return twice >= denominator ? (negative ? q - 1n : q + 1n) : q;
    case "half-even": {
      if (twice > denominator || (twice === denominator && q % 2n !== 0n)) return negative ? q - 1n : q + 1n;
      return q;
    }
  }
}

/** Parses "1234.5" / "-0.07" into minor units without floats; rejects excess precision unless a mode is given. */
export function parseMoney(text: string, currency: string, mode?: RoundingMode): number {
  const exp = currencyExponent(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new RangeError(`Invalid decimal amount: ${text}`);
  const [, sign, whole = "0", frac = ""] = match;
  if (frac.length > exp && !mode) throw new RangeError(`Too many decimal places for ${currency}`);
  const scaled = BigInt(whole + frac.padEnd(exp, "0"));
  const extra = Math.max(0, frac.length - exp);
  let minor = extra ? divideRounded(scaled, 10n ** BigInt(extra), mode) : scaled;
  if (sign) minor = -minor;
  const result = Number(minor);
  assertMinor(result);
  return result;
}

/** Applies a decimal rate string ("0.0825" tax, "1.5" multiplier) on the exact product and rounds once. */
export function applyRate(minor: number, rate: string, mode: RoundingMode = "half-even"): number {
  assertMinor(minor);
  const match = DECIMAL.exec(rate);
  if (!match || (match[3] ?? "").length > 9) throw new RangeError(`Invalid rate (at most 9 fraction digits): ${rate}`);
  const [, sign, whole = "0", frac = ""] = match;
  const numerator = BigInt(minor) * BigInt(whole + frac) * (sign ? -1n : 1n);
  const result = Number(divideRounded(numerator, 10n ** BigInt(frac.length), mode));
  assertMinor(result);
  return result;
}

/**
 * Splits `total` across non-negative integer weights so parts always sum to `total`
 * (largest-remainder; ties go to the earlier weight). Use for invoices, refunds, splits.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertMinor(total);
  if (weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new RangeError("Weights must be non-negative safe integers");
  const sum = weights.reduce((a, w) => a + BigInt(w), 0n);
  if (sum === 0n) throw new RangeError("At least one weight must be positive");
  const sign = total < 0 ? -1n : 1n;
  const abs = BigInt(Math.abs(total));
  const parts = weights.map((w) => (abs * BigInt(w)) / sum);
  const remainders = weights.map((w, i) => ({ i, r: (abs * BigInt(w)) % sum }));
  let left = abs - parts.reduce((a, p) => a + p, 0n);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (left === 0n) break;
    parts[i] = (parts[i] ?? 0n) + 1n;
    left--;
  }
  return parts.map((p) => Number(p * sign));
}

/** Locale-aware display. Display only: never parse formatted strings back into amounts. */
export function formatMoney(minor: number, currency: string, locale = "en-US", options: Intl.NumberFormatOptions = {}): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { ...options, style: "currency", currency, minimumFractionDigits: exp, maximumFractionDigits: exp }).format(minor / 10 ** exp);
}
