// SPDX-License-Identifier: Apache-2.0
// PostgreSQL tenant isolation through any `query(text, params)` executor with $1 placeholders that returns
// { rows } (node-postgres Client, postgres.js via a thin wrapper, Neon, PGlite).
//
// Two layers, so a bug in one does not leak data:
// 1. The database: row-level security (ENABLE + FORCE) with a policy comparing tenant_id to the
//    transaction-local setting app.tenant_id, queried as a role that is neither superuser nor BYPASSRLS.
//    With no tenant set the policy matches nothing, so a forgotten withTenant returns zero rows.
// 2. The application: scoped() adds `tenant_id = $n` to every statement and maps foreign ids to not-found.
import { TenantIsolationError, assertTenantId } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction on one connection. Pools must supply this (check out a client, BEGIN, COMMIT/ROLLBACK, release). */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const SETTING = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const COLUMN_TYPES = ["text", "uuid", "bigint", "integer"] as const;
export type TenantColumnType = (typeof COLUMN_TYPES)[number];

export function assertIdentifier(name: string, what = "identifier"): string {
  if (typeof name !== "string" || !IDENT.test(name)) throw new TenantIsolationError("invalid-identifier", `Invalid ${what}: use lowercase letters, digits and underscores`);
  return name;
}

function assertSetting(name: string): string {
  if (!SETTING.test(name)) throw new TenantIsolationError("invalid-identifier", "Invalid setting name: use prefix.name");
  return name;
}

export interface WithTenantOptions {
  /** Role to switch to for the transaction with SET LOCAL ROLE, such as app_user. Use it when the connection logs in as an owner or superuser. */
  readonly role?: string;
  /** Setting that holds the tenant. Default app.tenant_id. */
  readonly setting?: string;
}

/**
 * Runs `fn` in one transaction with the tenant set by set_config(setting, tenantId, true). The setting
 * (and SET LOCAL ROLE) is transaction-local, so it ends at COMMIT or ROLLBACK and a pooled connection
 * never carries a tenant into the next request. With no `transaction` on the executor, BEGIN/COMMIT go
 * through `query`, which is only correct on a dedicated client, never on a pool.
 */
export async function withTenant<T>(executor: SqlExecutor, tenantId: string, fn: (tx: SqlExecutor) => Promise<T>, options: WithTenantOptions = {}): Promise<T> {
  assertTenantId(tenantId);
  const setting = assertSetting(options.setting ?? "app.tenant_id");
  const role = options.role === undefined ? null : assertIdentifier(options.role, "role");
  const run = async (tx: SqlExecutor) => {
    await tx.query("SELECT set_config($1, $2, true)", [setting, tenantId]);
    if (role !== null) await tx.query(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  };
  if (executor.transaction) return executor.transaction(run);
  await executor.query("BEGIN");
  try {
    const result = await run(executor);
    await executor.query("COMMIT");
    return result;
  } catch (error) {
    await executor.query("ROLLBACK");
    throw error;
  }
}

export interface TenantTableOptions {
  /** Tenant column. Default tenant_id. */
  readonly column?: string;
  /** Column type, for the cast of the setting. Default text. */
  readonly columnType?: TenantColumnType;
  /** Setting that holds the tenant. Default app.tenant_id. */
  readonly setting?: string;
  /** Application role to grant table access to. Default app_user. */
  readonly role?: string;
  /** Policy name. Default tenant_isolation. */
  readonly policy?: string;
}

/** The tenant predicate used by policies: NULLIF turns an unset or reset setting ('' after a local set ends) into NULL, which matches no row. */
export function tenantPredicate(options: Pick<TenantTableOptions, "column" | "columnType" | "setting"> = {}): string {
  const column = assertIdentifier(options.column ?? "tenant_id", "column");
  const type = options.columnType ?? "text";
  if (!COLUMN_TYPES.includes(type)) throw new TenantIsolationError("invalid-identifier", "Invalid column type");
  const setting = assertSetting(options.setting ?? "app.tenant_id");
  const value = `NULLIF(current_setting('${setting}', true), '')`;
  return `${column} = ${type === "text" ? value : `${value}::${type}`}`;
}

/**
 * SQL that turns on row-level security for an existing table with a tenant column: ENABLE and FORCE
 * (so the table owner is also filtered), one policy with the same USING and WITH CHECK predicate, and
 * grants to the application role. Idempotent: the policy is dropped and recreated.
 */
export function tenantTableSql(table: string, options: TenantTableOptions = {}): string {
  const name = assertIdentifier(table, "table");
  const role = assertIdentifier(options.role ?? "app_user", "role");
  const policy = assertIdentifier(options.policy ?? "tenant_isolation", "policy");
  const predicate = tenantPredicate(options);
  return [
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS ${policy} ON ${name};`,
    `CREATE POLICY ${policy} ON ${name} USING (${predicate}) WITH CHECK (${predicate});`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${name} TO ${role};`,
  ].join("\n");
}

/**
 * SQL that creates the application role when missing: NOLOGIN (switch to it with SET LOCAL ROLE, or
 * create a LOGIN role that is a member of it), NOSUPERUSER and NOBYPASSRLS, because superusers and
 * BYPASSRLS roles skip every policy. GRANT `role` to your login user so SET ROLE is allowed.
 */
export function appRoleSql(role = "app_user"): string {
  const name = assertIdentifier(role, "role");
  return `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}') THEN
    CREATE ROLE ${name} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;`;
}

export interface IsolationStatus {
  readonly schema: string;
  readonly table: string;
  readonly rowSecurity: boolean;
  readonly forced: boolean;
  readonly policies: readonly string[];
  readonly role: string;
  readonly roleBypassesRls: boolean;
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export interface InspectOptions {
  /** Schema of the table. Default public. */
  readonly schema?: string;
  /** Setting the tenant policies must read. Default app.tenant_id. */
  readonly setting?: string;
}

/**
 * Reads the catalog to confirm a table (in `schema`, default public) has RLS enabled and forced, and that
 * `role` cannot bypass it. Permissive policies are OR-ed, so every permissive policy must read the tenant
 * setting in its USING expression (unless it is INSERT-only) and in its effective WITH CHECK (for ALL,
 * INSERT and UPDATE); one USING (true) policy would open the table. Restrictive policies only narrow
 * access and are not required to read it. This is a textual check that the setting is referenced, not a
 * proof that the expression is correct; the test kit proves behavior.
 */
export async function inspectIsolation(executor: SqlExecutor, table: string, role = "app_user", options: InspectOptions = {}): Promise<IsolationStatus> {
  assertIdentifier(table, "table");
  assertIdentifier(role, "role");
  const schema = assertIdentifier(options.schema ?? "public", "schema");
  const setting = assertSetting(options.setting ?? "app.tenant_id");
  const rel = (await executor.query(
    "SELECT c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind IN ('r', 'p')",
    [table, schema],
  )).rows[0];
  const policyRows = (await executor.query(
    "SELECT policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE schemaname = $1 AND tablename = $2 ORDER BY policyname",
    [schema, table],
  )).rows;
  const policies = policyRows.map((r) => String(r.policyname));
  const roleRow = (await executor.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1", [role])).rows[0];
  const truthy = (v: unknown) => v === true || v === "t";
  const rowSecurity = truthy(rel?.relrowsecurity);
  const forced = truthy(rel?.relforcerowsecurity);
  const roleBypassesRls = !roleRow || truthy(roleRow.rolsuper) || truthy(roleRow.rolbypassrls);
  const problems: string[] = [];
  if (!rel) problems.push(`table ${schema}.${table} not found`);
  else {
    if (!rowSecurity) problems.push("row level security is not enabled");
    if (!forced) problems.push("row level security is not forced, so the table owner bypasses it");
    // Deparsed policy text reads current_setting('app.tenant_id'::text, true).
    const reads = (expr: unknown) => typeof expr === "string" && expr.includes(`current_setting('${setting}'`);
    const permissive = policyRows.filter((r) => String(r.permissive).toUpperCase() !== "RESTRICTIVE");
    if (permissive.length === 0) problems.push("no permissive policy: RLS without one denies everything");
    for (const r of permissive) {
      const cmd = String(r.cmd).toUpperCase();
      const name = String(r.policyname);
      if (cmd !== "INSERT" && !reads(r.qual)) problems.push(`permissive policy ${name} (${cmd}) USING does not read ${setting}, so it opens rows across tenants`);
      if (["ALL", "INSERT", "UPDATE"].includes(cmd) && !reads(r.with_check ?? r.qual)) problems.push(`permissive policy ${name} (${cmd}) WITH CHECK does not read ${setting}, so rows can be written into any tenant`);
    }
  }
  if (!roleRow) problems.push(`role ${role} does not exist`);
  else if (roleBypassesRls) problems.push(`role ${role} is a superuser or has BYPASSRLS`);
  return { schema, table, rowSecurity, forced, policies, role, roleBypassesRls, ok: problems.length === 0, problems };
}

export interface ScopedOptions {
  readonly table: string;
  /** Columns that may be read and written (the tenant and id columns are added). Values are always parameters; names come only from this list. */
  readonly columns: readonly string[];
  /** Primary key column. Default id. */
  readonly idColumn?: string;
  /** Tenant column. Default tenant_id. */
  readonly tenantColumn?: string;
}

export interface ScopedRepository {
  /** The row with `id` in this tenant, or null (also when the id belongs to another tenant). */
  get(id: string): Promise<Record<string, unknown> | null>;
  /** Like get, but throws `not-found`. */
  require(id: string): Promise<Record<string, unknown>>;
  /** This tenant's rows ordered by id, after `after`, at most `limit` (1 to 500, default 50). */
  list(page?: { readonly after?: string; readonly limit?: number }): Promise<Record<string, unknown>[]>;
  /** Inserts a row in this tenant. A different tenant value in `values` fails with `tenant-mismatch`. */
  insert(values: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>;
  /** Updates the row in this tenant and returns it, or null when it is not in this tenant. The tenant and id cannot change. */
  update(id: string, patch: Readonly<Record<string, unknown>>): Promise<Record<string, unknown> | null>;
  /** Deletes the row in this tenant; false when it is not in this tenant. */
  delete(id: string): Promise<boolean>;
}

/** Repository whose every statement adds `tenant_column = $n`, as defense in depth over RLS. Use it inside withTenant. */
export function scoped(executor: SqlExecutor, tenantId: string, options: ScopedOptions): ScopedRepository {
  assertTenantId(tenantId);
  const table = assertIdentifier(options.table, "table");
  const idColumn = assertIdentifier(options.idColumn ?? "id", "column");
  const tenantColumn = assertIdentifier(options.tenantColumn ?? "tenant_id", "column");
  const allowed = new Set([idColumn, tenantColumn, ...options.columns.map((c) => assertIdentifier(c, "column"))]);
  const select = [...allowed].join(", ");
  const known = (key: string) => {
    if (!allowed.has(key)) throw new TenantIsolationError("invalid-column", `Unknown column ${key}`);
    return key;
  };
  const get = async (id: string) =>
    (await executor.query(`SELECT ${select} FROM ${table} WHERE ${idColumn} = $1 AND ${tenantColumn} = $2`, [id, tenantId])).rows[0] ?? null;

  return {
    get,
    async require(id) {
      const row = await get(id);
      if (!row) throw new TenantIsolationError("not-found", "Not found");
      return row;
    },
    async list(page = {}) {
      const limit = page.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new TenantIsolationError("invalid-limit", "limit must be 1 to 500");
      const { rows } = page.after === undefined
        ? await executor.query(`SELECT ${select} FROM ${table} WHERE ${tenantColumn} = $1 ORDER BY ${idColumn} LIMIT $2`, [tenantId, limit])
        : await executor.query(`SELECT ${select} FROM ${table} WHERE ${tenantColumn} = $1 AND ${idColumn} > $2 ORDER BY ${idColumn} LIMIT $3`, [tenantId, page.after, limit]);
      return rows;
    },
    async insert(values) {
      const given = values[tenantColumn];
      if (given !== undefined && given !== tenantId) throw new TenantIsolationError("tenant-mismatch", "Row belongs to another tenant");
      const keys = Object.keys(values).filter((k) => k !== tenantColumn).map(known);
      const cols = [tenantColumn, ...keys];
      const params = [tenantId, ...keys.map((k) => values[k])];
      const { rows } = await executor.query(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING ${select}`,
        params,
      );
      const row = rows[0];
      if (!row) throw new TenantIsolationError("not-found", "Insert returned no row");
      return row;
    },
    async update(id, patch) {
      const keys = Object.keys(patch).map(known);
      if (keys.includes(tenantColumn) || keys.includes(idColumn)) throw new TenantIsolationError("invalid-column", "The tenant and id columns cannot change");
      if (keys.length === 0) return get(id);
      const params: unknown[] = [id, tenantId, ...keys.map((k) => patch[k])];
      const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
      const { rows } = await executor.query(`UPDATE ${table} SET ${sets} WHERE ${idColumn} = $1 AND ${tenantColumn} = $2 RETURNING ${select}`, params);
      return rows[0] ?? null;
    },
    async delete(id) {
      const { rows } = await executor.query(`DELETE FROM ${table} WHERE ${idColumn} = $1 AND ${tenantColumn} = $2 RETURNING ${idColumn}`, [id, tenantId]);
      return rows.length === 1;
    },
  };
}
