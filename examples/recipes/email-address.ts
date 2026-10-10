// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: WHATWG HTML "valid e-mail address" check and normalization. Original source; copy and adapt.
// Syntax only, matching what <input type="email"> accepts (so "a@b" and "user.@example.com" pass and
// non-ASCII addresses fail). It cannot prove a mailbox exists or belongs to the user: confirm ownership
// with a single-use link sent to the address before trusting it.

const LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
const EMAIL = new RegExp(`^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@${LABEL}(?:\\.${LABEL})*$`);

/** True for a WHATWG-valid address of at most 254 characters with a local part of at most 64. */
export function emailValid(s: string): boolean {
  if (typeof s !== "string" || s.length > 254 || !EMAIL.test(s)) return false;
  return s.indexOf("@") <= 64;
}

/** Trims ASCII whitespace, validates, lowercases the domain and keeps the local part's case. */
export function emailNormalize(s: string): string {
  if (typeof s !== "string") throw new TypeError("email must be a string");
  const t = s.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, "");
  if (!emailValid(t)) throw new RangeError("invalid email address");
  const at = t.indexOf("@");
  return t.slice(0, at) + "@" + t.slice(at + 1).toLowerCase();
}
