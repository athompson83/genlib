// SPDX-License-Identifier: Apache-2.0
// Read the exact request body bytes with a hard size cap, before any JSON parsing.

export type RawBodyResult =
  | { ok: true; body: Uint8Array }
  | { ok: false; reason: "too-large" | "unreadable" };

const MAX_LIMIT = 64 * 1024 * 1024;

/**
 * Streams `request.body`, stopping and cancelling as soon as more than `maxBytes` arrive.
 * A declared Content-Length above the cap is rejected without reading. Never throws on request input;
 * an invalid `maxBytes` (1 to 67108864) throws a TypeError because it is configuration.
 */
export async function readRawBody(request: Request, maxBytes: number): Promise<RawBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_LIMIT) {
    throw new TypeError("readRawBody maxBytes must be an integer from 1 to 67108864.");
  }
  let declared: string | null = null;
  try {
    declared = request.headers.get("content-length");
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (declared !== null) {
    if (!/^\d{1,16}$/.test(declared.trim())) return cancel(request, "unreadable");
    if (Number(declared.trim()) > maxBytes) return cancel(request, "too-large");
  }
  if (request.bodyUsed) return { ok: false, reason: "unreadable" };
  const stream = request.body;
  if (stream === null) return { ok: true, body: new Uint8Array(0) };
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = stream.getReader();
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "unreadable" };
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { ok: true, body };
}

async function cancel(request: Request, reason: "too-large" | "unreadable"): Promise<RawBodyResult> {
  try {
    if (request.body && !request.bodyUsed) await request.body.cancel();
  } catch { /* ignore */ }
  return { ok: false, reason };
}
