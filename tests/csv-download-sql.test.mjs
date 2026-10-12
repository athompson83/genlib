// SPDX-License-Identifier: Apache-2.0
// csv-download on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL row
// source scopes pages to the requester's tenant (and owner), pages by keyset, applies only allow-listed filters,
// and the export log records one row per export.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCsvExporter, CsvExportError } from "../.build/modules/csv-download/files/core.js";
import { createSqlRowSource, createSqlExportLog } from "../.build/modules/csv-download/files/sql-store.js";

const schema = readFileSync(new URL("../modules/csv-download/files/schema.sql", import.meta.url), "utf8");

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(`CREATE TABLE orders (id text PRIMARY KEY, tenant_id text NOT NULL, owner_id text NOT NULL,
    status text NOT NULL, customer text NOT NULL, total numeric NOT NULL, internal_note text)`);
  const values = [];
  for (let i = 0; i < 25; i++) {
    const id = `o${String(i).padStart(3, "0")}`;
    values.push(`('${id}', '${i % 5 === 0 ? "t2" : "t1"}', '${i % 2 ? "ann" : "bob"}', '${i % 3 ? "open" : "closed"}', 'Customer ${i}', ${i}.5, 'note ${i}')`);
  }
  values.push(`('o900', 't1', 'ann', 'open', '=cmd|'' /C calc''!A0', 1, null)`);
  await db.exec(`INSERT INTO orders VALUES ${values.join(",")}`);
  const queries = [];
  const executor = { query: (text, params) => { queries.push({ text, params }); return db.query(text, params); } };
  return { db, executor, queries };
}

const COLUMNS = [
  { key: "id", header: "Order", value: (r) => r.id },
  { key: "customer", header: "Customer", value: (r) => r.customer },
  { key: "total", header: "Total", value: (r) => r.total },
];

async function text(stream) {
  return Buffer.from(await new Response(stream).arrayBuffer()).toString("utf8");
}

test("SQL: schema applies; the row source returns only the requester's tenant, paged by keyset with LIMIT", async () => {
  const { db, executor, queries } = await setup();
  const source = createSqlRowSource(executor, { table: "orders", columns: ["customer", "total", "tenant_id"] });
  const ex = createCsvExporter({ columns: COLUMNS, source, pageSize: 7, bom: false, tenantOf: (r) => r.tenant_id });
  const csv = await text((await ex.exportCsv({ tenantId: "t2", userId: "eve" }, { columns: ["id"] })).stream);
  assert.equal(csv, "Order\r\no000\r\no005\r\no010\r\no015\r\no020\r\n");
  const before = queries.length;
  const t1 = await text((await ex.exportCsv({ tenantId: "t1", userId: "ann" }, { columns: ["id"] })).stream);
  assert.equal(t1.split("\r\n").length - 2, 21);
  assert.ok(!t1.includes("o005"));
  const t1Queries = queries.slice(before);
  assert.ok(t1Queries.every((q) => /WHERE "tenant_id" = \$1/.test(q.text) && /ORDER BY "id" LIMIT/.test(q.text)));
  // Three pages of 7: the cursor is the last id of the previous page; each query asks for limit + 1 rows.
  assert.deepEqual(t1Queries.map((q) => q.params), [["t1", 8], ["t1", "o008", 8], ["t1", "o017", 8]]);
  await db.close();
});

test("SQL: ownerColumn restricts rows to the requester, and allow-listed filters are parameterized", async () => {
  const { db, executor, queries } = await setup();
  const source = createSqlRowSource(executor, {
    table: "orders", columns: ["customer", "total"], ownerColumn: "owner_id", filters: { status: "status" },
  });
  const ex = createCsvExporter({ columns: COLUMNS, source, bom: false });
  const csv = await text((await ex.exportCsv({ tenantId: "t1", userId: "ann" }, { columns: ["id"], filter: { status: "closed" } })).stream);
  assert.equal(csv, "Order\r\no003\r\no009\r\no021\r\n");
  const last = queries.at(-1);
  assert.match(last.text, /"owner_id" = \$2 AND "status" = \$3/);
  assert.deepEqual(last.params, ["t1", "ann", "closed", 501]);
  await assert.rejects(ex.exportCsv({ tenantId: "t1", userId: "ann" }, { filter: { tenant_id: "t2" } }), (e) => e instanceof CsvExportError && e.code === "invalid-request");
  await assert.rejects(ex.exportCsv({ tenantId: "t1", userId: "ann" }, { filter: { status: { $ne: 1 } } }), (e) => e instanceof CsvExportError && e.code === "invalid-request");
  assert.throws(() => createSqlRowSource(executor, { table: "orders; drop table orders", columns: ["id"] }), RangeError);
  assert.throws(() => createSqlRowSource(executor, { table: "orders", columns: ["id, (select 1)"] }), RangeError);
  await db.close();
});

test("SQL: formula-like database text is neutralized and numeric columns come through; the export log records the run", async () => {
  const { db, executor } = await setup();
  const ex = createCsvExporter({
    columns: COLUMNS, source: createSqlRowSource(executor, { table: "orders", columns: ["customer", "total"], filters: { status: "status" } }),
    log: createSqlExportLog(executor), bom: false, now: () => 5_000,
  });
  const csv = await text((await ex.exportCsv({ tenantId: "t1", userId: "ann" }, { columns: ["id", "customer"] })).stream);
  assert.ok(csv.endsWith("o900,'=cmd|' /C calc'!A0\r\n"), csv.slice(-60));
  const log = (await db.query("SELECT tenant_id, user_id, columns, ok, error, rows_written, rows_denied, truncated, started_at FROM csv_export_log")).rows;
  assert.equal(log.length, 1);
  assert.deepEqual({ ...log[0], started_at: Number(log[0].started_at) }, {
    tenant_id: "t1", user_id: "ann", columns: "id,customer", ok: true, error: null, rows_written: 21, rows_denied: 0, truncated: false, started_at: 5_000,
  });
  await db.close();
});

test("SQL: a row cap on a real table fails the stream and logs limit-exceeded", async () => {
  const { db, executor } = await setup();
  const ex = createCsvExporter({
    columns: COLUMNS, source: createSqlRowSource(executor, { table: "orders", columns: ["customer"] }),
    log: createSqlExportLog(executor), pageSize: 5, maxRows: 10,
  });
  await assert.rejects(text((await ex.exportCsv({ tenantId: "t1", userId: "ann" }, { columns: ["id"] })).stream), (e) => e?.code === "limit-exceeded");
  const log = (await db.query("SELECT ok, error, rows_written FROM csv_export_log")).rows;
  assert.deepEqual(log, [{ ok: false, error: "limit-exceeded", rows_written: 10 }]);
  await db.close();
});

test("SQL: keyword table and column names are quoted per identifier part, including schema-qualified tables", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "order" (id text PRIMARY KEY, tenant_id text NOT NULL, "user" text NOT NULL, "select" text);
    INSERT INTO "order" VALUES ('a1', 't1', 'ann', 'x'), ('a2', 't2', 'eve', 'y'), ('a3', 't1', 'bob', 'z')`);
  const executor = { query: (text, params) => db.query(text, params) };
  const columns = [{ key: "id", header: "ID", value: (r) => r.id }, { key: "select", header: "Select", value: (r) => r.select }];
  for (const table of ["order", "public.order"]) {
    const source = createSqlRowSource(executor, { table, columns: ["select", "user"], ownerColumn: "user", filters: { pick: "select" } });
    const ex = createCsvExporter({ columns, source, bom: false, pageSize: 1 });
    assert.equal(await text((await ex.exportCsv({ tenantId: "t1", userId: "ann" }, {})).stream), "ID,Select\r\na1,x\r\n");
    assert.equal(await text((await ex.exportCsv({ tenantId: "t1", userId: "bob" }, { filter: { pick: "z" } })).stream), "ID,Select\r\na3,z\r\n");
  }
  await db.exec(`CREATE TABLE "user" (id text PRIMARY KEY, tenant_id text NOT NULL)`);
  await createCsvExporter({ columns: [{ key: "id", header: "ID", value: (r) => r.id }], source: createSqlRowSource(executor, { table: "user", columns: ["id"] }) })
    .exportCsv({ tenantId: "t1", userId: "ann" }, {});
  await db.close();
});
