// SPDX-License-Identifier: Apache-2.0
// Honeypot and minimum fill time. Render a visually hidden field that people leave empty and a signed
// timestamp token issued when the form was rendered. A filled honeypot or a submission faster than
// minFillMs is treated as a bot. The token is HMAC-SHA-256(key, "honeypot|<formId>|<issuedAt>").
import { assertFormId, BotProtectionError, hmacHex, importHmacKey, keyBytes, timingSafeEqualText } from "./crypto.js";

export type HoneypotReason = "honeypot-filled" | "form-token-missing" | "form-token-invalid" | "form-token-expired" | "too-fast";

export interface HoneypotResult {
  readonly ok: boolean;
  readonly reasons: readonly HoneypotReason[];
}

export interface HoneypotOptions {
  /** Server HMAC key, at least 32 bytes. Use a different key from the proof-of-work key. */
  readonly key: string | Uint8Array;
  /** Hidden field name. Pick something a bot would fill, such as "website". Default "website". */
  readonly fieldName?: string;
  /** Field that carries the signed render timestamp. Default "form_ts". */
  readonly tokenField?: string;
  /** Fastest plausible human submission. Default 3 seconds. */
  readonly minFillMs?: number;
  /** Oldest accepted token. Default 24 hours. */
  readonly maxAgeMs?: number;
  /** Clock in epoch milliseconds. Default Date.now. */
  readonly now?: () => number;
}

export interface HoneypotFields {
  readonly fieldName: string;
  readonly tokenField: string;
  readonly token: string;
}

export interface Honeypot {
  readonly fieldName: string;
  readonly tokenField: string;
  /** Call when rendering the form; put `token` in a hidden input named `tokenField`. */
  issue(formId: string): Promise<HoneypotFields>;
  check(fields: Readonly<Record<string, unknown>>, formId: string): Promise<HoneypotResult>;
}

const FIELD = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const TOKEN = /^(\d{1,16})\.([0-9a-f]{64})$/;

export function createHoneypot(options: HoneypotOptions): Honeypot {
  const key = importHmacKey(keyBytes(options.key, "Honeypot key"));
  const fieldName = options.fieldName ?? "website";
  const tokenField = options.tokenField ?? "form_ts";
  if (!FIELD.test(fieldName) || !FIELD.test(tokenField) || fieldName === tokenField) {
    throw new BotProtectionError("invalid-config", "fieldName and tokenField must be distinct simple field names");
  }
  const minFill = options.minFillMs ?? 3000;
  const maxAge = options.maxAgeMs ?? 86_400_000;
  if (!(minFill >= 0) || !(maxAge > minFill)) throw new BotProtectionError("invalid-config", "minFillMs must be >= 0 and below maxAgeMs");
  const now = options.now ?? Date.now;
  const sign = async (formId: string, issuedAt: string) => hmacHex(await key, `honeypot|${formId}|${issuedAt}`);

  async function issue(formId: string): Promise<HoneypotFields> {
    assertFormId(formId);
    const issuedAt = String(now());
    return { fieldName, tokenField, token: `${issuedAt}.${await sign(formId, issuedAt)}` };
  }

  async function check(fields: Readonly<Record<string, unknown>>, formId: string): Promise<HoneypotResult> {
    assertFormId(formId);
    const trap = fields[fieldName];
    if (trap !== undefined && trap !== null && trap !== "") return { ok: false, reasons: ["honeypot-filled"] };
    const raw = fields[tokenField];
    if (typeof raw !== "string" || raw === "") return { ok: false, reasons: ["form-token-missing"] };
    const match = TOKEN.exec(raw);
    if (!match) return { ok: false, reasons: ["form-token-invalid"] };
    const issuedAt = match[1] ?? "";
    if (!timingSafeEqualText(await sign(formId, issuedAt), match[2] ?? "")) return { ok: false, reasons: ["form-token-invalid"] };
    const elapsed = now() - Number(issuedAt);
    if (elapsed < minFill) return { ok: false, reasons: ["too-fast"] };
    if (elapsed > maxAge) return { ok: false, reasons: ["form-token-expired"] };
    return { ok: true, reasons: [] };
  }

  return { fieldName, tokenField, issue, check };
}
