// SPDX-License-Identifier: Apache-2.0
// file-uploads: streaming size limits, magic-byte sniffing, the type allowlist, filename sanitizing, the browser
// preflight, per-tenant authorization and quota, quarantine until scanned, and safe serving headers.
import assert from "node:assert/strict";
import test from "node:test";
import { sniffType, sanitizeFilename, checkType, normalizePolicy } from "../.build/modules/file-uploads/files/policy.js";
import { preflight } from "../.build/modules/file-uploads/files/client.js";
import { createFileUploads, FileUploadError } from "../.build/modules/file-uploads/files/core.js";
import { MemoryUploadMetadataStore, MemoryBlobStore } from "../.build/modules/file-uploads/files/memory-store.js";
import { createFileUploadHandler, contentDisposition } from "../.build/modules/file-uploads/files/http.js";

const ORIGIN = "https://app.example.com";
const bytes = (...parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === "string") for (const ch of part) out.push(ch.charCodeAt(0));
    else out.push(...part);
  }
  return Uint8Array.from(out);
};
const PNG = bytes([0x89], "PNG\r\n\x1a\n", "rest-of-png");
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "jfif");
const GIF = bytes("GIF89a", [1, 0, 1, 0]);
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ");
const PDF = bytes("%PDF-1.7\n%\xe2\xe3");
const ZIP = bytes("PK", [3, 4], [0, 0, 0, 0]);
const TEXT = new TextEncoder().encode("hello, world\nsecond line ü\n");
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = new TextEncoder().encode("  <!doctype html><html><script>alert(1)</script></html>");
const code = (expected) => (error) => error instanceof FileUploadError && error.code === expected;

/** A stream that serves `chunks`, records pulls and cancellation, and can keep producing forever. */
function trackedStream(chunks, { endless = false } = {}) {
  const state = { pulls: 0, cancelled: false, served: 0 };
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      state.pulls++;
      if (index < chunks.length) { const chunk = chunks[index++]; state.served += chunk.byteLength; controller.enqueue(chunk); return; }
      if (endless) { state.served += 1024; controller.enqueue(new Uint8Array(1024)); return; }
      controller.close();
    },
    cancel() { state.cancelled = true; },
  }, { highWaterMark: 0 });
  return { stream, state };
}

function setup(extra = {}) {
  let counter = 0;
  let now = 1_000_000;
  const metadata = extra.metadata ?? new MemoryUploadMetadataStore();
  const blobs = extra.blobs ?? new MemoryBlobStore();
  const scanned = [];
  const uploads = createFileUploads({
    metadata, blobs,
    policy: { maxBytes: 4096, allow: ["png", "jpeg", "gif", "webp", "pdf", "text"], ...extra.policy },
    // Members: alice -> acme, bob -> globex, viewer may only read acme.
    authorize: (user, tenantId, action) => (user.tenant === tenantId && (action === "read" || !user.readOnly)),
    quotaBytes: extra.quotaBytes ?? 1_000_000,
    scanner: extra.scanner ?? (async (data, record) => { scanned.push(record.id); return new TextDecoder().decode(data).includes("EICAR") ? "infected" : "clean"; }),
    now: () => now, newId: () => `id${++counter}`,
  });
  const alice = { id: "alice", tenant: "acme" };
  const bob = { id: "bob", tenant: "globex" };
  const viewer = { id: "viewer", tenant: "acme", readOnly: true };
  const put = (data, filename, declaredType, more = {}) =>
    uploads.upload({ user: alice, tenantId: "acme", filename, declaredType, contentLength: data.byteLength, body: data, ...more });
  return { uploads, metadata, blobs, alice, bob, viewer, put, scanned, advance: (ms) => { now += ms; } };
}

test("sniffType detects png, jpeg, gif, webp, pdf, zip and plain text from magic bytes, and flags svg and html markup", () => {
  assert.equal(sniffType(PNG), "png");
  assert.equal(sniffType(JPEG), "jpeg");
  assert.equal(sniffType(GIF), "gif");
  assert.equal(sniffType(WEBP), "webp");
  assert.equal(sniffType(PDF), "pdf");
  assert.equal(sniffType(ZIP), "zip");
  assert.equal(sniffType(TEXT), "text");
  assert.equal(sniffType(SVG), "svg");
  assert.equal(sniffType(HTML), "html");
  assert.equal(sniffType(new Uint8Array()), null);
  assert.equal(sniffType(bytes("MZ", [0x90, 0, 3, 0, 0, 0])), null, "a Windows executable is not text");
  assert.equal(sniffType(bytes("hello", [0], "world")), null, "NUL bytes are not text");
  assert.equal(sniffType(bytes([0xc3, 0x28])), null, "invalid UTF-8 is not text");
  assert.equal(sniffType(bytes("RIFF", [0, 0, 0, 0], "WAVE")), null, "RIFF alone is not webp");
});

test("sanitizeFilename strips traversal, control and bidi characters, renames Windows reserved names and caps the length", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("..\\..\\windows\\system32\\evil.png"), "evil.png");
  assert.equal(sanitizeFilename(".."), "file");
  assert.equal(sanitizeFilename("  .hidden.png. "), "hidden.png");
  assert.equal(sanitizeFilename("a\u0000b\u001fc\u007f.png"), "a_b_c_.png");
  assert.equal(sanitizeFilename("invoice\u202egnp.exe"), "invoicegnp.exe", "right-to-left override is stripped");
  assert.equal(sanitizeFilename("a\u061cb.png"), "ab.png", "Arabic letter mark (Bidi_Control) is stripped");
  for (const ch of ["\u00ad", "\u115f", "\u1160", "\u3164", "\uffa0", "\u2800", "\u180e", "\u200b", "\u2066", "\ufeff"]) {
    assert.equal(sanitizeFilename(`re${ch}port.pdf`), "report.pdf", `U+${ch.codePointAt(0).toString(16)} is stripped`);
    assert.equal(sanitizeFilename(`${ch}.png`), "file.png", `a name of only U+${ch.codePointAt(0).toString(16)} falls back`);
    assert.equal(sanitizeFilename(ch.repeat(3)), "file");
  }
  assert.equal(sanitizeFilename("한글 ﾊﾝｶｸ Ελληνικά.txt"), "한글 ﾊﾝｶｸ Ελληνικά.txt", "ordinary letters are kept");
  assert.equal(sanitizeFilename('x<>:"|?*.txt'), "x_______.txt");
  assert.equal(sanitizeFilename("CON"), "_CON");
  assert.equal(sanitizeFilename("nul.txt"), "_nul.txt");
  assert.equal(sanitizeFilename("com1.png"), "_com1.png");
  assert.equal(sanitizeFilename("console.png"), "console.png");
  const long = sanitizeFilename("é".repeat(300) + ".png", 64);
  assert.ok(new TextEncoder().encode(long).length <= 64);
  assert.ok(long.endsWith(".png"), "the extension survives truncation");
});

test("upload stores bytes under a random storage key, never the original name", async () => {
  const { put, blobs, metadata } = setup();
  const record = await put(PNG, "../../uploads/../avatar.png", "image/png");
  assert.equal(record.filename, "avatar.png");
  assert.equal(record.storageKey, "id2");
  assert.notEqual(record.storageKey, record.filename);
  assert.deepEqual(blobs.keys(), ["id2"]);
  assert.equal(metadata.dump()[0].contentType, "image/png");
  assert.ok(!blobs.keys().some((key) => key.includes("avatar") || key.includes("..")));
});

test("upload rejects a declared Content-Length over the limit with too-large before reading and cancels the stream", async () => {
  const { uploads, alice, metadata } = setup();
  const { stream, state } = trackedStream([PNG], { endless: true });
  await assert.rejects(uploads.upload({ user: alice, tenantId: "acme", filename: "a.png", declaredType: "image/png", contentLength: 4097, body: stream }), code("too-large"));
  assert.equal(state.served, 0, "no byte was read");
  assert.equal(state.cancelled, true);
  assert.equal(await metadata.usage("acme"), 0, "nothing reserved");
});

test("upload counts streamed bytes without Content-Length and stops reading at the limit with too-large", async () => {
  const { uploads, alice, metadata, blobs } = setup();
  const { stream, state } = trackedStream([PNG], { endless: true });
  await assert.rejects(uploads.upload({ user: alice, tenantId: "acme", filename: "a.png", declaredType: "image/png", body: stream }), code("too-large"));
  assert.equal(state.cancelled, true, "the stream was cancelled");
  assert.ok(state.served <= 4096 + 1024 + PNG.byteLength, `stopped near the limit, served ${state.served}`);
  assert.ok(state.pulls < 10);
  assert.equal(await metadata.usage("acme"), 0, "the maxBytes reservation was released");
  assert.deepEqual(blobs.keys(), []);
  // A body longer than its declared Content-Length is refused as a bad request.
  const liar = trackedStream([PNG, new Uint8Array(100)]);
  await assert.rejects(uploads.upload({ user: alice, tenantId: "acme", filename: "a.png", declaredType: "image/png", contentLength: PNG.byteLength, body: liar.stream }), code("bad-request"));
  assert.equal(liar.state.cancelled, true);
  // Within the limit, a stream without Content-Length is stored with its real size and only that is charged.
  const ok = trackedStream([PNG.subarray(0, 5), PNG.subarray(5)]);
  const record = await uploads.upload({ user: alice, tenantId: "acme", filename: "a.png", declaredType: "image/png", body: ok.stream });
  assert.equal(record.size, PNG.byteLength);
  assert.equal(await metadata.usage("acme"), PNG.byteLength);
});

test("type allowlist: detected type must agree with the extension and the declared type; unlisted types are refused", async () => {
  const { put, blobs } = setup();
  assert.equal((await put(JPEG, "photo.JPEG", "image/jpeg")).contentType, "image/jpeg");
  assert.equal((await put(TEXT, "notes.txt", "text/plain; charset=utf-8")).contentType, "text/plain");
  assert.equal((await put(PDF, "doc.pdf", "")).contentType, "application/pdf", "an empty declared type is accepted by default");
  await assert.rejects(put(PNG, "photo.jpg", "image/jpeg"), code("type-mismatch"), "png bytes under a jpg name");
  await assert.rejects(put(PNG, "photo.png", "image/gif"), code("type-mismatch"), "declared type disagrees before reading");
  await assert.rejects(put(TEXT, "fake.png", "image/png"), code("type-mismatch"), "text renamed to png");
  await assert.rejects(put(ZIP, "archive.zip", "application/zip"), code("unsupported-type"), "zip is not allowlisted here");
  await assert.rejects(put(bytes("MZ", [0x90, 0]), "tool.exe", "application/octet-stream"), code("unsupported-type"));
  await assert.rejects(put(bytes("MZ", [0x90, 0]), "tool.png", "image/png"), code("unsupported-type"), "unknown bytes behind an allowed name");
  await assert.rejects(put(PNG, "noextension", "image/png"), code("unsupported-type"));
  const strict = setup({ policy: { allowGenericDeclaredType: false } });
  await assert.rejects(strict.put(PNG, "a.png", "application/octet-stream"), code("type-mismatch"));
  assert.equal(blobs.keys().length, 3, "rejected files were never stored");
  const policy = normalizePolicy({ maxBytes: 10, allow: ["zip"] });
  assert.deepEqual(checkType("zip", "a.zip", "application/zip", policy), { ok: true, type: "zip" });
  assert.deepEqual(checkType("zip", "a.docx", "", policy), { ok: false, reason: "type-not-allowed" });
});

test("svg and html are rejected by default even when renamed, and need allowActiveContent to be allowlisted", async () => {
  const { put } = setup();
  await assert.rejects(put(SVG, "logo.svg", "image/svg+xml"), code("unsupported-type"));
  await assert.rejects(put(HTML, "page.html", "text/html"), code("unsupported-type"));
  await assert.rejects(put(SVG, "logo.txt", "text/plain"), code("unsupported-type"), "svg renamed to txt is still svg");
  await assert.rejects(put(HTML, "page.txt", "text/plain"), code("unsupported-type"), "html renamed to txt is still html");
  assert.throws(() => normalizePolicy({ maxBytes: 10, allow: ["png", "svg"] }), /allowActiveContent/);
  assert.throws(() => normalizePolicy({ maxBytes: 10, allow: ["html"] }), /allowActiveContent/);
  const opted = setup({ policy: { allow: ["svg"], allowActiveContent: true } });
  assert.equal((await opted.put(SVG, "logo.svg", "image/svg+xml")).contentType, "image/svg+xml");
});

test("preflight rejects oversize, empty, unlisted, mismatched and badly named files on File-like objects before upload", async () => {
  const policy = { maxBytes: 1000, allow: ["png", "pdf", "text"] };
  const fileLike = (name, data, type) => ({ name, size: data.byteLength, type, slice: (start, end) => ({ arrayBuffer: async () => data.slice(start, end).buffer }) });
  assert.deepEqual(await preflight(fileLike("photo.png", PNG, "image/png"), policy), { ok: true, type: "png", filename: "photo.png", sniffed: true });
  assert.equal((await preflight(fileLike("big.png", new Uint8Array(1001), "image/png"), policy)).reason, "too-large");
  assert.equal((await preflight(fileLike("empty.png", new Uint8Array(), "image/png"), policy)).reason, "empty");
  assert.equal((await preflight(fileLike("a.zip", ZIP, "application/zip"), policy)).reason, "type-not-allowed");
  assert.equal((await preflight(fileLike("logo.svg", SVG, "image/svg+xml"), policy)).reason, "type-not-allowed");
  assert.equal((await preflight(fileLike("fake.png", TEXT, "image/png"), policy)).reason, "type-mismatch", "sniffed head disagrees");
  assert.equal((await preflight(fileLike("photo.png", PNG, "application/pdf"), policy)).reason, "type-mismatch");
  assert.equal((await preflight(fileLike("   ", PNG, "image/png"), policy)).reason, "bad-name");
  const traversal = await preflight(fileLike("../../x/photo.png", PNG, ""), policy);
  assert.equal(traversal.filename, "photo.png");
  // Metadata only when slice() is unavailable.
  assert.deepEqual(await preflight({ name: "a.pdf", size: 10, type: "application/pdf" }, policy), { ok: true, type: "pdf", filename: "a.pdf", sniffed: false });
  // A long text file whose 4 KiB head ends mid-character still sniffs as text.
  const long = new TextEncoder().encode("a".repeat(4095) + "ü".repeat(10));
  assert.equal((await preflight(fileLike("long.txt", long, "text/plain"), { maxBytes: 10_000, allow: ["text"] })).ok, true);
  // Real Blob/File objects from the platform work too.
  const real = new File([PNG], "real.png", { type: "image/png" });
  assert.equal((await preflight(real, policy)).ok, true);
});

test("authorize gates uploads per tenant and an unauthorized user cannot read or delete another tenant's file", async () => {
  const { uploads, put, alice, bob, viewer, blobs } = setup();
  const { stream, state } = trackedStream([PNG]);
  await assert.rejects(uploads.upload({ user: bob, tenantId: "acme", filename: "a.png", declaredType: "image/png", body: stream }), code("forbidden"));
  assert.equal(state.served, 0);
  assert.equal(state.cancelled, true);
  await assert.rejects(uploads.upload({ user: viewer, tenantId: "acme", filename: "a.png", declaredType: "image/png", body: PNG }), code("forbidden"));
  const record = await put(PNG, "a.png", "image/png");
  await uploads.scan(record.id);
  await assert.rejects(uploads.download(bob, record.id), code("not-found"), "another tenant sees a missing file");
  await assert.rejects(uploads.remove(bob, record.id), code("not-found"));
  await assert.rejects(uploads.remove(viewer, record.id), code("not-found"), "read-only member cannot delete");
  assert.equal((await uploads.download(viewer, record.id)).record.id, record.id);
  await uploads.remove(alice, record.id);
  assert.deepEqual(blobs.keys(), []);
  await assert.rejects(uploads.download(alice, record.id), code("not-found"));
});

test("concurrent uploads cannot exceed the tenant quota and failed uploads release their reservation", async () => {
  const { put, metadata, uploads, alice } = setup({ quotaBytes: PNG.byteLength * 2 + 5 });
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => put(PNG, `p${i}.png`, "image/png")));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => code("quota-exceeded")(r.reason)));
  assert.equal(await metadata.usage("acme"), PNG.byteLength * 2);
  // Deleting frees quota for the next upload.
  const first = results.find((r) => r.status === "fulfilled").value;
  await uploads.remove(alice, first.id);
  assert.equal(await metadata.usage("acme"), PNG.byteLength);
  await put(PNG, "again.png", "image/png");
  // A failing BlobStore releases the reservation.
  const failing = new MemoryBlobStore();
  failing.put = async () => { throw new Error("storage down"); };
  const broken = setup({ blobs: failing });
  await assert.rejects(broken.put(PNG, "a.png", "image/png"), /storage down/);
  assert.equal(await broken.metadata.usage("acme"), 0);
  // A failing metadata insert deletes the stored bytes and releases the reservation.
  const meta = new MemoryUploadMetadataStore();
  meta.insert = async () => { throw new Error("db down"); };
  const orphan = setup({ metadata: meta });
  await assert.rejects(orphan.put(PNG, "a.png", "image/png"), /db down/);
  assert.deepEqual(orphan.blobs.keys(), []);
  assert.equal(await meta.usage("acme"), 0);
  // Content rejected after reading releases too.
  await assert.rejects(broken.put(TEXT, "x.png", "image/png"), code("type-mismatch"));
  assert.equal(await broken.metadata.usage("acme"), 0);
});

test("uploads start quarantined; only files the scanner marks clean are served; infected files are deleted", async () => {
  const { uploads, put, alice, blobs, metadata } = setup();
  const clean = await put(TEXT, "notes.txt", "text/plain");
  assert.equal(clean.status, "quarantined");
  await assert.rejects(uploads.download(alice, clean.id), code("quarantined"));
  assert.equal((await uploads.scan(clean.id)).status, "clean");
  assert.deepEqual((await uploads.download(alice, clean.id)).bytes, TEXT);
  const bad = await put(new TextEncoder().encode("X5O!P%@AP EICAR test\n"), "virus.txt", "text/plain");
  const before = await metadata.usage("acme");
  assert.equal((await uploads.scan(bad.id)).status, "infected");
  await assert.rejects(uploads.download(alice, bad.id), code("infected"));
  assert.ok(!blobs.keys().includes(bad.storageKey), "infected bytes are deleted");
  assert.equal(await metadata.usage("acme"), before - bad.size);
  await uploads.remove(alice, bad.id);
  assert.equal(await metadata.usage("acme"), before - bad.size, "no double release");
  // A scanner failure or a non-verdict leaves the file quarantined.
  const flaky = setup({ scanner: async () => { throw new Error("daemon down"); } });
  const f = await flaky.put(PNG, "a.png", "image/png");
  await assert.rejects(flaky.uploads.scan(f.id), code("scan-failed"));
  await assert.rejects(flaky.uploads.download(flaky.alice, f.id), code("quarantined"));
  const vague = setup({ scanner: async () => "probably-fine" });
  const v = await vague.put(PNG, "a.png", "image/png");
  await assert.rejects(vague.uploads.scan(v.id), code("scan-failed"));
  assert.equal((await vague.metadata.get(v.id)).status, "quarantined");
  // An out-of-band verdict applies once; a clean file cannot later be flipped by a stale result.
  assert.equal((await vague.uploads.recordScanResult(v.id, "clean")).status, "clean");
  assert.equal(await vague.uploads.recordScanResult(v.id, "infected"), null);
  // Without a scanner configured, nothing is ever served.
  const none = createFileUploads({ metadata: new MemoryUploadMetadataStore(), blobs: new MemoryBlobStore(), policy: { maxBytes: 100 }, authorize: () => true, quotaBytes: 1000, newId: (() => { let n = 0; return () => `n${++n}`; })() });
  const n = await none.upload({ user: alice, tenantId: "acme", filename: "a.png", declaredType: "image/png", body: PNG });
  await assert.rejects(none.scan(n.id), code("scan-failed"));
  await assert.rejects(none.download(alice, n.id), code("quarantined"));
});

function http(extra = {}) {
  const env = setup(extra);
  const handler = createFileUploadHandler({
    uploads: env.uploads, prefix: "/api/uploads", allowedOrigins: [ORIGIN],
    authenticate: (request) => ({ alice: env.alice, bob: env.bob })[request.headers.get("x-test-user")] ?? null,
  });
  const post = (body, filename, headers = {}, tenant = "acme") => handler(new Request(`${ORIGIN}/api/uploads/tenants/${tenant}/files?filename=${encodeURIComponent(filename)}`, {
    method: "POST", body, duplex: "half", headers: { origin: ORIGIN, "x-test-user": "alice", "content-type": "image/png", ...headers },
  }));
  const get = (id, user = "alice") => handler(new Request(`${ORIGIN}/api/uploads/files/${id}`, { headers: { "x-test-user": user } }));
  return { ...env, handler, post, get };
}

test("HTTP: upload returns 201, Content-Length over the limit returns 413 and streamed overflow returns 413 without reading the rest", async () => {
  const { post, handler } = http();
  const created = await post(PNG, "avatar.png");
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.deepEqual({ ...body, id: undefined }, { id: undefined, filename: "avatar.png", contentType: "image/png", size: PNG.byteLength, status: "quarantined", createdAt: 1_000_000 });
  assert.equal(created.headers.get("x-content-type-options"), "nosniff");
  // Declared Content-Length over the limit: refused before reading.
  const declared = trackedStream([PNG], { endless: true });
  const tooBig = await handler(new Request(`${ORIGIN}/api/uploads/tenants/acme/files?filename=a.png`, {
    method: "POST", body: declared.stream, duplex: "half", headers: { origin: ORIGIN, "x-test-user": "alice", "content-type": "image/png", "content-length": "5000" },
  }));
  assert.equal(tooBig.status, 413);
  assert.deepEqual(await tooBig.json(), { error: "too-large" });
  assert.equal(declared.state.served, 0);
  assert.equal(declared.state.cancelled, true);
  // No Content-Length: counted while streaming and cut off.
  const streamed = trackedStream([PNG], { endless: true });
  const overflow = await post(streamed.stream, "a.png");
  assert.equal(overflow.status, 413);
  assert.equal(streamed.state.cancelled, true);
  assert.ok(streamed.state.served < 4096 + 4096, `served ${streamed.state.served}`);
  assert.equal((await post(PNG, "a.png", { "content-length": "12abc" })).status, 400);
});

test("HTTP: download serves attachment with RFC 6266 filename*, nosniff, the stored detected type and a sandbox CSP", async () => {
  const { post, get, uploads } = http();
  const { id } = await (await post(PNG, "résumé \"final\" (1).png")).json();
  await uploads.scan(id);
  const response = await get(id);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="r_sum_ _final_ (1).png"; filename*=UTF-8''r%C3%A9sum%C3%A9%20_final_%20%281%29.png`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  // Text is served as text/plain with an explicit charset, never as the client's declared type.
  const { id: textId } = await (await post(TEXT, "n.txt", { "content-type": "text/plain" })).json();
  await uploads.scan(textId);
  assert.equal((await get(textId)).headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(contentDisposition("say \"hi\".txt"), `attachment; filename="say _hi_.txt"; filename*=UTF-8''say%20%22hi%22.txt`);
  assert.equal(contentDisposition("a\r\nb.txt"), `attachment; filename="a__b.txt"; filename*=UTF-8''a%0D%0Ab.txt`);
});

test("HTTP: origin check, 401 without a user, 404 for another tenant's file, 409 while quarantined, 415 for wrong types, 204 delete", async () => {
  const { post, get, handler, uploads } = http();
  assert.equal((await post(PNG, "a.png", { origin: "https://evil.example" })).status, 403);
  assert.equal((await post(PNG, "a.png", { "x-test-user": "nobody" })).status, 401);
  assert.equal((await post(PNG, "a.png", {}, "globex")).status, 403, "alice cannot upload into globex");
  assert.equal((await post(SVG, "logo.svg", { "content-type": "image/svg+xml" })).status, 415);
  assert.equal((await post(TEXT, "fake.png")).status, 415);
  const { id } = await (await post(PNG, "a.png")).json();
  assert.equal((await get(id)).status, 409, "quarantined until scanned");
  await uploads.scan(id);
  assert.equal((await get(id, "bob")).status, 404);
  assert.equal((await get(id, "nobody")).status, 401);
  const del = (user, origin = ORIGIN) => handler(new Request(`${ORIGIN}/api/uploads/files/${id}`, { method: "DELETE", headers: { origin, "x-test-user": user } }));
  assert.equal((await del("alice", "https://evil.example")).status, 403);
  assert.equal((await del("bob")).status, 404);
  assert.equal((await del("alice")).status, 204);
  assert.equal((await get(id)).status, 404);
  assert.equal((await handler(new Request(`${ORIGIN}/api/uploads/files/${id}`, { method: "PUT", headers: { origin: ORIGIN } }))).status, 405);
  assert.equal((await handler(new Request(`${ORIGIN}/elsewhere`))).status, 404);
});
