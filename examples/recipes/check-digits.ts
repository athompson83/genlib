// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: check digits for Luhn (cards), IBAN (mod 97), GTIN/EAN/UPC and ISBN-10/13. Original source; copy and adapt.
// Validators return false instead of throwing. A valid check digit only proves the number was typed
// correctly; it does not prove that a card, account or product exists.

const strip = (s: string): string => s.replace(/[ -]/g, "");
const DIGITS = /^[0-9]+$/;

/** Luhn check after removing spaces and hyphens; needs at least 2 ASCII digits. */
export function luhnValid(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = strip(s);
  if (t.length < 2 || !DIGITS.test(t)) return false;
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    let d = t.charCodeAt(t.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

/** The one-character digit that makes payload + digit pass the Luhn check. */
export function luhnCheckDigit(payload: string): string {
  const t = typeof payload === "string" ? strip(payload) : "";
  if (!DIGITS.test(t)) throw new RangeError("payload must contain only ASCII digits, spaces or hyphens");
  for (const d of "0123456789") if (luhnValid(t + d)) return d;
  throw new Error("unreachable");
}

const ibanCompact = (s: string): string => s.replace(/ /g, "").toUpperCase();

/** ISO 13616 IBAN: country, check digits, 11-30 alphanumerics, mod 97 == 1 (computed incrementally). */
export function ibanValid(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = ibanCompact(s);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(t)) return false;
  let rem = 0;
  for (const ch of t.slice(4) + t.slice(0, 4)) {
    const code = ch.charCodeAt(0);
    rem = code <= 57 ? (rem * 10 + code - 48) % 97 : (rem * 100 + code - 55) % 97;
  }
  return rem === 1;
}

/** Valid IBAN as uppercase groups of four separated by single spaces. */
export function ibanFormat(s: string): string {
  if (!ibanValid(s)) throw new RangeError("invalid IBAN");
  return (ibanCompact(s).match(/.{1,4}/g) ?? []).join(" ");
}

/** GTIN-8/12/13/14 (EAN-8, UPC-A, EAN-13, ITF-14): weights 1,3,1,3... from the rightmost digit. */
export function gtinValid(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = strip(s);
  if (![8, 12, 13, 14].includes(t.length) || !DIGITS.test(t)) return false;
  let total = 0;
  for (let i = 0; i < t.length; i++) total += (t.charCodeAt(t.length - 1 - i) - 48) * (i % 2 === 1 ? 3 : 1);
  return total % 10 === 0;
}

export function isbn10Valid(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = strip(s).toUpperCase();
  if (!/^[0-9]{9}[0-9X]$/.test(t)) return false;
  let total = 0;
  for (let i = 0; i < 10; i++) total += (10 - i) * (t[i] === "X" ? 10 : t.charCodeAt(i) - 48);
  return total % 11 === 0;
}

export function isbn13Valid(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = strip(s);
  return t.length === 13 && (t.startsWith("978") || t.startsWith("979")) && gtinValid(t);
}

/** "978" + the first 9 digits + a new GTIN check digit. */
export function isbn10To13(s: string): string {
  if (!isbn10Valid(s)) throw new RangeError("invalid ISBN-10");
  const body = "978" + strip(s).slice(0, 9);
  for (const d of "0123456789") if (gtinValid(body + d)) return body + d;
  throw new Error("unreachable");
}
