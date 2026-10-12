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

/**
 * A small list of the most common passwords of 8 or more characters (from published breach top lists), so the
 * policy stays useful when an app lowers minLength to 8, plus long values that meet a 15-character minimum.
 */
export const COMMON_PASSWORDS: readonly string[] = [
  "password", "password1", "password12", "password123", "password1234", "passwordpassword", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "12345678910", "123456789012345", "1234567890123456", "87654321", "123123123",
  "11111111", "111111111", "00000000", "88888888", "12341234", "11223344", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx",
  "qwerty123", "qwerty12", "qwertyui", "qwertyuiop", "qwertyuiopasdfgh", "qwertyuiopasdfghjkl", "1q2w3e4r5t6y7u8i",
  "asdfghjk", "asdfghjkl", "zxcvbnm1", "abc12345", "abcd1234", "abcdefgh", "abcdefghijklmno", "abcdefghijklmnop",
  "iloveyou", "iloveyou1", "iloveyouiloveyou", "letmein1", "letmein123", "letmeinletmein", "welcome1", "welcome123",
  "welcome123456789", "sunshine", "sunshine1", "football", "football1", "baseball", "basketball", "princess", "princess1",
  "superman", "batman123", "starwars", "trustno1", "trustno1trustno1", "whatever", "computer", "internet", "michelle",
  "jennifer", "jordan23", "liverpool", "chocolate", "butterfly", "passion1", "master123", "monkey123", "dragon123",
  "shadow123", "charlie1", "freedom1", "qazwsxedc", "administrator", "changeme", "changeme1", "changemechangeme",
  "correcthorsebatterystaple",
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
