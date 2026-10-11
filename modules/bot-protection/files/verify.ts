// SPDX-License-Identifier: Apache-2.0
// Server-side captcha token verification for Cloudflare Turnstile, hCaptcha and Google reCAPTCHA v2/v3.
// Calls each provider's documented siteverify endpoint with a form-encoded POST through an injected fetch.
// The secret is only ever placed in that request body: it is never logged, returned or put in an error.
import { BotProtectionError } from "./crypto.js";

export type CaptchaProvider = "turnstile" | "hcaptcha" | "recaptcha";

export const SITEVERIFY_URLS: Readonly<Record<CaptchaProvider, string>> = Object.freeze({
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
});

/** Default form field each provider's widget adds to the form. */
export const TOKEN_FIELDS: Readonly<Record<CaptchaProvider, string>> = Object.freeze({
  turnstile: "cf-turnstile-response",
  hcaptcha: "h-captcha-response",
  recaptcha: "g-recaptcha-response",
});

/**
 * Stable reasons a token is refused:
 * missing-token, invalid-token, expired-or-duplicate, invalid-secret, bad-request, hostname-mismatch,
 * action-mismatch, low-score, stale, invalid-timestamp, rejected, provider-error, unavailable.
 */
export type CaptchaReason =
  | "missing-token" | "invalid-token" | "expired-or-duplicate" | "invalid-secret" | "bad-request"
  | "hostname-mismatch" | "action-mismatch" | "low-score" | "stale" | "invalid-timestamp"
  | "rejected" | "provider-error" | "unavailable";

export interface CaptchaResult {
  readonly ok: boolean;
  readonly reasons: readonly CaptchaReason[];
  /** True only when failOpen let a request through because the provider could not be reached. */
  readonly failedOpen?: boolean;
  readonly hostname?: string;
  readonly action?: string;
  /** reCAPTCHA v3 score (1.0 likely human, 0.0 likely bot). */
  readonly score?: number;
}

export interface CaptchaVerifierOptions {
  readonly provider: CaptchaProvider;
  /** Provider secret key, read by your app from its own secret store. Never logged or echoed. */
  readonly secret: string;
  /** Injected fetch (globalThis.fetch in production, a fake in tests). */
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** Hostnames the widget may be served on; the provider's `hostname` must match one (case-insensitive). */
  readonly expectedHostnames: readonly string[];
  /** Turnstile and reCAPTCHA v3 only: the `action` the widget was rendered with. */
  readonly expectedAction?: string;
  /** reCAPTCHA v3 only: lowest accepted score, 0-1. Default 0.5. Ignored for v2 responses without a score. */
  readonly minScore?: number;
  /** Largest accepted age of `challenge_ts`. Default 5 minutes. */
  readonly maxAgeMs?: number;
  /** Abort the siteverify call after this long. Default 10 seconds. */
  readonly timeoutMs?: number;
  /**
   * RISKY. When the provider cannot be reached (network error, timeout, non-2xx, unparseable reply), let the
   * request through with `{ ok: true, failedOpen: true, reasons: ["unavailable"] }` instead of refusing it.
   * Bots can then pass during any provider outage. Default false (fail closed).
   */
  readonly failOpen?: boolean;
  /** Clock in epoch milliseconds. Default Date.now. */
  readonly now?: () => number;
  /** Largest token accepted before any network call. Default 4096 characters. */
  readonly maxTokenLength?: number;
}

export interface VerifyTokenOptions {
  /** The visitor's IP from trusted server context; never from a client-supplied header you do not control. */
  readonly remoteIp?: string;
  /** Turnstile only: a UUID that makes retries of the same verification idempotent. Ignored for other providers. */
  readonly idempotencyKey?: string;
}

export interface CaptchaVerifier {
  readonly provider: CaptchaProvider;
  readonly tokenField: string;
  verify(token: unknown, options?: VerifyTokenOptions): Promise<CaptchaResult>;
}

const ERROR_CODES: Readonly<Record<string, CaptchaReason>> = {
  "missing-input-secret": "invalid-secret",
  "invalid-input-secret": "invalid-secret",
  "sitekey-secret-mismatch": "invalid-secret",
  "missing-input-response": "missing-token",
  "invalid-input-response": "invalid-token",
  "invalid-or-already-seen-response": "expired-or-duplicate",
  "already-seen-response": "expired-or-duplicate",
  "expired-input-response": "expired-or-duplicate",
  "timeout-or-duplicate": "expired-or-duplicate",
  "bad-request": "bad-request",
  "missing-remoteip": "bad-request",
  "invalid-remoteip": "bad-request",
  "browser-error": "invalid-token",
  "internal-error": "unavailable",
};

/** Map one provider error code to a stable reason; unknown codes become provider-error. */
export function mapProviderError(code: string): CaptchaReason {
  return Object.hasOwn(ERROR_CODES, code) ? ERROR_CODES[code] as CaptchaReason : "provider-error";
}

const fail = (...reasons: CaptchaReason[]): CaptchaResult => ({ ok: false, reasons: [...new Set(reasons)] });

export function createCaptchaVerifier(options: CaptchaVerifierOptions): CaptchaVerifier {
  const { provider } = options;
  if (!Object.hasOwn(SITEVERIFY_URLS, provider)) throw new BotProtectionError("invalid-config", "provider must be turnstile, hcaptcha or recaptcha");
  if (typeof options.secret !== "string" || options.secret.length === 0 || options.secret.length > 1024) {
    throw new BotProtectionError("invalid-config", "secret must be a non-empty string");
  }
  if (typeof options.fetch !== "function") throw new BotProtectionError("invalid-config", "fetch must be a function");
  const hosts = new Set((Array.isArray(options.expectedHostnames) ? options.expectedHostnames : []).map(host => String(host).toLowerCase()));
  if (hosts.size === 0) throw new BotProtectionError("invalid-config", "expectedHostnames must list at least one hostname");
  if (options.expectedAction !== undefined && provider === "hcaptcha") {
    throw new BotProtectionError("invalid-config", "hCaptcha responses carry no action; remove expectedAction");
  }
  const minScore = options.minScore ?? 0.5;
  if (!(minScore >= 0 && minScore <= 1)) throw new BotProtectionError("invalid-config", "minScore must be between 0 and 1");
  const maxAge = options.maxAgeMs ?? 5 * 60_000;
  const timeout = options.timeoutMs ?? 10_000;
  const maxToken = options.maxTokenLength ?? 4096;
  if (!(maxAge > 0) || !(timeout > 0) || !(maxToken > 0)) throw new BotProtectionError("invalid-config", "maxAgeMs, timeoutMs and maxTokenLength must be positive");
  const now = options.now ?? Date.now;
  const secret = options.secret;
  const doFetch = options.fetch;
  const failOpen = options.failOpen === true;
  const unavailable = (): CaptchaResult => failOpen ? { ok: true, failedOpen: true, reasons: ["unavailable"] } : fail("unavailable");

  async function verify(token: unknown, call: VerifyTokenOptions = {}): Promise<CaptchaResult> {
    if (typeof token !== "string" || token.length === 0) return fail("missing-token");
    if (token.length > maxToken) return fail("invalid-token");
    const body = new URLSearchParams({ secret, response: token });
    if (call.remoteIp) body.set("remoteip", call.remoteIp);
    if (provider === "turnstile" && call.idempotencyKey) body.set("idempotency_key", call.idempotencyKey);

    let data: Record<string, unknown>;
    try {
      const response = await doFetch(SITEVERIFY_URLS[provider], {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) return unavailable();
      const parsed: unknown = JSON.parse(await response.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { success?: unknown }).success !== "boolean") {
        return unavailable();
      }
      data = parsed as Record<string, unknown>;
    } catch {
      // Network error, timeout or unparseable JSON. The error is dropped so nothing from the request is echoed.
      return unavailable();
    }

    const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].filter((c): c is string => typeof c === "string") : [];
    if (data.success !== true) {
      const reasons = codes.map(mapProviderError);
      return fail(...(reasons.length ? reasons : ["rejected" as const]));
    }

    const reasons: CaptchaReason[] = [];
    const hostname = typeof data.hostname === "string" ? data.hostname : undefined;
    if (!hostname || !hosts.has(hostname.toLowerCase())) reasons.push("hostname-mismatch");
    const action = typeof data.action === "string" ? data.action : undefined;
    if (options.expectedAction !== undefined && action !== options.expectedAction) reasons.push("action-mismatch");
    const score = typeof data.score === "number" ? data.score : undefined;
    if (provider === "recaptcha" && score !== undefined && !(score >= minScore)) reasons.push("low-score");
    const issued = typeof data.challenge_ts === "string" ? Date.parse(data.challenge_ts) : Number.NaN;
    // A timestamp more than a minute in the future is as untrustworthy as a missing one.
    if (Number.isNaN(issued) || issued - now() > 60_000) reasons.push("invalid-timestamp");
    else if (now() - issued > maxAge) reasons.push("stale");

    const detail = {
      ...(hostname === undefined ? {} : { hostname }),
      ...(action === undefined ? {} : { action }),
      ...(score === undefined || provider !== "recaptcha" ? {} : { score }),
    };
    return reasons.length ? { ...fail(...reasons), ...detail } : { ok: true, reasons: [], ...detail };
  }

  return { provider, tokenField: TOKEN_FIELDS[provider], verify };
}
