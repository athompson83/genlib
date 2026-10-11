// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: masking personal data for logs and UIs (display masking, NOT anonymization). Original source.
// maskEmail keeps the first code point of the local part and the domain ("j*******@example.com", at least three
// "*"). maskPhone keeps the last 4 ASCII digits and a leading "+<1-3 digits> " country code. maskCard keeps the last
// 4 of 12-19 digits plus separators. maskMiddle keeps code points at each end. redact masks emails and Luhn-valid
// 13-19 digit card numbers (single spaces or hyphens allowed, not touching other digits) in free text; phones are not
// detected there. Invalid input throws RangeError. Mask before logging; never log the raw value "just in case".
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart pii-mask modules.

export type RedactKind = "email" | "card";
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD = /(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])/g;
const isDigit = (c: string): boolean => c >= "0" && c <= "9";

/** Masks the local part of an email address except its first code point. */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  const [local = "", domain = ""] = parts;
  if (parts.length !== 2 || !local || !domain) throw new RangeError("not an email address");
  const cps = Array.from(local);
  return `${cps[0]}${"*".repeat(Math.max(3, cps.length - 1))}@${domain}`;
}

/** Masks every ASCII digit except the last 4 and a leading "+NN " country code. */
export function maskPhone(phone: string): string {
  const chars = Array.from(phone);
  const total = chars.filter(isDigit).length;
  if (total < 7) throw new RangeError("not a phone number");
  const keepFront = /^\+(\p{Nd}{1,3}) /u.exec(phone)?.[1]?.length ?? 0;
  let seen = 0;
  return chars.map((c) => {
    if (!isDigit(c)) return c;
    const keep = seen < keepFront || seen >= total - 4;
    seen++;
    return keep ? c : "*";
  }).join("");
}

/** Masks all but the last 4 digits of a 12-19 digit card number, keeping spaces and hyphens. */
export function maskCard(card: string): string {
  if (!/^[0-9 -]+$/.test(card)) throw new RangeError("not a card number");
  const total = card.replace(/[ -]/g, "").length;
  if (total < 12 || total > 19) throw new RangeError("not a card number");
  let seen = 0;
  return card.replace(/[0-9]/g, (c) => (seen++ >= total - 4 ? c : "*"));
}

/** Keeps keepStart and keepEnd code points and masks the rest (everything when too short). */
export function maskMiddle(s: string, keepStart = 1, keepEnd = 1, mask = "*"): string {
  if (!Number.isInteger(keepStart) || !Number.isInteger(keepEnd) || keepStart < 0 || keepEnd < 0 || Array.from(mask).length !== 1) {
    throw new RangeError("bad arguments");
  }
  const cps = Array.from(s);
  if (cps.length <= keepStart + keepEnd) return mask.repeat(cps.length);
  return cps.slice(0, keepStart).join("") + mask.repeat(cps.length - keepStart - keepEnd) + cps.slice(cps.length - keepEnd).join("");
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

/** Masks emails and Luhn-valid card numbers found in free text. */
export function redact(text: string, kinds: readonly RedactKind[] = ["email", "card"]): string {
  if (kinds.some((k) => k !== "email" && k !== "card")) throw new RangeError("unsupported kind");
  if (kinds.includes("card")) text = text.replace(CARD, (run) => (luhn(run.replace(/[ -]/g, "")) ? maskCard(run) : run));
  if (kinds.includes("email")) text = text.replace(EMAIL, (e) => maskEmail(e));
  return text;
}
