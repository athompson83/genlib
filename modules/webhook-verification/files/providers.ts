// SPDX-License-Identifier: Apache-2.0
// Provider signature schemes: GitHub, Stripe, and Standard Webhooks (Svix-compatible).
import {
  concatBytes, configError, decodeBase64, decodeHex64, fail, isPayload, matchesAny, normalizeSecrets, OK, toBytes,
  type SecretInput, type VerifyResult, type WebhookPayload,
} from "./hmac.js";

/** Fetch Headers, or a plain record such as Node's IncomingHttpHeaders (looked up case-insensitively). */
export type HeaderSource = Headers | Readonly<Record<string, string | readonly string[] | undefined>>;

const MAX_HEADER_LENGTH = 4096;
const MAX_SIGNATURES = 20;
const encoder = new TextEncoder();

/** Returns the single header value, null when absent, or false when duplicated/oversized/not a string. */
export function readHeader(headers: HeaderSource, name: string): string | null | false {
  let value: unknown;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    value = headers.get(name);
  } else if (headers && typeof headers === "object") {
    const wanted = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === wanted) { value = (headers as Record<string, unknown>)[key]; break; }
    }
  } else {
    return false;
  }
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === "string" ? check(value[0]) : false;
  return typeof value === "string" ? check(value) : false;
}

function check(value: string): string | false {
  return value.length <= MAX_HEADER_LENGTH && !/[\r\n\0]/.test(value) ? value.trim() : false;
}

function toleranceOf(seconds: number | undefined): number {
  const value = seconds ?? 300;
  if (!Number.isInteger(value) || value < 1 || value > 86_400) throw configError("toleranceSeconds must be 1-86400");
  return value;
}

function nowSeconds(clock: (() => number) | undefined): number {
  const ms = (clock ?? Date.now)();
  if (!Number.isFinite(ms)) throw configError("clock must return epoch milliseconds");
  return Math.floor(ms / 1000);
}

const TIMESTAMP = /^\d{1,12}$/;

export interface GitHubVerifyOptions {
  secret: SecretInput;
  payload: WebhookPayload;
  headers: HeaderSource;
}

/** GitHub: `X-Hub-Signature-256: sha256=<hex>` over the raw body. GitHub sends no timestamp; dedupe on X-GitHub-Delivery. */
export async function verifyGitHubWebhook(options: GitHubVerifyOptions): Promise<VerifyResult> {
  const keys = normalizeSecrets(options.secret);
  const header = readHeader(options.headers, "x-hub-signature-256");
  if (header === null) return fail("missing-header");
  if (header === false || !isPayload(options.payload) || !header.startsWith("sha256=")) return fail("malformed");
  const signature = decodeHex64(header.slice(7));
  if (!signature) return fail("malformed");
  return await matchesAny(keys, toBytes(options.payload), [signature]) ? OK : fail("mismatch");
}

export interface TimestampedVerifyOptions {
  secret: SecretInput;
  payload: WebhookPayload;
  headers: HeaderSource;
  /** Maximum allowed clock difference in either direction. Default 300; 1-86400. */
  toleranceSeconds?: number;
  /** Epoch milliseconds; defaults to Date.now. Inject for tests. */
  clock?: () => number;
}

/** Stripe: `Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...]`, signed content `${t}.${body}`. v0 entries are ignored. */
export async function verifyStripeWebhook(options: TimestampedVerifyOptions): Promise<VerifyResult> {
  const keys = normalizeSecrets(options.secret);
  const tolerance = toleranceOf(options.toleranceSeconds);
  const header = readHeader(options.headers, "stripe-signature");
  if (header === null) return fail("missing-header");
  if (header === false || !isPayload(options.payload)) return fail("malformed");
  let timestamp: string | undefined;
  const signatures: Uint8Array[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 1) return fail("malformed");
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") {
      if (timestamp !== undefined || !TIMESTAMP.test(value)) return fail("malformed");
      timestamp = value;
    } else if (key === "v1") {
      const signature = decodeHex64(value);
      if (!signature) return fail("malformed");
      if (signatures.length >= MAX_SIGNATURES) return fail("malformed");
      signatures.push(signature);
    }
  }
  if (timestamp === undefined || signatures.length === 0) return fail("malformed");
  const signed = concatBytes(encoder.encode(timestamp + "."), toBytes(options.payload));
  if (!(await matchesAny(keys, signed, signatures))) return fail("mismatch");
  return Math.abs(nowSeconds(options.clock) - Number(timestamp)) > tolerance ? fail("expired") : OK;
}

function decodeStandardSecret(secret: string): Uint8Array | null {
  const bytes = decodeBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  return bytes && bytes.byteLength >= 16 && bytes.byteLength <= 128 ? bytes : null;
}

/**
 * Standard Webhooks (also Svix): `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64> [v1,<base64>...]`.
 * `svix-*` header names are accepted when `webhook-*` headers are absent. String secrets are `whsec_<base64>`.
 */
export async function verifyStandardWebhook(options: TimestampedVerifyOptions): Promise<VerifyResult> {
  const keys = normalizeSecrets(options.secret, decodeStandardSecret);
  const tolerance = toleranceOf(options.toleranceSeconds);
  const prefix = readHeader(options.headers, "webhook-signature") === null &&
    readHeader(options.headers, "svix-signature") !== null ? "svix-" : "webhook-";
  const id = readHeader(options.headers, prefix + "id");
  const timestamp = readHeader(options.headers, prefix + "timestamp");
  const signatureHeader = readHeader(options.headers, prefix + "signature");
  if (id === null || timestamp === null || signatureHeader === null) return fail("missing-header");
  if (id === false || timestamp === false || signatureHeader === false || !isPayload(options.payload)) return fail("malformed");
  if (!/^[\x21-\x7e]{1,256}$/.test(id) || !TIMESTAMP.test(timestamp)) return fail("malformed");
  const signatures: Uint8Array[] = [];
  const entries = signatureHeader.split(" ").filter(entry => entry.length > 0);
  if (entries.length > MAX_SIGNATURES) return fail("malformed");
  for (const entry of entries) {
    const comma = entry.indexOf(",");
    if (comma < 1) return fail("malformed");
    if (entry.slice(0, comma) !== "v1") continue; // e.g. asymmetric v1a signatures are not handled here
    const signature = decodeBase64(entry.slice(comma + 1));
    if (!signature || signature.byteLength !== 32) return fail("malformed");
    signatures.push(signature);
  }
  if (signatures.length === 0) return fail("malformed");
  const signed = concatBytes(encoder.encode(`${id}.${timestamp}.`), toBytes(options.payload));
  if (!(await matchesAny(keys, signed, signatures))) return fail("mismatch");
  return Math.abs(nowSeconds(options.clock) - Number(timestamp)) > tolerance ? fail("expired") : OK;
}
