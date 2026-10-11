// SPDX-License-Identifier: Apache-2.0
// Combine the captcha, proof-of-work and honeypot checks for one form. Create one guard per form
// (signup, login, contact) so the form id comes from your server code, never from the request.
// Order: honeypot (free), proof of work (local hashing, then single-use consume), captcha (network).
// The first failing stage stops the check, so a bot that trips the honeypot costs no siteverify call.
import { assertFormId } from "./crypto.js";
import type { ReplayStore } from "./memory-store.js";
import type { Honeypot } from "./honeypot.js";
import type { Pow } from "./pow.js";
import type { CaptchaVerifier } from "./verify.js";

export interface BotGuardOptions {
  /** Server-chosen form id that challenges and honeypot tokens were issued for. */
  readonly formId: string;
  /** Replay store for proof-of-work challenges. */
  readonly store: ReplayStore;
  readonly provider?: CaptchaVerifier | { readonly verifier: CaptchaVerifier; readonly field?: string };
  readonly pow?: Pow | { readonly pow: Pow; readonly field?: string };
  readonly honeypot?: Honeypot;
  /** The visitor IP from trusted infrastructure (your proxy's verified header or socket address). Optional. */
  readonly clientIp?: (request: Request) => string | undefined;
}

export interface BotCheckResult {
  readonly ok: boolean;
  /** Stage-prefixed reasons for your server logs only; never send them to the client. */
  readonly reasons: readonly string[];
  /** True when the captcha stage passed only because failOpen allowed a provider outage. */
  readonly failedOpen?: boolean;
}

export interface BotGuard {
  readonly formId: string;
  check(request: Request, formData: Readonly<Record<string, unknown>>): Promise<BotCheckResult>;
}

export function createBotGuard(options: BotGuardOptions): BotGuard {
  assertFormId(options.formId);
  if (!options.store || typeof options.store.consume !== "function") throw new TypeError("store must implement ReplayStore");
  const formId = options.formId;
  const provider = options.provider === undefined ? undefined
    : "verifier" in options.provider ? { verifier: options.provider.verifier, field: options.provider.field ?? options.provider.verifier.tokenField }
    : { verifier: options.provider, field: options.provider.tokenField };
  const pow = options.pow === undefined ? undefined
    : "pow" in options.pow ? { pow: options.pow.pow, field: options.pow.field ?? "pow" } : { pow: options.pow, field: "pow" };
  if (!provider && !pow && !options.honeypot) throw new TypeError("Configure at least one of provider, pow or honeypot");

  async function check(request: Request, formData: Readonly<Record<string, unknown>>): Promise<BotCheckResult> {
    if (options.honeypot) {
      const result = await options.honeypot.check(formData, formId);
      if (!result.ok) return { ok: false, reasons: result.reasons.map(r => `honeypot:${r}`) };
    }
    if (pow) {
      const result = await pow.pow.verify(formData[pow.field], { formId, store: options.store });
      if (!result.ok) return { ok: false, reasons: result.reasons.map(r => `pow:${r}`) };
    }
    if (provider) {
      const remoteIp = options.clientIp?.(request);
      const result = await provider.verifier.verify(formData[provider.field], remoteIp ? { remoteIp } : {});
      if (!result.ok) return { ok: false, reasons: result.reasons.map(r => `captcha:${r}`) };
      if (result.failedOpen) return { ok: true, reasons: ["captcha:unavailable"], failedOpen: true };
    }
    return { ok: true, reasons: [] };
  }

  return { formId, check };
}
