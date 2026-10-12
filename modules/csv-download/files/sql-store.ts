// SPDX-License-Identifier: Apache-2.0
// PostgreSQL adapters for csv-download through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite).
//   createSqlRowSource: tenant-scoped keyset pages over one of your tables
//     SELECT <columns> FROM <table> WHERE <tenant> = $1 [AND <owner> = $2] [AND <filters>] [AND <id> > $n]
//     ORDER BY <id> LIMIT $m
//   createSqlExportLog: one csv_export_log row per export (apply schema.sql first).
// Identifiers come from your configuration, are checked against a strict pattern and double-quoted per part;
// every value is a parameter.
import { CsvExportError } from "./core.js";
import type { ExportLog, ExportRequester, RowPage, RowQuery, RowSource } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlRowSourceOptions {
  /** Your table, optionally schema-qualified (lowercase identifiers only). */
  readonly table: string;
  /** Columns to select. Only these reach the exporter's column value functions. */
  readonly columns: readonly string[];
  /** Unique, indexed ordering column used as the cursor. Default "id". */
  readonly idColumn?: string;
  /** Tenant column compared with requester.tenantId. Default "tenant_id". */
  readonly tenantColumn?: string;
  /** When set, only rows whose owner column equals requester.userId are returned. */
  readonly ownerColumn?: string;
  /**
   * Allowed equality filters: request filter key -> column. A filter object may only use these keys, with string,
   * number or boolean values; anything else fails with invalid-request.
   */
  readonly filters?: Readonly<Record<string, string>>;
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const TABLE = /^([a-z_][a-z0-9_]{0,62}\.)?[a-z_][a-z0-9_]{0,62}$/;

/** Validates and double-quotes an identifier, so keywords such as "order" or "user" work. */
function ident(name: string, what: string): string {
  if (typeof name !== "string" || !IDENT.test(name)) throw new RangeError(`Invalid ${what} ${JSON.stringify(name)}`);
  return `"${name}"`;
}

/** Validates a table name and quotes each part: schema.table -> "schema"."table". */
function tableName(name: string): string {
  if (typeof name !== "string" || !TABLE.test(name)) throw new RangeError("Invalid table name");
  return name.split(".").map((part) => `"${part}"`).join(".");
}

export function createSqlRowSource(db: SqlExecutor, options: SqlRowSourceOptions): RowSource<Record<string, unknown>> {
  const table = tableName(options.table);
  const idName = options.idColumn ?? "id";
  const id = ident(idName, "id column");
  const tenant = ident(options.tenantColumn ?? "tenant_id", "tenant column");
  const owner = options.ownerColumn === undefined ? undefined : ident(options.ownerColumn, "owner column");
  if (!Array.isArray(options.columns) || options.columns.length === 0) throw new RangeError("Select at least one column");
  const selected = [...new Set([id, ...options.columns.map((c) => ident(c, "column"))])];
  const filters = new Map(Object.entries(options.filters ?? {}).map(([key, column]) => [key, ident(column, "filter column")]));

  return {
    async fetchPage(requester: ExportRequester, query: RowQuery): Promise<RowPage<Record<string, unknown>>> {
      const params: unknown[] = [requester.tenantId];
      const where = [`${tenant} = $1`];
      if (owner) { params.push(requester.userId); where.push(`${owner} = $${params.length}`); }
      if (query.filter !== undefined && query.filter !== null) {
        if (typeof query.filter !== "object" || Array.isArray(query.filter)) throw new CsvExportError("invalid-request", "The filter must be an object");
        for (const [key, value] of Object.entries(query.filter as Record<string, unknown>)) {
          const column = filters.get(key);
          if (!column) throw new CsvExportError("invalid-request", `Unknown filter ${key}`);
          if (typeof value !== "string" && typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) {
            throw new CsvExportError("invalid-request", `Invalid value for filter ${key}`);
          }
          params.push(value);
          where.push(`${column} = $${params.length}`);
        }
      }
      if (query.cursor !== null) { params.push(query.cursor); where.push(`${id} > $${params.length}`); }
      // Ask for one extra row to know whether another page exists without an empty final round trip.
      params.push(query.limit + 1);
      const { rows } = await db.query(
        `SELECT ${selected.join(", ")} FROM ${table} WHERE ${where.join(" AND ")} ORDER BY ${id} LIMIT $${params.length}`,
        params,
      );
      const more = rows.length > query.limit;
      const page = more ? rows.slice(0, query.limit) : rows;
      const last = page.at(-1);
      return { rows: page, nextCursor: more && last ? String(last[idName]) : null };
    },
  };
}

export interface SqlExportLogOptions {
  /** Default csv_export_log. */
  readonly table?: string;
}

export function createSqlExportLog(db: SqlExecutor, options: SqlExportLogOptions = {}): ExportLog {
  const table = tableName(options.table ?? "csv_export_log");
  return {
    async record(summary) {
      await db.query(
        `INSERT INTO ${table} (tenant_id, user_id, columns, ok, error, rows_written, rows_denied, bytes, pages, truncated, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [summary.tenantId, summary.userId, summary.columns.join(","), summary.ok, summary.error ?? null, summary.rows, summary.denied,
          summary.bytes, summary.pages, summary.truncated, summary.startedAt, summary.finishedAt],
      );
    },
  };
}
