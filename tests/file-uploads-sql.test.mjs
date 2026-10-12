// SPDX-License-Identifier: Apache-2.0
// file-uploads on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the quota
// reservation is one conditional upsert so concurrent uploads cannot exceed it, failures release their reservation,
// and status changes and deletes are conditional so a file's bytes are released exactly once.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createFileUploads, FileUploadError } from "../.build/modules/file-uploads/files/core.js";
import { createSqlUploadMetadataStore } from "../.build/modules/file-uploads/files/sql-store.js";
import { MemoryBlobStore } from "../.build/modules/file-uploads/files/memory-store.js";

const schema = readFileSync(new URL("../modules/file-uploads/files/schema.sql", import.meta.url), "utf8");
const executor = (db) => ({ query: (text, params) => db.query(text, params) });
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const code = (expected) => (error) => error instanceof FileUploadError && error.code === expected;

async function setup({ quotaBytes = 1_000_000, blobs = new MemoryBlobStore(), scanner } = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let counter = 0;
  const metadata = createSqlUploadMetadataStore(executor(db));
  const uploads = createFileUploads({
    metadata, blobs, policy: { maxBytes: 1024, allow: ["png", "text"] },
    authorize: (user, tenantId) => user.tenant === tenantId, quotaBytes,
    scanner: scanner ?? (async (bytes) => (new TextDecoder().decode(bytes).includes("EICAR") ? "infected" : "clean")),
    now: () => 5_000, newId: () => `id${++counter}`,
  });
  const alice = { id: "alice", tenant: "acme" };
  const put = (data, filename = "a.png", declaredType = "image/png") =>
    uploads.upload({ user: alice, tenantId: "acme", filename, declaredType, contentLength: data.byteLength, body: data });
  return { db, metadata, blobs, uploads, alice, put };
}

test("schema applies; upload, scan and serve round-trip through PostgreSQL metadata", async () => {
  const { db, uploads, put, alice } = await setup();
  const record = await put(PNG, "../photo.png");
  const row = (await db.query("SELECT * FROM file_uploads WHERE id = $1", [record.id])).rows[0];
  assert.equal(row.status, "quarantined");
  assert.equal(row.filename, "photo.png");
  assert.equal(row.content_type, "image/png");
  assert.equal(Number(row.size), PNG.byteLength);
  assert.notEqual(row.storage_key, row.filename);
  await assert.rejects(uploads.download(alice, record.id), code("quarantined"));
  assert.equal((await uploads.scan(record.id)).status, "clean");
  const served = await uploads.download(alice, record.id);
  assert.deepEqual(served.bytes, PNG);
  assert.equal(served.record.scannedAt, 5_000);
  await assert.rejects(uploads.download({ id: "bob", tenant: "globex" }, record.id), code("not-found"));
});

test("concurrent uploads on PostgreSQL cannot exceed the tenant quota (atomic reservation)", async () => {
  const { put, metadata, db } = await setup({ quotaBytes: PNG.byteLength * 3 + 7 });
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => put(PNG, `p${i}.png`)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => code("quota-exceeded")(r.reason)));
  assert.equal(await metadata.usage("acme"), PNG.byteLength * 3);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM file_uploads")).rows[0].n, 3);
  // The reservation statement itself refuses an over-limit first insert and an over-limit increment.
  assert.equal(await metadata.reserve("fresh", 11, 10), false);
  assert.equal(await metadata.usage("fresh"), 0);
  assert.equal(await metadata.reserve("fresh", 10, 10), true);
  assert.equal(await metadata.reserve("fresh", 1, 10), false);
  await metadata.release("fresh", 50);
  assert.equal(await metadata.usage("fresh"), 0, "release never goes below zero");
});

test("failed blob writes and rejected content release reserved quota on PostgreSQL", async () => {
  const failing = new MemoryBlobStore();
  failing.put = async () => { throw new Error("storage down"); };
  const { put, metadata, db } = await setup({ blobs: failing });
  await assert.rejects(put(PNG), /storage down/);
  assert.equal(await metadata.usage("acme"), 0);
  await assert.rejects(put(new TextEncoder().encode("not a png"), "x.png"), code("type-mismatch"));
  assert.equal(await metadata.usage("acme"), 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM file_uploads")).rows[0].n, 0);
  // Without Content-Length the rest of maxBytes is reserved while reading (it fits here), then settled to the real size.
  const ok = await setup();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(PNG); controller.close(); } });
  await ok.uploads.upload({ user: ok.alice, tenantId: "acme", filename: "s.png", declaredType: "image/png", body: stream });
  assert.equal(await ok.metadata.usage("acme"), PNG.byteLength);
});

test("conditional status changes and deletes on PostgreSQL: infected bytes are released once and stale verdicts change nothing", async () => {
  const { uploads, put, metadata, blobs, alice } = await setup();
  const bad = await put(new TextEncoder().encode("EICAR sample"), "v.txt", "text/plain");
  const good = await put(PNG);
  const usage = await metadata.usage("acme");
  assert.equal((await uploads.scan(bad.id)).status, "infected");
  assert.equal(await metadata.usage("acme"), usage - bad.size);
  assert.ok(!blobs.keys().includes(bad.storageKey));
  await uploads.remove(alice, bad.id);
  assert.equal(await metadata.usage("acme"), usage - bad.size, "deleting an infected file does not release twice");
  // Concurrent verdicts: exactly one applies.
  const verdicts = await Promise.all([uploads.recordScanResult(good.id, "clean"), uploads.recordScanResult(good.id, "infected")]);
  assert.equal(verdicts.filter(Boolean).length, 1);
  // Concurrent deletes: exactly one wins and the quota is released once.
  const fresh = await put(PNG, "b.png");
  await uploads.scan(fresh.id);
  const before = await metadata.usage("acme");
  const deletes = await Promise.allSettled([uploads.remove(alice, fresh.id), uploads.remove(alice, fresh.id)]);
  assert.equal(deletes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await metadata.usage("acme"), before - fresh.size);
  assert.equal(await metadata.get(fresh.id), null);
  assert.equal(await uploads.scan(fresh.id), null, "scanning a deleted file changes nothing");
});

test("scan claims on PostgreSQL: overlapping scanPending passes and concurrent scan(id) run the scanner once per file", async () => {
  let calls = 0;
  let fail = false;
  const scanner = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); if (fail) throw new Error("down"); return "clean"; };
  const { uploads, put, metadata, db } = await setup({ scanner });
  const a = await put(PNG, "a.png");
  const b = await put(PNG, "b.png");
  await Promise.all([uploads.scanPending(), uploads.scanPending(), uploads.scanPending()]);
  assert.equal(calls, 2);
  assert.equal((await metadata.get(a.id)).status, "clean");
  assert.equal((await metadata.get(b.id)).status, "clean");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM file_uploads WHERE scan_claimed_until IS NOT NULL")).rows[0].n, 0, "verdicts clear the claim");
  const c = await put(PNG, "c.png");
  await Promise.all([uploads.scan(c.id), uploads.scan(c.id)]);
  assert.equal(calls, 3);
  // A failed scan drops its claim so the next pass retries; a live claim hides the file from listQuarantined.
  fail = true;
  const d = await put(PNG, "d.png");
  assert.deepEqual(await uploads.scanPending(), { clean: 0, infected: 0, failed: 1, skipped: 0 });
  assert.equal((await metadata.listQuarantined(5_000, 10)).length, 1);
  assert.ok(await metadata.claimScan(d.id, 5_000, 9_000));
  assert.equal(await metadata.claimScan(d.id, 5_000, 9_000), null, "one claim at a time");
  assert.deepEqual(await metadata.listQuarantined(5_000, 10), []);
  assert.equal((await metadata.listQuarantined(9_000, 10)).length, 1, "an expired claim is listed again");
  await metadata.releaseScanClaim(d.id, 9_000);
  fail = false;
  assert.deepEqual(await uploads.scanPending(), { clean: 1, infected: 0, failed: 0, skipped: 0 });
});

test("without Content-Length on PostgreSQL, a streamed upload that fits what remains of the quota is accepted", async () => {
  const { uploads, alice, metadata } = await setup({ quotaBytes: 100 });
  const big = new Uint8Array(60); big.set(PNG);
  const send = (data, name) => uploads.upload({ user: alice, tenantId: "acme", filename: name, declaredType: "image/png", body: new ReadableStream({ start(c) { c.enqueue(data.slice(0, 20)); c.enqueue(data.slice(20)); c.close(); } }) });
  await send(big, "a.png");
  const small = new Uint8Array(40); small.set(PNG);
  assert.equal((await send(small, "b.png")).size, 40, "fits although maxBytes (1024) does not");
  await assert.rejects(send(small, "c.png"), code("quota-exceeded"));
  assert.equal(await metadata.usage("acme"), 100);
});
