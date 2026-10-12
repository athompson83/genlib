// SPDX-License-Identifier: Apache-2.0
// PostgreSQL KeysetSource and SQL builder. Generates one parameterized statement per page:
//   SELECT <columns> FROM <table>
//   WHERE <scope equalities> AND <filter equalities> AND <seek predicate>
//   ORDER BY <sort columns in scan order> LIMIT $n
// Identifiers are validated and double-quoted. Timestamp sort keys are selected with to_char(... 'US') and bound as
// $n::timestamptz, so microseconds survive the round trip through the cursor.
// The seek predicate is a row comparison, (a, b) < ($1, $2), when every sort column runs the same direction (it can
// be an index condition), and an expanded OR chain with a leading bound on the first column for mixed ASC/DESC.
// There is never an OFFSET. Create a B-tree index on (scope columns..., sort columns...) with matching directions
// for each declared sort. Works with any `query(text, params)` executor using $1 placeholders and returning { rows }
// (node-postgres, Neon serverless, PGlite, postgres.js through a small wrapper).
import { KeysetError, SQL_IDENTIFIER } from "./core.js";
import type { CursorValue, FilterValue, KeyedRow, KeysetFetch, KeysetSource, OrderField } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlCondition {
  readonly column: string;
  /** Scalar: equality (null: IS NULL). Array: = ANY($n). */
  readonly value: FilterValue;
}

export interface KeysetQueryInput {
  readonly table: string;
  /** Selected columns. Default ["*"]. */
  readonly columns?: readonly string[];
  readonly conditions?: readonly SqlCondition[];
  readonly order: readonly OrderField[];
  readonly after: readonly CursorValue[] | null;
  readonly limit: number;
  /**
   * Extra trusted predicate written by your code. Call `param(value)` for every value to get its placeholder;
   * never concatenate request input into the returned text.
   */
  readonly where?: (param: (value: unknown) => string) => string;
  /** Also select every sort key as "__keyset_k<i>" (timestamps as exact text). Used by the SQL source. */
  readonly selectKeys?: boolean;
}

export interface SqlQuery { readonly text: string; readonly params: unknown[] }

/** Validates, then double-quotes each part, so keyword names such as "order" or "user" are safe. */
function identifier(name: string): string {
  if (!SQL_IDENTIFIER.test(name)) throw new RangeError(`Invalid SQL identifier: ${name}`);
  return name.split(".").map((part) => `"${part}"`).join(".");
}

const columnOf = (field: OrderField): string => identifier(field.column ?? field.key);
/** Placeholder for a cursor value; timestamp keys are bound as exact microsecond text. */
const bound = (field: OrderField, placeholder: string): string => (field.type === "timestamp" ? `${placeholder}::timestamptz` : placeholder);
/** Exact UTC text for a timestamptz sort column (drivers would round it to a millisecond Date). */
export const timestampKeySql = (column: string): string =>
  `to_char(${identifier(column)} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const KEY_ALIAS = "__keyset_k";

/** Builds the keyset SELECT. All values are bound parameters; identifiers are validated, never quoted from input. */
export function buildKeysetQuery(input: KeysetQueryInput): SqlQuery {
  const params: unknown[] = [];
  const param = (value: unknown): string => { params.push(value); return `$${params.length}`; };
  const table = identifier(input.table);
  if (input.order.length === 0) throw new RangeError("order must list at least one field");
  const selected = (input.columns ?? ["*"]).map((c) => (c === "*" ? c : identifier(c)));
  if (input.selectKeys) {
    input.order.forEach((field, i) => {
      const column = field.column ?? field.key;
      selected.push(`${field.type === "timestamp" ? timestampKeySql(column) : identifier(column)} AS "${KEY_ALIAS}${i}"`);
    });
  }
  const columns = selected.join(", ");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new RangeError("limit must be a positive integer");
  const where: string[] = [];
  for (const condition of input.conditions ?? []) {
    const column = identifier(condition.column);
    if (condition.value === null) where.push(`${column} IS NULL`);
    else if (Array.isArray(condition.value)) where.push(`${column} = ANY(${param(condition.value)})`);
    else where.push(`${column} = ${param(condition.value)}`);
  }
  if (input.where) where.push(`(${input.where(param)})`);
  if (input.after) {
    const after = input.after;
    if (after.length !== input.order.length) throw new RangeError("cursor tuple length does not match the order");
    const op = (field: OrderField) => (field.direction === "asc" ? ">" : "<");
    const first = input.order[0] as OrderField;
    if (input.order.every((field) => field.direction === first.direction)) {
      const placeholders = after.map((value, i) => bound(input.order[i] as OrderField, param(value)));
      where.push(input.order.length === 1
        ? `${columnOf(first)} ${op(first)} ${placeholders[0]}`
        : `(${input.order.map(columnOf).join(", ")}) ${op(first)} (${placeholders.join(", ")})`);
    } else {
      const placeholders = after.map((value, i) => bound(input.order[i] as OrderField, param(value)));
      const branches = input.order.map((field, i) => {
        const equal = input.order.slice(0, i).map((prior, j) => `${columnOf(prior)} = ${placeholders[j]}`);
        return `(${[...equal, `${columnOf(field)} ${op(field)} ${placeholders[i]}`].join(" AND ")})`;
      });
      // The leading bound lets an index on the first sort column narrow the scan.
      where.push(`${columnOf(first)} ${op(first)}= ${placeholders[0]}`);
      where.push(`(${branches.join(" OR ")})`);
    }
  }
  const orderBy = input.order.map((field) => `${columnOf(field)} ${field.direction === "asc" ? "ASC" : "DESC"}`).join(", ");
  const text = `SELECT ${columns} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy} LIMIT ${param(input.limit)}`;
  return { text, params };
}

export interface SqlKeysetSourceOptions<T> {
  readonly table: string;
  readonly columns?: readonly string[];
  /**
   * Scope key -> column, e.g. { tenantId: "tenant_id" }. Every listed key must be present in each request's scope
   * and every scope key must be listed, so a list can never run unscoped or silently ignore a scope value.
   */
  readonly scopeColumns: Readonly<Record<string, string>>;
  /** Filter key -> column. Unlisted filter keys are refused with invalid-filter. */
  readonly filterColumns?: Readonly<Record<string, string>>;
  readonly where?: KeysetQueryInput["where"];
  /** Maps a result row to an item. Default: the row unchanged (keys are column names). */
  readonly toItem?: (row: Record<string, unknown>) => T;
}

export function createSqlKeysetSource<T>(db: SqlExecutor, options: SqlKeysetSourceOptions<T>): KeysetSource<T> {
  identifier(options.table);
  const scopeColumns = Object.entries(options.scopeColumns);
  for (const [, column] of scopeColumns) identifier(column);
  const filterColumns = new Map(Object.entries(options.filterColumns ?? {}));
  for (const column of filterColumns.values()) identifier(column);
  const toItem = options.toItem ?? ((row: Record<string, unknown>) => row as T);
  async function fetchWithKeys(query: KeysetFetch): Promise<readonly KeyedRow<T>[]> {
      const conditions: SqlCondition[] = [];
      for (const key of Object.keys(query.scope)) {
        if (!Object.prototype.hasOwnProperty.call(options.scopeColumns, key)) throw new Error(`Scope key ${key} has no scopeColumns entry`);
      }
      for (const [key, column] of scopeColumns) {
        const value = query.scope[key];
        if (value === undefined) throw new Error(`Scope is missing ${key}; refusing an unscoped list`);
        conditions.push({ column, value });
      }
      for (const [key, value] of Object.entries(query.filters)) {
        const column = filterColumns.get(key);
        if (!column) throw new KeysetError("invalid-filter", `Unknown filter ${key}`);
        conditions.push({ column, value });
      }
      const sql = buildKeysetQuery({
        table: options.table, conditions, order: query.order, after: query.after, limit: query.limit, selectKeys: true,
        ...(options.columns ? { columns: options.columns } : {}), ...(options.where ? { where: options.where } : {}),
      });
      const { rows } = await db.query(sql.text, sql.params);
      return rows.map((row) => {
        const keys = query.order.map((_, i) => row[`${KEY_ALIAS}${i}`]);
        const rest: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(row)) if (!name.startsWith(KEY_ALIAS)) rest[name] = value;
        return { item: toItem(rest), keys };
      });
  }
  return {
    fetchWithKeys,
    async fetch(query: KeysetFetch): Promise<readonly T[]> {
      return (await fetchWithKeys(query)).map((row) => row.item);
    },
  };
}
