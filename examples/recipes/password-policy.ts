// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: NIST-style password acceptance policy (length + blocklist, no composition rules). Original source; copy and adapt.
// Follows the shape of NIST SP 800-63B: long minimum, generous maximum, every printable and
// Unicode character allowed, no "must contain a symbol" rules, no periodic rotation, and
// rejection of known-bad, repetitive, sequential or context-specific values. SP 800-63B-4
// sets a 15-character minimum for single-factor passwords and 8 when used with another
// factor; confirm the revision your compliance target names. Hash accepted passwords with a
// slow password hash (Argon2id, scrypt, bcrypt) on the server; this module never stores them.

export type PasswordIssue = "too-short" | "too-long" | "blocklisted" | "repetitive" | "sequential" | "contains-context" | "control-characters";

export interface PasswordPolicy {
  minLength?: number; // default 15
  maxLength?: number; // default 128; NIST requires accepting at least 64
  /** Common or breached passwords, compared case-insensitively. Supply a reviewed list server-side. */
  blocklist?: Iterable<string>;
  /** Context words (username, email local part, product name) that must not appear. */
  contextWords?: readonly string[];
}

export interface PasswordResult { ok: boolean; issues: PasswordIssue[]; length: number }

const fold = (s: string) => s.normalize("NFKC").toLowerCase();

function isSequential(chars: string[]): boolean {
  if (chars.length < 4) return false;
  const codes = chars.map((c) => c.codePointAt(0) ?? 0);
  const step = (codes[1] ?? 0) - (codes[0] ?? 0);
  return Math.abs(step) === 1 && codes.every((code, i) => i === 0 || code - (codes[i - 1] ?? 0) === step);
}

function isRepetitive(chars: string[]): boolean {
  for (let size = 1; size <= Math.floor(chars.length / 2); size++) {
    if (chars.length % size !== 0) continue;
    const unit = chars.slice(0, size).join("");
    if (unit.repeat(chars.length / size) === chars.join("")) return true;
  }
  return false;
}

/** Evaluates a candidate password; length counts Unicode code points after NFKC normalization. */
export function checkPassword(password: string, policy: PasswordPolicy = {}): PasswordResult {
  const min = policy.minLength ?? 15;
  const max = policy.maxLength ?? 128;
  if (min < 8 || max < 64 || max < min) throw new RangeError("Policy must allow min >= 8 and max >= 64");
  const normalized = password.normalize("NFKC");
  const chars = Array.from(normalized);
  const folded = fold(password);
  const issues: PasswordIssue[] = [];
  if (chars.length < min) issues.push("too-short");
  if (chars.length > max) issues.push("too-long");
  if (/[\u0000-\u001f\u007f]/.test(normalized)) issues.push("control-characters");
  const blocked = new Set(Array.from(policy.blocklist ?? [], fold));
  if (blocked.has(folded)) issues.push("blocklisted");
  const foldedChars = Array.from(folded);
  if (chars.length > 0 && isRepetitive(foldedChars)) issues.push("repetitive");
  if (isSequential(foldedChars)) issues.push("sequential");
  for (const word of policy.contextWords ?? []) {
    const w = fold(word.trim());
    if (w.length >= 3 && folded.includes(w)) { issues.push("contains-context"); break; }
  }
  return { ok: issues.length === 0, issues, length: chars.length };
}

/** Plain-language messages; show all issues at once and allow paste and password managers. */
export const PASSWORD_MESSAGES: Record<PasswordIssue, string> = {
  "too-short": "Use a longer password. A few unrelated words make a strong one.",
  "too-long": "This password is longer than we can accept.",
  blocklisted: "This password is too common or has appeared in a data breach.",
  repetitive: "Avoid repeating the same characters or pattern.",
  sequential: "Avoid sequences such as 12345678 or abcdefgh.",
  "contains-context": "Do not include your name, email or the name of this service.",
  "control-characters": "Remove invisible control characters.",
};
