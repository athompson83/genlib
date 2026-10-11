// SPDX-License-Identifier: Apache-2.0
// Standard Webhooks signing (https://www.standardwebhooks.com): HMAC-SHA256 over `${id}.${timestamp}.${body}` with the
// base64-decoded `whsec_` secret, sent as `webhook-signature: v1,<base64>`, one entry per active secret during
// rotation. Receivers can verify with the webhook-verification module's verifyStandardWebhook. Web Crypto only.

const encoder = new TextEncoder();
const MAX_SECRETS = 10;

export interface SignInput {
  /** The delivery id sent as webhook-id; printable ASCII without spaces, 1-256 characters. */
  readonly id: string;
  /** Unix seconds sent as webhook-timestamp. */
  readonly timestamp: number;
  /** The exact request body. */
  readonly body: string;
  /** Active secrets as `whsec_<base64>`; each produces one v1 signature. */
  readonly secrets: readonly string[];
}

export interface SignedHeaders {
  readonly "webhook-id": string;
  readonly "webhook-timestamp": string;
  readonly "webhook-signature": string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Decodes `whsec_<base64>` to key bytes (16-128 bytes); throws a TypeError that never echoes the secret. */
export function decodeWebhookSecret(secret: string): Uint8Array<ArrayBuffer> {
  const body = typeof secret === "string" && secret.startsWith("whsec_") ? secret.slice(6) : "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0) throw new TypeError("Webhook secret is malformed.");
  const binary = atob(body);
  if (binary.length < 16 || binary.length > 128) throw new TypeError("Webhook secret is malformed.");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** A new `whsec_` secret with 32 random bytes from Web Crypto. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "whsec_" + toBase64(bytes);
}

/** Returns the three Standard Webhooks headers for one delivery attempt. */
export async function signWebhook(input: SignInput): Promise<SignedHeaders> {
  if (typeof input.id !== "string" || !/^[\x21-\x7e]{1,256}$/.test(input.id)) throw new TypeError("Webhook id is invalid.");
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp < 0) throw new TypeError("Webhook timestamp is invalid.");
  if (typeof input.body !== "string") throw new TypeError("Webhook body must be a string.");
  if (!Array.isArray(input.secrets) || input.secrets.length === 0 || input.secrets.length > MAX_SECRETS) {
    throw new TypeError(`Provide 1-${MAX_SECRETS} webhook secrets.`);
  }
  const timestamp = String(input.timestamp);
  const content = encoder.encode(`${input.id}.${timestamp}.${input.body}`);
  const signatures: string[] = [];
  for (const secret of input.secrets) {
    const key = await crypto.subtle.importKey("raw", decodeWebhookSecret(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    signatures.push("v1," + toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, content))));
  }
  return { "webhook-id": input.id, "webhook-timestamp": timestamp, "webhook-signature": signatures.join(" ") };
}
