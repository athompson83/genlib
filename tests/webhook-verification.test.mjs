// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { timingSafeEqual, verifyHmacSha256 } from "../.build/modules/webhook-verification/files/hmac.js";
import {
  verifyGitHubWebhook, verifyStandardWebhook, verifyStripeWebhook,
} from "../.build/modules/webhook-verification/files/providers.js";
import { readRawBody } from "../.build/modules/webhook-verification/files/raw-body.js";

// Expected signatures are computed independently with node:crypto, not with the module under test.
const hmacHex = (key, data) => createHmac("sha256", key).update(data).digest("hex");
const hmacB64 = (key, data) => createHmac("sha256", key).update(data).digest("base64");
const body = '{"id":"evt_1","amount":1200,"note":"café"}';
const bytes = new TextEncoder().encode(body);
const secret = "test-webhook-secret-DO-NOT-LOG";
const reasons = new Set(["missing-header", "malformed", "expired", "mismatch"]);
const noLeak = result => {
  assert.ok(result.ok || reasons.has(result.reason));
  assert.ok(!JSON.stringify(result).includes(secret));
};

test("generic HMAC verifies raw bytes and rejects tampering, wrong secret, and malformed input", async () => {
  const sig = hmacHex(secret, body);
  assert.deepEqual(await verifyHmacSha256({ secret, payload: bytes, signatureHex: sig }), { ok: true });
  assert.deepEqual(await verifyHmacSha256({ secret, payload: body, signatureHex: sig.toUpperCase() }), { ok: true });
  assert.deepEqual(await verifyHmacSha256({ secret, payload: bytes.buffer, signatureHex: sig }), { ok: true });
  const tampered = body.replace("1200", "1201");
  assert.deepEqual(await verifyHmacSha256({ secret, payload: tampered, signatureHex: sig }), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyHmacSha256({ secret: "other-secret", payload: body, signatureHex: sig }), { ok: false, reason: "mismatch" });
  // Re-serialized JSON is not the raw body.
  const reparsed = JSON.stringify(JSON.parse(body), null, 1);
  assert.equal((await verifyHmacSha256({ secret, payload: reparsed, signatureHex: sig })).ok, false);
  for (const bad of ["zz", sig.slice(0, 63), sig + "00", "g".repeat(64)]) {
    const result = await verifyHmacSha256({ secret, payload: body, signatureHex: bad });
    assert.deepEqual(result, { ok: false, reason: "malformed" });
  }
  assert.deepEqual(await verifyHmacSha256({ secret, payload: body, signatureHex: undefined }), { ok: false, reason: "missing-header" });
  assert.deepEqual(await verifyHmacSha256({ secret, payload: 42, signatureHex: sig }), { ok: false, reason: "malformed" });
});

test("secret rotation accepts any configured secret; invalid secret configuration throws without echoing", async () => {
  const sig = hmacHex("old-secret", body);
  assert.deepEqual(await verifyHmacSha256({ secret: [secret, "old-secret"], payload: body, signatureHex: sig }), { ok: true });
  assert.deepEqual(await verifyHmacSha256({ secret: [secret], payload: body, signatureHex: sig }), { ok: false, reason: "mismatch" });
  const binaryKey = randomBytes(32);
  assert.deepEqual(await verifyHmacSha256({ secret: new Uint8Array(binaryKey), payload: body, signatureHex: hmacHex(binaryKey, body) }), { ok: true });
  for (const bad of ["", [], Array(11).fill(secret), [secret, ""], 5]) {
    await assert.rejects(verifyHmacSha256({ secret: bad, payload: body, signatureHex: sig }), error =>
      error instanceof TypeError && !error.message.includes(secret));
  }
});

test("timingSafeEqual compares exact bytes", () => {
  assert.equal(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assert.equal(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 0])), false);
});

test("GitHub X-Hub-Signature-256 with Headers and Node-style records", async () => {
  const header = "sha256=" + hmacHex(secret, bytes);
  assert.deepEqual(await verifyGitHubWebhook({ secret, payload: bytes, headers: new Headers({ "X-Hub-Signature-256": header }) }), { ok: true });
  assert.deepEqual(await verifyGitHubWebhook({ secret, payload: bytes, headers: { "x-hub-signature-256": header } }), { ok: true });
  assert.deepEqual(await verifyGitHubWebhook({ secret, payload: bytes, headers: { "X-Hub-Signature-256": [header] } }), { ok: true });
  assert.deepEqual(await verifyGitHubWebhook({ secret, payload: body + " ", headers: { "x-hub-signature-256": header } }), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyGitHubWebhook({ secret: "wrong", payload: bytes, headers: { "x-hub-signature-256": header } }), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyGitHubWebhook({ secret, payload: bytes, headers: {} }), { ok: false, reason: "missing-header" });
  for (const bad of ["sha1=" + hmacHex(secret, bytes), hmacHex(secret, bytes), "sha256=xyz", [header, header], "sha256=" + "a".repeat(5000)]) {
    const result = await verifyGitHubWebhook({ secret, payload: bytes, headers: { "x-hub-signature-256": bad } });
    assert.deepEqual(result, { ok: false, reason: "malformed" });
    noLeak(result);
  }
});

test("Stripe-Signature: multiple v1, tolerance in both directions, rotation, malformed headers", async () => {
  const t = 1_760_000_000;
  const clock = () => t * 1000 + 1500;
  const sign = (key, ts = t, payload = body) => hmacHex(key, `${ts}.${payload}`);
  const verify = (header, extra = {}) => verifyStripeWebhook({ secret, payload: bytes, headers: { "stripe-signature": header }, clock, ...extra });

  assert.deepEqual(await verify(`t=${t},v1=${sign(secret)}`), { ok: true });
  assert.deepEqual(await verify(`t=${t},v1=${"0".repeat(64)},v1=${sign(secret)},v0=${"1".repeat(64)}`), { ok: true });
  assert.deepEqual(await verify(`t=${t}, v1=${sign(secret)}`), { ok: true });
  assert.deepEqual(await verify(`t=${t},v1=${sign("rotated-old")}`, { secret: [secret, "rotated-old"] }), { ok: true });
  assert.deepEqual(await verify(`t=${t},v1=${sign("wrong")}`), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verify(`t=${t},v1=${sign(secret, t, body + "x")}`), { ok: false, reason: "mismatch" });
  // Timestamp is part of the signed content.
  assert.deepEqual(await verify(`t=${t + 1},v1=${sign(secret)}`), { ok: false, reason: "mismatch" });

  const old = t - 301;
  assert.deepEqual(await verify(`t=${old},v1=${sign(secret, old)}`), { ok: false, reason: "expired" });
  const future = t + 302;
  assert.deepEqual(await verify(`t=${future},v1=${sign(secret, future)}`), { ok: false, reason: "expired" });
  const edge = t - 299;
  assert.deepEqual(await verify(`t=${edge},v1=${sign(secret, edge)}`), { ok: true });
  assert.deepEqual(await verify(`t=${old},v1=${sign(secret, old)}`, { toleranceSeconds: 600 }), { ok: true });

  assert.deepEqual(await verifyStripeWebhook({ secret, payload: bytes, headers: new Headers(), clock }), { ok: false, reason: "missing-header" });
  for (const bad of [`v1=${sign(secret)}`, `t=${t}`, `t=abc,v1=${sign(secret)}`, `t=${t},t=${t},v1=${sign(secret)}`,
    `t=${t},v1=nothex`, `t=${t},,v1=${sign(secret)}`, "garbage", `t=${t},v1=${sign(secret)}\n`]) {
    const result = await verify(bad);
    assert.deepEqual(result, { ok: false, reason: "malformed" }, bad);
  }
  await assert.rejects(verify(`t=${t},v1=${sign(secret)}`, { toleranceSeconds: 0 }), TypeError);
});

test("Standard Webhooks: whsec secret, multiple signatures, svix headers, tolerance, malformed", async () => {
  const keyBytes = randomBytes(32);
  const whsec = "whsec_" + keyBytes.toString("base64");
  const id = "msg_2b1Xq";
  const ts = 1_760_000_000;
  const clock = () => ts * 1000;
  const sig = (key = keyBytes, msgId = id, time = ts, payload = body) => "v1," + hmacB64(key, `${msgId}.${time}.${payload}`);
  const headers = (signature, time = ts, msgId = id) => ({ "webhook-id": msgId, "webhook-timestamp": String(time), "webhook-signature": signature });
  const verify = (h, extra = {}) => verifyStandardWebhook({ secret: whsec, payload: bytes, headers: h, clock, ...extra });

  assert.deepEqual(await verify(headers(sig())), { ok: true });
  assert.deepEqual(await verify(new Headers(headers(sig()))), { ok: true });
  assert.deepEqual(await verify(headers(`v1a,${"A".repeat(86)}== v1,${"A".repeat(43)}= ${sig()}`)), { ok: true });
  assert.deepEqual(await verify({ "svix-id": id, "svix-timestamp": String(ts), "svix-signature": sig() }), { ok: true });
  assert.deepEqual(await verify(headers(sig()), { secret: keyBytes.toString("base64") }), { ok: true });

  const oldKey = randomBytes(24);
  assert.deepEqual(await verify(headers(sig(oldKey)), { secret: [whsec, "whsec_" + oldKey.toString("base64")] }), { ok: true });
  assert.deepEqual(await verify(headers(sig(oldKey))), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verify(headers(sig(keyBytes, "msg_other"))), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyStandardWebhook({ secret: whsec, payload: body + "!", headers: headers(sig()), clock }), { ok: false, reason: "mismatch" });

  assert.deepEqual(await verify(headers(sig(keyBytes, id, ts - 301), ts - 301)), { ok: false, reason: "expired" });
  assert.deepEqual(await verify(headers(sig(keyBytes, id, ts + 301), ts + 301)), { ok: false, reason: "expired" });

  assert.deepEqual(await verify({ "webhook-id": id, "webhook-signature": sig() }), { ok: false, reason: "missing-header" });
  assert.deepEqual(await verify({}), { ok: false, reason: "missing-header" });
  for (const bad of [headers("v1"), headers("v1,not*base64"), headers("v1,AAAA"), headers("v2," + "A".repeat(43) + "="),
    headers(sig(), "12x"), headers(sig(), ts, "has space"), headers(Array(21).fill(sig()).join(" "))]) {
    const result = await verify(bad);
    assert.deepEqual(result, { ok: false, reason: "malformed" });
  }
  for (const badSecret of ["whsec_short", "whsec_***", "whsec_" + randomBytes(8).toString("base64")]) {
    await assert.rejects(verify(headers(sig()), { secret: badSecret }), error => error instanceof TypeError && !error.message.includes(badSecret));
  }
});

test("readRawBody returns exact bytes and caps size by header and by stream", async () => {
  const ok = await readRawBody(new Request("https://app.test/hook", { method: "POST", body }), 1024);
  assert.equal(ok.ok, true);
  assert.equal(new TextDecoder().decode(ok.body), body);

  const empty = await readRawBody(new Request("https://app.test/hook"), 10);
  assert.deepEqual(empty.ok && empty.body.byteLength, 0);

  const declared = await readRawBody(new Request("https://app.test/hook", {
    method: "POST", body: "x".repeat(100), headers: { "content-length": "100" },
  }), 10);
  assert.deepEqual(declared, { ok: false, reason: "too-large" });

  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { pulled++; controller.enqueue(new Uint8Array(64)); },
    cancel() { cancelled = true; },
  });
  const streamed = await readRawBody(new Request("https://app.test/hook", { method: "POST", body: stream, duplex: "half" }), 200);
  assert.deepEqual(streamed, { ok: false, reason: "too-large" });
  assert.equal(cancelled, true);
  assert.ok(pulled <= 6, "stops reading shortly after the cap");

  const used = new Request("https://app.test/hook", { method: "POST", body });
  await used.text();
  assert.deepEqual(await readRawBody(used, 1024), { ok: false, reason: "unreadable" });
  await assert.rejects(readRawBody(new Request("https://app.test/"), 0), TypeError);
});

test("end to end: raw body read then GitHub verification", async () => {
  const request = new Request("https://app.test/hook", {
    method: "POST", body, headers: { "x-hub-signature-256": "sha256=" + hmacHex(secret, body) },
  });
  const raw = await readRawBody(request, 4096);
  assert.ok(raw.ok);
  assert.deepEqual(await verifyGitHubWebhook({ secret, payload: raw.body, headers: request.headers }), { ok: true });
});
