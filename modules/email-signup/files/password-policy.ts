// SPDX-License-Identifier: Apache-2.0
// Password policy in the style of NIST SP 800-63B: length limits counted in Unicode code points and a blocklist
// of common and context-specific values. It deliberately has no composition rules (no "one digit, one symbol").
// Replace or extend it with a breached-password check (for example a k-anonymity range query) in production.

export interface PasswordPolicyContext {
  /** The normalized signup email; its local part and domain name are blocked as passwords. */
  readonly email?: string;
}

/** Returns a list of problem codes; an empty list means the password is acceptable. */
export type PasswordPolicy = (password: string, context: PasswordPolicyContext) => readonly string[] | Promise<readonly string[]>;

export interface PasswordPolicyOptions {
  /** Minimum length in code points. Default 15 (800-63B-4 single-factor passwords); at least 8. */
  readonly minLength?: number;
  /** Maximum length in code points. Default 128; must be at least 64. */
  readonly maxLength?: number;
  /** Extra blocked values (your product name, for example). Compared case-insensitively. */
  readonly blocklist?: readonly string[];
}

/** A small list of the most common passwords that meet a 15-character minimum or would otherwise slip through. */
export const COMMON_PASSWORDS: readonly string[] = [
  "password", "password1", "password123", "passwordpassword", "123456789012345", "1234567890123456",
  "123456789", "1234567890", "qwertyuiop", "qwertyuiopasdfgh", "qwertyuiopasdfghjkl", "1q2w3e4r5t6y7u8i",
  "iloveyouiloveyou", "letmeinletmein", "welcome123456789", "abcdefghijklmno", "abcdefghijklmnop",
  "administrator", "changeme", "changemechangeme", "trustno1trustno1", "correcthorsebatterystaple",
];

export function createPasswordPolicy(options: PasswordPolicyOptions = {}): PasswordPolicy {
  const minLength = options.minLength ?? 15;
  const maxLength = options.maxLength ?? 128;
  if (!Number.isInteger(minLength) || minLength < 8) throw new RangeError("minLength must be an integer of at least 8");
  if (!Number.isInteger(maxLength) || maxLength < 64 || maxLength < minLength) throw new RangeError("maxLength must be at least 64 and at least minLength");
  const blocked = new Set([...COMMON_PASSWORDS, ...(options.blocklist ?? [])].map((item) => item.normalize("NFKC").toLowerCase()));

  return (password, context) => {
    const problems: string[] = [];
    const length = [...password].length;
    if (length < minLength) problems.push("too-short");
    if (length > maxLength) problems.push("too-long");
    const folded = password.normalize("NFKC").toLowerCase();
    if (blocked.has(folded)) problems.push("common-password");
    if (length > 0 && new Set(folded).size === 1) problems.push("repetitive");
    if (context.email) {
      const [local = "", domain = ""] = context.email.toLowerCase().split("@");
      const domainName = domain.split(".")[0] ?? "";
      // A password built around the account name is a context-specific weak value.
      if (folded === local || (local.length >= 4 && folded.includes(local)) || (domainName.length >= 4 && folded === domainName)) problems.push("contains-email");
    }
    return problems;
  };
}

/** min 15 code points, max 128, common-password blocklist, no repeated single character, not the email. */
export const defaultPasswordPolicy: PasswordPolicy = createPasswordPolicy();
