// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  createCsvExporter, CsvExportError, csvField, formatCell, contentDisposition, safeCsvFilename, downloadHeaders,
} from "../.build/modules/csv-download/files/core.js";
import { createMemoryRowSource, MemoryExportLog } from "../.build/modules/csv-download/files/memory-store.js";
import { createCsvExportHandler } from "../.build/modules/csv-download/files/http.js";

const BOM = "﻿";
const ANN = { tenantId: "t1", userId: "ann" };
const BOB = { tenantId: "t1", userId: "bob" };
const EVE = { tenantId: "t2", userId: "eve" };

const ROWS = [
  { id: "001", tenant: "t1", owner: "ann", name: "Widget, large", note: 'He said "hi"', amount: -5, secret: "s1" },
  { id: "002", tenant: "t1", owner: "bob", name: "=HYPERLINK(\"http://x\")", note: "line1\nline2", amount: 12.5, secret: "s2" },
  { id: "003", tenant: "t2", owner: "eve", name: "Other tenant", note: "", amount: 1, secret: "s3" },
  { id: "004", tenant: "t1", owner: "ann", name: "Café ünïcödé 日本", note: "@SUM(A1)", amount: null, secret: "s4" },
];

const COLUMNS = [
  { key: "id", header: "ID", value: (r) => r.id },
  { key: "name", header: "Name", value: (r) => r.name },
  { key: "note", header: "Note", value: (r) => r.note },
  { key: "amount", header: "Amount", value: (r) => r.amount },
  { key: "secret", header: "Secret", value: (r) => r.secret },
];

function source(rows = ROWS, extra = {}) {
  return createMemoryRowSource(rows, { tenantOf: (r) => r.tenant, idOf: (r) => r.id, ...extra });
}

function exporter(extra = {}) {
  return createCsvExporter({
    columns: COLUMNS, source: extra.source ?? source(), defaultColumns: ["id", "name", "note", "amount"],
    authorize: (requester, row) => row.owner === requester.userId, now: () => 1_000, ...extra,
  });
}

async function readAll(stream) {
  const reader = stream.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
const text = async (stream) => (await readAll(stream)).toString("utf8");
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const code = (expected) => (error) => error instanceof CsvExportError && error.code === expected;

// --- rfc4180-quoting -------------------------------------------------------------------------------------------

test("RFC 4180: fields with commas, quotes and line breaks are quoted, quotes doubled, every record ends with CRLF", async () => {
  const result = await exporter({ bom: false }).exportCsv(ANN, { columns: ["id", "name", "note"] });
  const csv = await text(result.stream);
  assert.equal(csv, 'ID,Name,Note\r\n001,"Widget, large","He said ""hi"""\r\n004,Café ünïcödé 日本,\'@SUM(A1)\r\n');
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(csvField("a\r\nb"), '"a\r\nb"');
  assert.equal(csvField(" padded "), '" padded "');
  assert.equal(csvField("plain"), "plain");
});

test("RFC 4180: an embedded LF inside a field stays inside one quoted field while records use CRLF", async () => {
  const result = await exporter({ bom: false }).exportCsv(BOB, { columns: ["id", "note"] });
  assert.equal(await text(result.stream), 'ID,Note\r\n002,"line1\nline2"\r\n');
});

// --- formula-neutralization ------------------------------------------------------------------------------------

test("formula neutralization: = + - @ tab and CR prefixes get a leading apostrophe, then quoting applies", () => {
  for (const value of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
    const out = csvField(value);
    assert.ok(out === `'${value}` || out === `"'${value.replace(/"/g, '""')}"`, `${JSON.stringify(value)} -> ${JSON.stringify(out)}`);
  }
  assert.equal(csvField('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvField("safe=1"), "safe=1");
});

test("formula neutralization: exported string cells are neutralized; typed numbers (including negatives) are not", async () => {
  const result = await exporter({ bom: false }).exportCsv(BOB, { columns: ["name", "amount"] });
  assert.equal(await text(result.stream), 'Name,Amount\r\n"\'=HYPERLINK(""http://x"")",12.5\r\n');
  const ann = await exporter({ bom: false }).exportCsv(ANN, { columns: ["amount"] });
  assert.equal(await text(ann.stream), 'Amount\r\n-5\r\n""\r\n', "a lone empty field is written as \"\" so the record is not a blank line");
  assert.equal(formatCell(-5), "-5");
  assert.equal(formatCell("-5"), "'-5");
});

test("formula neutralization is configurable: custom triggers, custom escape and opt-out", async () => {
  const custom = await exporter({ bom: false, formulaTriggers: ["="], formulaEscape: "\t" }).exportCsv(ANN, { columns: ["note"] });
  assert.equal(await text(custom.stream), 'Note\r\n"He said ""hi"""\r\n@SUM(A1)\r\n');
  const off = await exporter({ bom: false, neutralizeFormulas: false }).exportCsv(BOB, { columns: ["name"] });
  assert.equal(await text(off.stream), 'Name\r\n"=HYPERLINK(""http://x"")"\r\n');
  assert.throws(() => exporter({ formulaTriggers: [""] }), RangeError);
});

test("cell formatting: null, undefined, NaN and invalid dates are empty; dates are ISO; objects are refused", async () => {
  assert.equal(formatCell(null), "");
  assert.equal(formatCell(undefined), "");
  assert.equal(formatCell(Number.NaN), "");
  assert.equal(formatCell(10n), "10");
  assert.equal(formatCell(true), "true");
  assert.equal(formatCell(new Date(0)), "1970-01-01T00:00:00.000Z");
  assert.equal(formatCell(new Date(Number.NaN)), "");
  assert.throws(() => formatCell({ a: 1 }), code("invalid-cell"));
  const bad = await createCsvExporter({ columns: [{ key: "x", header: "X", value: () => ({}) }], source: source() }).exportCsv(ANN, {});
  await assert.rejects(readAll(bad.stream), code("invalid-cell"));
});

// --- excel-encoding --------------------------------------------------------------------------------------------

test("Excel encoding: output is UTF-8 with a byte-order mark by default, CRLF records, and non-ASCII bytes intact", async () => {
  const result = await exporter().exportCsv(ANN, { columns: ["name"] });
  const bytes = await readAll(result.stream);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  assert.equal(decoded, `${BOM}Name\r\n"Widget, large"\r\nCafé ünïcödé 日本\r\n`);
  assert.equal(result.headers["content-type"], "text/csv; charset=utf-8");
});

test("Excel encoding: the BOM can be turned off and LF line endings chosen explicitly", async () => {
  const result = await exporter({ bom: false, lineEnding: "\n" }).exportCsv(ANN, { columns: ["id"] });
  assert.equal(await text(result.stream), "ID\n001\n004\n");
  assert.throws(() => exporter({ lineEnding: "\r" }), RangeError);
});

// --- download-headers ------------------------------------------------------------------------------------------

test("download headers: attachment with RFC 6266 filename and RFC 8187 filename* for non-ASCII names, text/csv, no-store", async () => {
  const result = await exporter().exportCsv(ANN, { filename: "Rapport été 2026" });
  assert.equal(result.filename, "Rapport été 2026.csv");
  assert.equal(result.headers["content-disposition"], `attachment; filename="Rapport _t_ 2026.csv"; filename*=UTF-8''Rapport%20%C3%A9t%C3%A9%202026.csv`);
  assert.equal(result.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.headers["x-content-type-options"], "nosniff");
  await result.stream.cancel();
});

test("download headers: unsafe filenames lose path separators, quotes, control characters and header delimiters", () => {
  assert.equal(safeCsvFilename("../../etc/passwd"), "_.._etc_passwd.csv");
  assert.equal(safeCsvFilename('a"b\r\nc;d.csv'), "a_b__c_d.csv");
  assert.equal(safeCsvFilename(""), "export.csv");
  assert.equal(safeCsvFilename("..."), "export.csv");
  assert.equal(safeCsvFilename("x".repeat(500)).length, 150);
  assert.ok(safeCsvFilename("x".repeat(500)).endsWith(".csv"));
  assert.equal(contentDisposition("plain.csv"), 'attachment; filename="plain.csv"');
  assert.equal(contentDisposition("it's (1).csv"), `attachment; filename="it's (1).csv"`);
  assert.equal(contentDisposition("日本.csv"), `attachment; filename="__.csv"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.csv`);
  // ' ( ) are legal in the quoted form but not RFC 8187 attr-chars, so filename* percent-encodes them; * is Windows-reserved.
  assert.equal(contentDisposition("a!'(b)* é"), `attachment; filename="a!'(b)_ _.csv"; filename*=UTF-8''a!%27%28b%29_%20%C3%A9.csv`);
  assert.deepEqual(downloadHeaders("r.csv"), {
    "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="r.csv"',
    "cache-control": "no-store", "x-content-type-options": "nosniff",
  });
});

// --- authorized-rows -------------------------------------------------------------------------------------------

test("authorized rows: the row source is scoped to the requester's tenant; another tenant's rows never appear", async () => {
  const ann = await text((await exporter({ bom: false, authorize: undefined }).exportCsv(ANN, { columns: ["id"] })).stream);
  assert.equal(ann, "ID\r\n001\r\n002\r\n004\r\n", "without an authorize hook every t1 row is readable");
  const eve = await text((await exporter({ bom: false }).exportCsv(EVE, { columns: ["id"] })).stream);
  assert.equal(eve, "ID\r\n003\r\n");
});

test("authorized rows: the authorize hook drops rows the requester cannot read and counts them as denied", async () => {
  const summaries = [];
  const ex = exporter({
    bom: false, authorize: (requester, row) => row.owner === requester.userId, onFinish: (s) => summaries.push(s),
  });
  assert.equal(await text((await ex.exportCsv(ANN, { columns: ["id"] })).stream), "ID\r\n001\r\n004\r\n");
  assert.equal(await text((await ex.exportCsv(BOB, { columns: ["id"] })).stream), "ID\r\n002\r\n");
  assert.equal(summaries[0].rows, 2);
  assert.equal(summaries[0].denied, 1);
  assert.equal(summaries[0].ok, true);
});

test("authorized rows: a row from another tenant returned by a buggy source is dropped by tenantOf, not exported", async () => {
  const leaky = { fetchPage: async () => ({ rows: ROWS, nextCursor: null }) };
  const summaries = [];
  const ex = exporter({ bom: false, source: leaky, tenantOf: (r) => r.tenant, onFinish: (s) => summaries.push(s) });
  const csv = await text((await ex.exportCsv(EVE, { columns: ["id"] })).stream);
  assert.equal(csv, "ID\r\n003\r\n");
  assert.equal(summaries[0].denied, 3);
});

test("authorized rows: only explicitly selected, declared and readable columns are exported", async () => {
  const ex = exporter({ bom: false, authorize: undefined, canReadColumn: (requester, key) => key !== "secret" || requester.userId === "ann" });
  // Defaults are the declared defaultColumns, never every field of the row.
  assert.equal(await text((await ex.exportCsv(BOB, {})).stream), 'ID,Name,Note,Amount\r\n001,"Widget, large","He said ""hi""",-5\r\n002,"\'=HYPERLINK(""http://x"")","line1\nline2",12.5\r\n004,Café ünïcödé 日本,\'@SUM(A1),\r\n');
  await assert.rejects(ex.exportCsv(BOB, { columns: ["id", "secret"] }), code("forbidden"));
  await assert.rejects(ex.exportCsv(ANN, { columns: ["id", "owner"] }), code("invalid-columns"));
  await assert.rejects(ex.exportCsv(ANN, { columns: ["id", "id"] }), code("invalid-columns"));
  await assert.rejects(ex.exportCsv(ANN, { columns: [] }), code("invalid-columns"));
  const own = await ex.exportCsv(ANN, { columns: ["secret"] });
  assert.equal(await text(own.stream), "Secret\r\ns1\r\ns2\r\ns4\r\n");
  assert.deepEqual(ex.columnsFor(BOB).map((c) => c.key), ["id", "name", "note", "amount"]);
});

test("authorized rows: canExport refuses the whole export before any row is fetched; bad requesters are rejected", async () => {
  const src = source();
  const ex = exporter({ source: src, canExport: (requester) => requester.userId !== "bob" });
  await assert.rejects(ex.exportCsv(BOB, {}), code("forbidden"));
  assert.equal(src.fetchCount, 0);
  await assert.rejects(ex.exportCsv({ tenantId: "", userId: "x" }, {}), code("invalid-request"));
  await assert.rejects(ex.exportCsv({ tenantId: "t1" }, {}), code("invalid-request"));
});

test("authorized rows: the source receives the requester's tenant and user, never a client-chosen tenant", async () => {
  const calls = [];
  const spy = { fetchPage: async (requester, query) => { calls.push({ requester, query }); return { rows: [], nextCursor: null }; } };
  const ex = exporter({ source: spy });
  await text((await ex.exportCsv(ANN, { columns: ["id"], filter: { tenantId: "t2", status: "open" } })).stream);
  assert.equal(calls[0].requester.tenantId, "t1");
  assert.equal(calls[0].requester.userId, "ann");
  assert.deepEqual(calls[0].query.filter, { tenantId: "t2", status: "open" });
  assert.equal(calls[0].query.cursor, null);
});

// --- bounded-export --------------------------------------------------------------------------------------------

function endless(pageSize, log = []) {
  // An unbounded keyset source: id n, cursor = last id.
  return {
    log,
    fetchPage: async (_requester, query) => {
      log.push(query.cursor);
      const start = query.cursor === null ? 0 : Number(query.cursor) + 1;
      const rows = Array.from({ length: query.limit }, (_, i) => ({ id: String(start + i), tenant: "t1", name: `row ${start + i}` }));
      return { rows, nextCursor: rows.at(-1).id };
    },
  };
}
const ID_ONLY = [{ key: "id", header: "ID", value: (r) => r.id }];

test("bounded export: maxRows stops the stream with limit-exceeded instead of silently truncating", async () => {
  const summaries = [];
  const ex = createCsvExporter({ columns: ID_ONLY, source: endless(), pageSize: 10, maxRows: 25, onFinish: (s) => summaries.push(s) });
  await assert.rejects(readAll((await ex.exportCsv(ANN, {})).stream), code("limit-exceeded"));
  assert.equal(summaries[0].ok, false);
  assert.equal(summaries[0].error, "limit-exceeded");
  assert.equal(summaries[0].rows, 25);
});

test("bounded export: exactly maxRows rows export successfully", async () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, tenant: "t1" }));
  const ex = createCsvExporter({ columns: ID_ONLY, source: source(rows), pageSize: 2, maxRows: 6, bom: false });
  assert.equal(await text((await ex.exportCsv(ANN, {})).stream), "ID\r\nr0\r\nr1\r\nr2\r\nr3\r\nr4\r\nr5\r\n");
});

test("bounded export: onLimit truncate ends the file at the row or byte cap and reports truncated", async () => {
  const summaries = [];
  const ex = createCsvExporter({ columns: ID_ONLY, source: endless(), pageSize: 10, maxRows: 15, onLimit: "truncate", bom: false, onFinish: (s) => summaries.push(s) });
  const csv = await text((await ex.exportCsv(ANN, {})).stream);
  assert.equal(csv.split("\r\n").length - 2, 15);
  assert.equal(summaries[0].truncated, true);
  assert.equal(summaries[0].ok, true);
  const bytes = createCsvExporter({ columns: ID_ONLY, source: endless(), pageSize: 10, maxBytes: 40, onLimit: "truncate", bom: false });
  const small = await readAll((await bytes.exportCsv(ANN, {})).stream);
  assert.ok(small.length <= 40);
  assert.equal(small.toString(), "ID\r\n0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\r\n10\r\n");
});

test("bounded export: maxBytes (BOM and header included) stops the stream with limit-exceeded", async () => {
  const ex = createCsvExporter({ columns: ID_ONLY, source: endless(), pageSize: 50, maxBytes: 1_000 });
  const reader = (await ex.exportCsv(ANN, {})).stream.getReader();
  let total = 0;
  await assert.rejects((async () => { for (;;) { const { done, value } = await reader.read(); if (done) return; total += value.byteLength; } })(), code("limit-exceeded"));
  assert.ok(total <= 1_000, `delivered ${total} bytes`);
  assert.throws(() => createCsvExporter({ columns: ID_ONLY, source: endless(), maxBytes: 2 }), RangeError);
});

test("bounded export: streaming applies backpressure, so an unread export fetches only a bounded number of pages", async () => {
  const log = [];
  const ex = createCsvExporter({ columns: ID_ONLY, source: endless(100, log), pageSize: 100, highWaterMark: 256, maxRows: 1_000_000, maxBytes: 1e9 });
  const result = await ex.exportCsv(ANN, {});
  await flush();
  const beforeRead = log.length;
  assert.ok(beforeRead <= 2, `fetched ${beforeRead} pages before any read`);
  const reader = result.stream.getReader();
  for (let i = 0; i < 5; i++) await reader.read();
  await flush();
  assert.ok(log.length > beforeRead && log.length <= beforeRead + 6, `fetched ${log.length} pages after 5 reads`);
  await reader.cancel();
});

test("bounded export: pages are fetched by cursor (keyset), each page at most pageSize rows", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `k${i}`, tenant: "t1" }));
  const src = source(rows);
  const seen = [];
  const spy = { fetchPage: async (r, q) => { seen.push({ cursor: q.cursor, limit: q.limit }); return src.fetchPage(r, q); } };
  const ex = createCsvExporter({ columns: ID_ONLY, source: spy, pageSize: 3, bom: false });
  await text((await ex.exportCsv(ANN, {})).stream);
  assert.deepEqual(seen, [{ cursor: null, limit: 3 }, { cursor: "k2", limit: 3 }, { cursor: "k5", limit: 3 }]);
});

test("bounded export: a source returning more than the page limit or repeating its cursor fails with source-error", async () => {
  const big = { fetchPage: async () => ({ rows: [{ id: "1", tenant: "t1" }, { id: "2", tenant: "t1" }], nextCursor: null }) };
  await assert.rejects(createCsvExporter({ columns: ID_ONLY, source: big, pageSize: 1 }).exportCsv(ANN, {}), code("source-error"));
  let n = 0;
  const stuck = { fetchPage: async () => ({ rows: [{ id: String(n++), tenant: "t1" }], nextCursor: "same" }) };
  await assert.rejects(readAll((await createCsvExporter({ columns: ID_ONLY, source: stuck, pageSize: 5 }).exportCsv(ANN, {})).stream), code("source-error"));
});

test("bounded export: a failing first page rejects exportCsv before any byte is sent; a later failure errors the stream", async () => {
  const down = { fetchPage: async () => { throw new Error("connection refused at 10.0.0.5"); } };
  const error = await createCsvExporter({ columns: ID_ONLY, source: down }).exportCsv(ANN, {}).catch((e) => e);
  assert.ok(code("source-error")(error));
  assert.ok(!error.message.includes("10.0.0.5"), "internal detail stays in error.cause");
  assert.equal(error.cause.message, "connection refused at 10.0.0.5");
  let calls = 0;
  const flaky = { fetchPage: async () => { if (calls++ > 0) throw new Error("boom"); return { rows: [{ id: "1", tenant: "t1" }], nextCursor: "1" }; } };
  await assert.rejects(readAll((await createCsvExporter({ columns: ID_ONLY, source: flaky }).exportCsv(ANN, {})).stream), code("source-error"));
});

test("bounded export: cancelling the stream stops fetching and records a cancelled summary in the export log", async () => {
  const log = [];
  const exportLog = new MemoryExportLog();
  const summaries = [];
  const ex = createCsvExporter({ columns: ID_ONLY, source: endless(10, log), pageSize: 10, log: exportLog, onFinish: (s) => summaries.push(s), now: () => 42 });
  const result = await ex.exportCsv(ANN, {});
  const reader = result.stream.getReader();
  await reader.read();
  await reader.cancel();
  await flush();
  const fetched = log.length;
  await flush();
  assert.equal(log.length, fetched);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].error, "cancelled");
  assert.equal(exportLog.entries.length, 1);
  assert.equal(exportLog.entries[0].tenantId, "t1");
  assert.equal(exportLog.entries[0].startedAt, 42);
});

test("bounded export: an aborted signal stops the stream between pages", async () => {
  const controller = new AbortController();
  const ex = createCsvExporter({ columns: ID_ONLY, source: endless(), pageSize: 5 });
  const result = await ex.exportCsv(ANN, {}, { signal: controller.signal });
  const reader = result.stream.getReader();
  await reader.read();
  controller.abort();
  await assert.rejects((async () => { for (;;) { const { done } = await reader.read(); if (done) return; } })(), code("cancelled"));
});

test("bounded export: an abort while a page fetch is pending is recorded as cancelled, not source-error", async () => {
  const controller = new AbortController();
  const summaries = [];
  let pending;
  const hanging = {
    fetchPage: async (_r, q) => {
      if (q.cursor === null) return { rows: [{ id: "1", tenant: "t1" }], nextCursor: "1" };
      // Like fetch or a pg query cancel: the pending call rejects with the abort reason.
      return new Promise((_resolve, reject) => {
        pending = true;
        q.signal.addEventListener("abort", () => reject(q.signal.reason));
      });
    },
  };
  const ex = createCsvExporter({ columns: ID_ONLY, source: hanging, onFinish: (s) => summaries.push(s) });
  const reader = (await ex.exportCsv(ANN, {}, { signal: controller.signal })).stream.getReader();
  const drained = (async () => { for (;;) { const { done } = await reader.read(); if (done) return; } })();
  await flush();
  assert.equal(pending, true, "the second page fetch is in flight");
  controller.abort();
  await assert.rejects(drained, code("cancelled"));
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].error, "cancelled");
});

test("export log: a completed export records requester, columns, counts and status once", async () => {
  const exportLog = new MemoryExportLog();
  const ex = exporter({ log: exportLog, authorize: (r, row) => row.owner === r.userId });
  await text((await ex.exportCsv(ANN, { columns: ["id", "name"] })).stream);
  assert.equal(exportLog.entries.length, 1);
  assert.deepEqual(
    { ...exportLog.entries[0], bytes: undefined },
    { ok: true, tenantId: "t1", userId: "ann", columns: ["id", "name"], rows: 2, denied: 1, truncated: false, pages: 1, bytes: undefined, startedAt: 1_000, finishedAt: 1_000 },
  );
});

test("configuration is validated: duplicate or invalid column keys, unknown defaults and bad bounds throw", () => {
  assert.throws(() => createCsvExporter({ columns: [...ID_ONLY, ...ID_ONLY], source: source() }), RangeError);
  assert.throws(() => createCsvExporter({ columns: [], source: source() }), RangeError);
  assert.throws(() => createCsvExporter({ columns: ID_ONLY, source: source(), defaultColumns: ["nope"] }), RangeError);
  assert.throws(() => createCsvExporter({ columns: ID_ONLY, source: source(), pageSize: 0 }), RangeError);
  assert.throws(() => createCsvExporter({ columns: ID_ONLY, source: source(), maxRows: -1 }), RangeError);
});

// --- HTTP adapter ----------------------------------------------------------------------------------------------

function handler(extra = {}) {
  return createCsvExportHandler({
    exporter: exporter({ bom: false, authorize: (r, row) => row.owner === r.userId, canReadColumn: (r, key) => key !== "secret" }),
    prefix: "/api/reports",
    authenticate: async (request) => {
      const user = request.headers.get("x-test-user");
      return user ? { tenantId: "t1", userId: user } : null;
    },
    ...extra,
  });
}
const get = (path, user = "ann") => new Request(`https://app.example.com${path}`, { headers: user ? { "x-test-user": user } : {} });

test("HTTP: GET {prefix}/export streams an attachment with text/csv, no-store and the selected columns", async () => {
  const response = await handler()(get("/api/reports/export?columns=id,name&filename=Ventes%20%C3%A9t%C3%A9"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="Ventes _t_.csv"; filename*=UTF-8''Ventes%20%C3%A9t%C3%A9.csv`);
  assert.equal(await response.text(), 'ID,Name\r\n001,"Widget, large"\r\n004,Café ünïcödé 日本\r\n');
});

test("HTTP: GET {prefix}/columns lists only the columns this requester may export", async () => {
  const response = await handler()(get("/api/reports/columns"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { columns: [{ key: "id", header: "ID" }, { key: "name", header: "Name" }, { key: "note", header: "Note" }, { key: "amount", header: "Amount" }], defaults: ["id", "name", "note", "amount"] });
});

test("HTTP: signed-out 401, forbidden column 403, unknown column 400, wrong method 405, unknown path 404", async () => {
  const h = handler();
  assert.equal((await h(get("/api/reports/export", null))).status, 401);
  const forbidden = await h(get("/api/reports/export?columns=secret"));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get("cache-control"), "no-store");
  assert.equal((await forbidden.json()).error, "forbidden");
  assert.equal((await h(get("/api/reports/export?columns=owner"))).status, 400);
  assert.equal((await h(new Request("https://app.example.com/api/reports/export", { method: "POST", headers: { "x-test-user": "ann" } }))).status, 405);
  assert.equal((await h(get("/api/reports/other"))).status, 404);
  assert.equal((await h(get("/elsewhere/export"))).status, 404);
});

test("HTTP: source failures return a generic 500 without internal details and are reported to onError", async () => {
  const errors = [];
  const h = createCsvExportHandler({
    exporter: createCsvExporter({ columns: ID_ONLY, source: { fetchPage: async () => { throw new Error("password=hunter2"); } } }),
    prefix: "/x", authenticate: async () => ANN, onError: (e) => errors.push(e),
  });
  const response = await h(get("/x/export"));
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes("hunter2"));
  assert.equal(JSON.parse(body).error, "source-error");
  assert.equal(errors.length, 1);
});

test("HTTP: routes and statusFor overrides change paths and status codes; parseFilter passes a validated filter", async () => {
  const seen = [];
  const h = handler({
    prefix: "/v2/",
    routes: { export: "/orders.csv", columns: "/orders/fields" },
    statusFor: { forbidden: 404, unauthenticated: 403, "invalid-columns": 422 },
    parseFilter: (url) => {
      const status = url.searchParams.get("status");
      if (status && !["open", "closed"].includes(status)) throw new CsvExportError("invalid-request", "Unknown status");
      seen.push(status);
      return status ? { status } : undefined;
    },
  });
  assert.equal((await h(get("/v2/orders.csv?status=open"))).status, 200);
  assert.deepEqual(seen, ["open"]);
  assert.equal((await h(get("/v2/orders.csv?status=bogus"))).status, 400);
  assert.equal((await h(get("/v2/orders/fields"))).status, 200);
  assert.equal((await h(get("/v2/export"))).status, 404);
  assert.equal((await h(get("/v2/orders.csv?columns=secret"))).status, 404);
  assert.equal((await h(get("/v2/orders.csv", null))).status, 403);
  assert.equal((await h(get("/v2/orders.csv?columns=nope"))).status, 422);
});

test("HTTP: repeated columns parameters are accepted and too many column names are refused", async () => {
  const h = handler();
  const response = await h(get("/api/reports/export?columns=id&columns=note"));
  assert.equal(await response.text(), 'ID,Note\r\n001,"He said ""hi"""\r\n004,\'@SUM(A1)\r\n');
  assert.equal((await h(get(`/api/reports/export?columns=${Array(200).fill("id").join(",")}`))).status, 400);
});
