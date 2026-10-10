// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: sign and verify Stripe-style webhook headers (t=<ts>,v1=<hex HMAC-SHA256>). Original source; copy and adapt.
// Uses Web Crypto HMAC (globalThis.crypto.subtle); no hashing is hand-rolled. Verify the RAW body
// bytes before JSON parsing, keep the tolerance small, dedupe event ids to stop replays inside the
// window, and rotate secrets by sending several v1 values during the overlap.

export type WebhookErrorCode = "malformed" | "bad signature" | "expired";

export class WebhookSignatureError extends Error {
  constructor(readonly code: WebhookErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "WebhookSignatureError";
  }
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, timestamp: number, body: string | Uint8Array): Promise<string> {
  if (typeof secret !== "string" || secret.length === 0) throw new RangeError("secret must be a non-empty string");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto (crypto.subtle) is not available in this runtime");
  const prefix = encoder.encode(`${timestamp}.`);
  const bytes = typeof body === "string" ? encoder.encode(body) : body;
  const message = new Uint8Array(prefix.length + bytes.length);
  message.set(prefix);
  message.set(bytes, prefix.length);
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", key, message));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

function checkSeconds(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer of unix seconds`);
}

/** Header value `t=<ts>,v1=<lowercase hex HMAC-SHA256(secret, "<ts>.<body>")>`. */
export async function signWebhook(secret: string, timestampSeconds: number, body: string | Uint8Array): Promise<string> {
  checkSeconds(timestampSeconds, "timestampSeconds");
  return `t=${timestampSeconds},v1=${await hmacHex(secret, timestampSeconds, body)}`;
}

function parseHeader(header: string): { t: number; v1: string[] } {
  if (typeof header !== "string") throw new WebhookSignatureError("malformed", "header must be a string");
  let t: number | undefined;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) throw new WebhookSignatureError("malformed", "expected comma-separated key=value pairs");
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      if (t !== undefined) throw new WebhookSignatureError("malformed", "more than one t");
      if (!/^\d{1,15}$/.test(value)) throw new WebhookSignatureError("malformed", "t must be decimal seconds");
      t = Number(value);
    } else if (key === "v1") {
      if (!/^[0-9a-f]{64}$/.test(value)) throw new WebhookSignatureError("malformed", "v1 must be 64 lowercase hex characters");
      v1.push(value);
    }
  }
  if (t === undefined) throw new WebhookSignatureError("malformed", "missing t");
  if (v1.length === 0) throw new WebhookSignatureError("malformed", "missing v1");
  return { t, v1 };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Resolves when any v1 matches (constant-time compare) and |now - t| <= toleranceSeconds.
 * Throws WebhookSignatureError with code "malformed", "bad signature" or "expired".
 */
export async function verifyWebhook(header: string, body: string | Uint8Array, secret: string, nowSeconds: number, toleranceSeconds = 300): Promise<void> {
  checkSeconds(nowSeconds, "nowSeconds");
  checkSeconds(toleranceSeconds, "toleranceSeconds");
  const { t, v1 } = parseHeader(header);
  const expected = await hmacHex(secret, t, body);
  let matched = false;
  for (const candidate of v1) if (constantTimeEqual(candidate, expected)) matched = true;
  if (!matched) throw new WebhookSignatureError("bad signature");
  if (Math.abs(nowSeconds - t) > toleranceSeconds) throw new WebhookSignatureError("expired");
}
