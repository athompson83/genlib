// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 6350 vCard 4.0 export for "save contact" downloads (.vcf) and address-book feeds.
// Original source; copy and adapt. Lines end with CRLF and are folded at 75 octets without splitting a
// UTF-8 character. Text values are escaped; control characters other than newline, invalid emails, phones,
// URLs and TYPE parameters throw RangeError. Serve with Content-Type: text/vcard; charset=utf-8.

export interface VcardTyped { value: string; type?: string }
export interface VcardName { family?: string; given?: string; additional?: string; prefix?: string; suffix?: string }
export interface VcardAddress {
  type?: string; poBox?: string; extended?: string; street?: string; locality?: string;
  region?: string; postalCode?: string; country?: string;
}
export interface VcardContact {
  fn: string; n?: VcardName; org?: string; title?: string; emails?: VcardTyped[]; phones?: VcardTyped[];
  address?: VcardAddress; urls?: string[]; note?: string; uid?: string;
}

const CONTROL = /[\x00-\x09\x0b-\x1f\x7f]/;
const TYPE = /^[a-z][a-z0-9-]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const TEL = /^\+?[0-9][0-9 ().-]{1,30}$/;
const URL_RE = /^https?:\/\/\S+$/;
const N_KEYS = ["family", "given", "additional", "prefix", "suffix"] as const;
const ADR_KEYS = ["poBox", "extended", "street", "locality", "region", "postalCode", "country"] as const;

function esc(value: unknown): string {
  if (typeof value !== "string") throw new RangeError("vCard text values must be strings");
  if (CONTROL.test(value)) throw new RangeError("control characters are not allowed in vCard text");
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function typeParam(type: string | undefined): string {
  if (type === undefined) return "";
  if (typeof type !== "string" || !TYPE.test(type)) throw new RangeError("TYPE must match [a-z][a-z0-9-]*");
  return `;TYPE=${type}`;
}

function checked(re: RegExp, value: unknown, what: string): string {
  if (typeof value !== "string" || !re.test(value)) throw new RangeError(`invalid ${what}: ${JSON.stringify(value)}`);
  return value;
}

function fold(line: string): string {
  const data = new TextEncoder().encode(line), decoder = new TextDecoder();
  const parts: string[] = [];
  let start = 0, limit = 75;
  while (data.length - start > limit) {
    let end = start + limit;
    while (((data[end] ?? 0) & 0xc0) === 0x80) end--; // never split a UTF-8 sequence
    parts.push(decoder.decode(data.subarray(start, end)));
    start = end; limit = 74;
  }
  parts.push(decoder.decode(data.subarray(start)));
  return parts.join("\r\n ") + "\r\n";
}

export function buildVcard(contact: VcardContact): string {
  if (typeof contact.fn !== "string" || contact.fn.trim() === "") throw new RangeError("fn is required and must not be blank");
  const lines = ["BEGIN:VCARD", "VERSION:4.0", `FN:${esc(contact.fn)}`];
  const n = contact.n;
  if (n !== undefined) lines.push(`N:${N_KEYS.map((k) => esc(n[k] ?? "")).join(";")}`);
  if (contact.org) lines.push(`ORG:${esc(contact.org)}`);
  if (contact.title) lines.push(`TITLE:${esc(contact.title)}`);
  for (const e of contact.emails ?? []) lines.push(`EMAIL${typeParam(e.type)}:${esc(checked(EMAIL, e.value, "email"))}`);
  for (const p of contact.phones ?? []) lines.push(`TEL${typeParam(p.type)}:${checked(TEL, p.value, "phone")}`);
  const a = contact.address;
  if (a !== undefined) lines.push(`ADR${typeParam(a.type)}:${ADR_KEYS.map((k) => esc(a[k] ?? "")).join(";")}`);
  for (const u of contact.urls ?? []) lines.push(`URL:${checked(URL_RE, u, "url")}`);
  if (contact.note) lines.push(`NOTE:${esc(contact.note)}`);
  if (contact.uid) lines.push(`UID:${esc(contact.uid)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("");
}
