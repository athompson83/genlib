// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: money in integer minor units (parse, rate, allocate, format). Original source; copy and adapt.
// Amounts are safe integers of the currency's minor unit (cents for USD, yen for JPY).
// Intermediate arithmetic uses BigInt so rates and splits never go through binary floating point.

export type RoundingMode = "half-up" | "half-even" | "floor" | "ceil" | "truncate";

function assertCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError(`Invalid ISO 4217 currency code: ${currency}`);
}
function assertMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw new RangeError("Amount must be a safe integer of minor units");
}

/** Minor-unit digits from the runtime's ICU data (USD 2, JPY 0, KWD 3). Pin your own table if ICU varies. */
export function currencyExponent(currency: string): number {
  assertCurrency(currency);
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
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

/** Applies a decimal rate given as a string ("0.0825" tax, "1.5" multiplier) and rounds once. */
export function applyRate(minor: number, rate: string, mode: RoundingMode = "half-even"): number {
  assertMinor(minor);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!match) throw new RangeError(`Invalid rate: ${rate}`);
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
