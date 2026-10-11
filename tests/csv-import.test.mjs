// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createImporter, detectDelimiter, ImportError, parseCsv, parseValue, suggestMapping, toSafeCsv } from "../.build/modules/csv-import/files/core.js";
import { MemoryImportStore } from "../.build/modules/csv-import/files/memory-store.js";
import { createImportHandler } from "../.build/modules/csv-import/files/http.js";

const code = (expected) => (error) => error instanceof ImportError && error.code === expected;

const FIELDS = [
  { key: "email", label: "Email", required: true, parse: "email", unique: true, aliases: ["e-mail address", "mail"] },
  { key: "name", label: "Full name", required: true, aliases: ["customer"] },
  { key: "seats", label: "Seats", parse: "integer" },
  { key: "price", label: "Price", parse: "decimal" },
  { key: "active", label: "Active", parse: "boolean" },
  { key: "startsOn", label: "Start date", parse: "date", aliases: ["start"] },
];

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  const store = new MemoryImportStore();
  const importer = createImporter({ fields: FIELDS, store, now: () => now, newId: () => `imp-${++counter}`, ...extra });
  return { store, importer, advance: (ms) => { now += ms; } };
}

const alice = { tenantId: "acme", userId: "alice" };
const bob = { tenantId: "acme", userId: "bob" };
const eve = { tenantId: "globex", userId: "alice" };

test("parseCsv: RFC 4180 quotes, escaped quotes, embedded line breaks, CRLF and BOM", () => {
  const text = '﻿name,note\r\n"Smith, Jo","said ""hi""\r\nthen left"\r\nplain,\r\n';
  const { delimiter, records } = parseCsv(text);
  assert.equal(delimiter, ",");
  assert.deepEqual(records, [["name", "note"], ["Smith, Jo", 'said "hi"\r\nthen left'], ["plain", ""]]);
  assert.deepEqual(parseCsv("a\rb\nc").records, [["a"], ["b"], ["c"]]);
  assert.deepEqual(parseCsv('"",x').records, [["", "x"]]);
  assert.throws(() => parseCsv('a,b"c'), code("invalid-csv"));
  assert.throws(() => parseCsv('"a"b,c'), code("invalid-csv"));
  assert.throws(() => parseCsv('"unterminated'), code("invalid-csv"));
});

test("parseCsv: delimiter auto-detection among , ; TAB | and a fixed delimiter", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
  assert.equal(detectDelimiter("a|b|c"), "|");
  assert.equal(detectDelimiter('"x,y,z";b'), ";", "delimiters inside quotes are ignored");
  assert.equal(detectDelimiter("single"), ",");
  assert.deepEqual(parseCsv("a;b\n1,5;2").records, [["a", "b"], ["1,5", "2"]]);
  assert.deepEqual(parseCsv("a;b\n1;2", { delimiter: "," }).records, [["a;b"], ["1;2"]]);
});

test("parseCsv: byte, row, column and field caps", () => {
  assert.throws(() => parseCsv("a,b\n1,2\n", { maxBytes: 5 }), code("too-large"));
  assert.throws(() => parseCsv("é".repeat(4), { maxBytes: 7 }), code("too-large"), "counts UTF-8 bytes, not characters");
  assert.doesNotThrow(() => parseCsv("h\n1\n2", { maxRows: 2 }));
  assert.throws(() => parseCsv("h\n1\n2\n3", { maxRows: 2 }), code("too-many-rows"));
  assert.throws(() => parseCsv("a,b,c", { maxColumns: 2 }), code("too-many-columns"));
  assert.throws(() => parseCsv("abcdef", { maxFieldLength: 5 }), code("invalid-csv"));
});

test("suggestMapping: case, punctuation and accent insensitive, with aliases, each header used once", () => {
  const mapping = suggestMapping(["E-Mail Address", "CUSTOMER", "seats ", "Start", "Unrelated", "Prïce"], FIELDS);
  assert.deepEqual(mapping, { email: "E-Mail Address", name: "CUSTOMER", seats: "seats ", price: "Prïce", active: null, startsOn: "Start" });
  const once = suggestMapping(["Email"], [{ key: "email", label: "Email" }, { key: "work", label: "Work", aliases: ["email"] }]);
  assert.deepEqual(once, { email: "Email", work: null });
});

test("parseValue: valid and invalid cases for each built-in parser and a custom parser", () => {
  const ok = (parser, raw, value) => assert.deepEqual(parseValue(parser, raw), { ok: true, value }, `${parser} ${raw}`);
  const bad = (parser, raw, expected) => assert.equal(parseValue(parser, raw).code, expected, `${parser} ${raw}`);
  ok("string", "hello", "hello");
  ok("integer", "-42", -42);
  ok("integer", "+7", 7);
  bad("integer", "4.2", "invalid-integer");
  bad("integer", "12abc", "invalid-integer");
  bad("integer", "99999999999999999", "invalid-integer");
  ok("decimal", "12.50", 12.5);
  ok("decimal", ".5", 0.5);
  bad("decimal", "1,000.00", "invalid-decimal");
  bad("decimal", "1e5", "invalid-decimal");
  ok("boolean", "Yes", true);
  ok("boolean", "0", false);
  ok("boolean", "OFF", false);
  bad("boolean", "maybe", "invalid-boolean");
  ok("date", "2024-02-29", "2024-02-29");
  bad("date", "2023-02-29", "invalid-date");
  bad("date", "02/03/2024", "invalid-date");
  ok("email", "Jo.Smith@Example.COM", "Jo.Smith@example.com");
  bad("email", "not-an-email", "invalid-email");
  bad("email", "a@b", "invalid-email");
  const sku = (raw) => (/^SKU-\d+$/.test(raw) ? { ok: true, value: raw } : { ok: false, code: "invalid-sku", message: "Expected SKU-123" });
  ok(sku, "SKU-1", "SKU-1");
  bad(sku, "x", "invalid-sku");
  bad(() => { throw new Error("secret internals"); }, "x", "invalid");
});

const GOOD = [
  "Email,Customer,Seats,Price,Active,Start",
  "a@example.com,Ann,3,9.99,yes,2026-01-01",
  "b@example.com,Ben,,,,",
  "",
  "A@EXAMPLE.com,Ann again,1,1,no,2026-01-02",
  "bad-email,Cy,two,1.2.3,maybe,2026-13-01",
  ",,1,,,",
].join("\r\n");

test("preview stages rows, skips blank lines, suggests a mapping and returns a sample", async () => {
  const { importer, store } = setup({ sampleSize: 2 });
  const preview = await importer.preview(alice, GOOD);
  assert.equal(preview.importId, "imp-1");
  assert.equal(preview.rowCount, 5);
  assert.deepEqual(preview.headers, ["Email", "Customer", "Seats", "Price", "Active", "Start"]);
  assert.equal(preview.mapping.email, "Email");
  assert.equal(preview.mapping.name, "Customer");
  assert.deepEqual(preview.sampleRows, [["a@example.com", "Ann", "3", "9.99", "yes", "2026-01-01"], ["b@example.com", "Ben", "", "", "", ""]]);
  const stored = await store.get("imp-1");
  assert.deepEqual(stored.rows.map((r) => r.row), [2, 3, 5, 6, 7], "row numbers match the spreadsheet");
  await assert.rejects(importer.preview(alice, "a,b\n"), code("empty-file"));
  await assert.rejects(importer.preview(alice, ""), code("empty-file"));
  await assert.rejects(importer.preview(alice, "a,,b\n1,2,3"), code("invalid-header"));
  await assert.rejects(importer.preview(alice, "Email,email\n1,2"), code("invalid-header"));
});

test("validate reports per-row errors, missing required values and in-file duplicates", async () => {
  const { importer } = setup();
  const { importId, mapping } = await importer.preview(alice, GOOD);
  const result = await importer.validate(alice, importId, mapping);
  assert.equal(result.total, 5);
  assert.equal(result.valid, 2);
  assert.equal(result.invalid, 3);
  const summary = result.errors.map((e) => `${e.row}:${e.field}:${e.code}`);
  assert.deepEqual(summary, [
    "5:email:duplicate",
    "6:email:invalid-email", "6:seats:invalid-integer", "6:price:invalid-decimal", "6:active:invalid-boolean", "6:startsOn:invalid-date",
    "7:email:required", "7:name:required",
  ]);
  assert.equal(result.errorCount, 8);
  assert.deepEqual(result.duplicates, [{ field: "email", value: "a@example.com", rows: [2, 5] }]);
  assert.match(result.errors[0].message, /repeats row 2/);
});

test("validate rejects bad mappings and an unmapped required field", async () => {
  const { importer } = setup();
  const { importId } = await importer.preview(alice, GOOD);
  await assert.rejects(importer.validate(alice, importId, { email: "Email" }), code("missing-required-field"));
  await assert.rejects(importer.validate(alice, importId, { email: "Email", name: "Nope" }), code("invalid-mapping"));
  await assert.rejects(importer.validate(alice, importId, { email: "Email", name: "Email" }), code("invalid-mapping"));
  await assert.rejects(importer.validate(alice, importId, { email: "Email", name: "Customer", hacker: "Seats" }), code("invalid-mapping"));
  await assert.rejects(importer.validate(alice, importId, ["Email"]), code("invalid-mapping"));
  const ok = await importer.validate(alice, importId, { email: "Email", name: "Customer" });
  assert.equal(ok.valid, 2, "unmapped optional fields are null, not errors");
});

test("rows with extra non-empty cells are invalid; short rows are padded", async () => {
  const { importer } = setup();
  const { importId, mapping } = await importer.preview(alice, "Email,Customer\na@x.io,Ann,surplus\nb@x.io\nc@x.io,Cy,");
  const result = await importer.validate(alice, importId, mapping);
  assert.deepEqual(result.errors.map((e) => `${e.row}:${e.field}:${e.code}`), ["2::extra-columns", "3:name:required"]);
  assert.equal(result.valid, 1);
});

test("commit saves valid rows once, is idempotent, and records onRow failures", async () => {
  const { importer, store } = setup();
  const { importId, mapping } = await importer.preview(alice, GOOD);
  await assert.rejects(importer.commit(alice, importId, { onRow: async () => {} }), code("not-validated"));
  await importer.validate(alice, importId, mapping);
  const saved = [];
  const onRow = async (record, row) => {
    if (record.name === "Ben") throw new Error("unique constraint users_email_key violated");
    saved.push({ row, record });
  };
  const result = await importer.commit(alice, importId, { onRow, batchSize: 2 });
  assert.deepEqual({ ...result, committedAt: 0 }, { importId, total: 5, committed: 1, failed: 1, skipped: 3, committedAt: 0 });
  assert.deepEqual(saved, [{ row: 2, record: { email: "a@example.com", name: "Ann", seats: 3, price: 9.99, active: true, startsOn: "2026-01-01" } }]);
  const again = await importer.commit(alice, importId, { onRow });
  assert.deepEqual(again, result, "a second commit returns the first result");
  assert.equal(saved.length, 1, "onRow is not called again");
  await assert.rejects(importer.validate(alice, importId, mapping), code("already-committed"));
  const stored = await store.get(importId);
  assert.equal(stored.status, "committed");
  const failure = stored.errors.find((e) => e.code === "row-failed");
  assert.deepEqual(failure, { row: 3, field: "", code: "row-failed", message: "The row could not be saved" }, "internal error text is not exposed");
  assert.equal(stored.errorCount, 9);
});

test("concurrent commits: one runs, the other gets commit-in-progress; cancel is refused meanwhile", async () => {
  const { importer } = setup();
  const { importId, mapping } = await importer.preview(alice, "Email,Customer\na@x.io,Ann\nb@x.io,Ben");
  await importer.validate(alice, importId, mapping);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const first = importer.commit(alice, importId, { onRow: async () => { calls++; await gate; } });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(importer.commit(alice, importId, { onRow: async () => { calls++; } }), code("commit-in-progress"));
  await assert.rejects(importer.cancel(alice, importId), code("commit-in-progress"));
  release();
  assert.equal((await first).committed, 2);
  assert.equal(calls, 2);
});

test("imports are scoped to tenant and user; expired imports read as not-found; cancel removes", async () => {
  const { importer, advance } = setup({ ttlMs: 60_000 });
  const { importId, mapping } = await importer.preview(alice, GOOD);
  for (const other of [bob, eve]) {
    await assert.rejects(importer.validate(other, importId, mapping), code("not-found"));
    await assert.rejects(importer.commit(other, importId, { onRow: async () => {} }), code("not-found"));
    await assert.rejects(importer.exportErrors(other, importId), code("not-found"));
    await assert.rejects(importer.cancel(other, importId), code("not-found"));
  }
  await assert.rejects(importer.preview({ tenantId: "", userId: "x" }, GOOD), code("forbidden"));
  await assert.rejects(importer.validate(alice, "../etc", mapping), code("not-found"));
  await importer.validate(alice, importId, mapping);
  const second = await importer.preview(alice, GOOD);
  await importer.cancel(alice, second.importId);
  await assert.rejects(importer.validate(alice, second.importId, mapping), code("not-found"));
  advance(60_000);
  await assert.rejects(importer.validate(alice, importId, mapping), code("not-found"));
});

test("exportErrors escapes formula-like cells and quotes CSV specials", async () => {
  const { importer } = setup();
  const text = [
    "Email,Customer,Seats",
    '"=HYPERLINK(""http://evil.test"")",Ann,1',
    "+1@x,Ben,@SUM(A1)",
    'c@x.io,"-2+3",\tx',
    "d@x.io,Dee,\"\r5x\"",
  ].join("\n");
  const { importId, mapping } = await importer.preview(alice, text);
  await importer.validate(alice, importId, mapping);
  const csv = await importer.exportErrors(alice, importId);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "row,field,column,code,message,value");
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.test"")"`), "= is prefixed and quotes are doubled");
  assert.ok(csv.includes("'+1@x"), "+ is prefixed");
  assert.ok(csv.includes("'@SUM(A1)"), "@ is prefixed");
  assert.ok(csv.includes("'\tx"), "TAB is prefixed");
  assert.ok(csv.includes(`"'\r5x"`), "CR is prefixed and quoted");
  for (const line of parseCsv(csv).records.slice(1)) {
    for (const cell of line) assert.ok(!/^[=+\-@\t\r]/.test(cell), `unsafe cell ${JSON.stringify(cell)}`);
  }
  assert.equal(toSafeCsv([["-1", "ok"]]), "'-1,ok\r\n");
});

test("createImporter validates its field declarations and options", () => {
  const store = new MemoryImportStore();
  assert.throws(() => createImporter({ fields: [], store }), RangeError);
  assert.throws(() => createImporter({ fields: [{ key: "a", label: "A" }, { key: "a", label: "B" }], store }), RangeError);
  assert.throws(() => createImporter({ fields: [{ key: "bad key", label: "A" }], store }), RangeError);
  assert.throws(() => createImporter({ fields: [{ key: "a", label: "A" }], store, ttlMs: 10 }), RangeError);
});

function http(extra = {}) {
  const { importer, store } = setup();
  const saved = [];
  const users = { alice, bob };
  const handler = createImportHandler({
    importer, prefix: "/api/imports", allowedOrigins: ["https://app.test"],
    authenticate: async (request) => users[request.headers.get("x-test-user")] ?? null,
    onRow: async (actor, record, row) => { saved.push({ actor, record, row }); },
    maxUploadBytes: 4096,
    ...extra,
  });
  const call = (method, path, { user = "alice", body, type, origin = "https://app.test" } = {}) => handler(new Request("https://app.test" + path, {
    method,
    headers: { ...(user ? { "x-test-user": user } : {}), ...(origin ? { origin } : {}), ...(type ? { "content-type": type } : {}) },
    ...(body !== undefined ? { body } : {}),
  }));
  return { call, saved, store };
}

test("HTTP adapter: upload, validate, commit, errors.csv and cancel with the right status codes", async () => {
  const { call, saved } = http();
  const created = await call("POST", "/api/imports", { body: GOOD, type: "text/csv; charset=utf-8" });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  const preview = await created.json();
  assert.equal(preview.rowCount, 5);
  const base = `/api/imports/${preview.importId}`;
  assert.equal((await call("POST", `${base}/commit`)).status, 409, "commit before validate");
  const validated = await call("POST", `${base}/validate`, { body: JSON.stringify({ mapping: preview.mapping }), type: "application/json" });
  assert.equal(validated.status, 200);
  assert.equal((await validated.json()).valid, 2);
  const committed = await call("POST", `${base}/commit`);
  assert.equal(committed.status, 200);
  assert.equal((await committed.json()).committed, 2);
  assert.equal((await call("POST", `${base}/commit`)).status, 200, "idempotent");
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0].actor, alice);
  const report = await call("GET", `${base}/errors.csv`, { origin: null });
  assert.equal(report.status, 200);
  assert.match(report.headers.get("content-type"), /^text\/csv/);
  assert.equal(report.headers.get("cache-control"), "no-store");
  assert.match(report.headers.get("content-disposition"), /attachment/);
  assert.match(await report.text(), /^row,field,column,code,message,value\r\n5,Email,Email,duplicate/);
  assert.equal((await call("DELETE", base)).status, 204);
  assert.equal((await call("GET", `${base}/errors.csv`)).status, 404);
});

test("HTTP adapter: 401, origin check, isolation, media type, size cap and bad input", async () => {
  const { call } = http();
  assert.equal((await call("POST", "/api/imports", { user: null, body: GOOD, type: "text/csv" })).status, 401);
  assert.equal((await call("POST", "/api/imports", { origin: "https://evil.test", body: GOOD, type: "text/csv" })).status, 403);
  assert.equal((await call("POST", "/api/imports", { origin: null, body: GOOD, type: "text/csv" })).status, 403);
  assert.equal((await call("POST", "/api/imports", { body: GOOD, type: "application/json" })).status, 415);
  const big = "h\n" + "x\n".repeat(3000);
  const tooBig = await call("POST", "/api/imports", { body: big, type: "text/csv" });
  assert.equal(tooBig.status, 413);
  assert.equal((await tooBig.json()).error, "too-large");
  assert.equal((await call("POST", "/api/imports", { body: new Uint8Array([0x68, 0x0a, 0xff, 0xfe]), type: "text/csv" })).status, 400, "non-UTF-8 is refused");
  const { importId } = await (await call("POST", "/api/imports", { body: GOOD, type: "text/csv" })).json();
  const base = `/api/imports/${importId}`;
  assert.equal((await call("POST", `${base}/validate`, { user: "bob", body: JSON.stringify({ mapping: {} }), type: "application/json" })).status, 404, "another user's import is not found");
  assert.equal((await call("GET", `${base}/errors.csv`, { user: "bob" })).status, 404);
  assert.equal((await call("POST", `${base}/validate`, { body: "{oops", type: "application/json" })).status, 400);
  assert.equal((await call("POST", `${base}/validate`, { body: JSON.stringify({ mapping: { email: "Email" } }), type: "application/json" })).status, 400);
  assert.equal((await call("PUT", base)).status, 405);
  assert.equal((await call("GET", `${base}/a/b`)).status, 404);
  assert.equal((await call("GET", "/elsewhere")).status, 404);
});
