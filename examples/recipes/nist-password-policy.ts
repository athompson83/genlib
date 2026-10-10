// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: NIST SP 800-63B style password checks with no composition rules, returning every
// failure in a fixed order. Original source; copy and adapt. Use a large breached-password list as the
// blocklist (server-side), allow all printable characters including spaces and emoji, never truncate,
// rate-limit attempts and store only a slow hash (Argon2id, scrypt or bcrypt). Lengths count code points.

export interface PasswordOptions { minLength?: number; maxLength?: number; blocklist?: string[]; context?: string[] }
export type PasswordFailure = "too-short" | "too-long" | "control-characters" | "blocklisted" | "contains-context" | "repetitive";
export interface PasswordCheck { ok: boolean; failures: PasswordFailure[] }
export const FAILURE_ORDER: readonly PasswordFailure[] = ["too-short", "too-long", "control-characters", "blocklisted", "contains-context", "repetitive"];

const ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz";
const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
const isControl = (cp: number): boolean => cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);

function repetitive(points: string[]): boolean {
  for (let i = 0; i + 4 <= points.length; i++) {
    const w = points.slice(i, i + 4);
    if (w.every((c) => c === w[0])) return true;
    const low = asciiLower(w.join(""));
    const reversed = Array.from(low).reverse().join("");
    if (/^[0-9a-z]{4}$/.test(low) && (ALNUM.includes(low) || ALNUM.includes(reversed))) return true;
  }
  return false;
}

/** Returns { ok, failures } with failures in FAILURE_ORDER; throws RangeError for invalid options. */
export function checkPassword(password: string, options: PasswordOptions = {}): PasswordCheck {
  const { minLength = 15, maxLength = 64, blocklist = [], context = [] } = options;
  if (!Number.isInteger(minLength) || !Number.isInteger(maxLength) || minLength < 1 || maxLength < minLength) {
    throw new RangeError("need integers 1 <= minLength <= maxLength");
  }
  const points = Array.from(password), failures: PasswordFailure[] = [];
  if (points.length < minLength) failures.push("too-short");
  if (points.length > maxLength) failures.push("too-long");
  if (points.some((c) => isControl(c.codePointAt(0) ?? 0))) failures.push("control-characters");
  const low = asciiLower(password);
  if (blocklist.some((entry) => asciiLower(entry) === low)) failures.push("blocklisted");
  if (context.some((item) => Array.from(item).length >= 4 && low.includes(asciiLower(item)))) failures.push("contains-context");
  if (repetitive(points)) failures.push("repetitive");
  return { ok: failures.length === 0, failures };
}
