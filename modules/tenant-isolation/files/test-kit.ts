// SPDX-License-Identifier: Apache-2.0
// Reusable cross-tenant test kit. Call assertTenantIsolation from your own test suite against your real
// tables (in a test database) to prove that, as the application role, tenant A cannot select, update,
// delete, insert-as or move rows into tenant B, that no tenant set means no rows, and that the tenant
// setting does not outlive its transaction. It seeds one row per tenant and deletes them afterwards.
// It throws TenantIsolationAssertionError listing every failed check; it never uses node:assert, so it
// also runs in Workers, Deno and Bun test runners. A check it cannot prove is reported as not-checked,
// never as passed: the setting-lifetime check needs one dedicated connection (`client`), because on a
// pool the follow-up query may land on another connection that never had the setting.
import { assertIdentifier, withTenant } from "./sql.js";
import type { SqlExecutor } from "./sql.js";
import { assertTenantId } from "./core.js";

export interface IsolationKitOptions {
  readonly executor: SqlExecutor;
  readonly table: string;
  /** Two distinct tenant ids to seed. */
  readonly tenants: readonly [string, string];
  /** A complete insertable row for `tenantId` (the kit sets the tenant column). Must include the id column with a fresh unique id. */
  readonly row: (tenantId: string, index: number) => Readonly<Record<string, unknown>>;
  /** Application role (not superuser, not BYPASSRLS). Required when the connection user can bypass RLS. */
  readonly role?: string;
  readonly idColumn?: string;
  readonly tenantColumn?: string;
  readonly setting?: string;
  /**
   * One dedicated connection (for example a checked-out pg Client) used for the setting-lifetime check, so
   * the before and after queries run on the same connection. Without it, an executor without transaction()
   * is treated as a dedicated client; an executor with transaction() (a pool) gets status not-checked.
   */
  readonly client?: SqlExecutor;
}

export type IsolationCheckStatus = "passed" | "failed" | "not-checked";

export interface IsolationCheck {
  readonly name: string;
  readonly status: IsolationCheckStatus;
  /** True only when status is passed. */
  readonly passed: boolean;
  readonly detail: string;
}

export class TenantIsolationAssertionError extends Error {
  readonly checks: readonly IsolationCheck[];
  constructor(checks: readonly IsolationCheck[]) {
    const failed = checks.filter((c) => c.status === "failed");
    super(`Tenant isolation failed ${failed.length} check(s): ${failed.map((c) => `${c.name} (${c.detail})`).join("; ")}`);
    this.name = "TenantIsolationAssertionError";
    this.checks = checks;
  }
}

const truthy = (v: unknown) => v === true || v === "t";

async function inTransaction<T>(executor: SqlExecutor, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  if (executor.transaction) return executor.transaction(fn);
  await executor.query("BEGIN");
  try {
    const result = await fn(executor);
    await executor.query("COMMIT");
    return result;
  } catch (error) {
    await executor.query("ROLLBACK");
    throw error;
  }
}

/** Runs every check and returns them; throws TenantIsolationAssertionError when any fails. */
export async function assertTenantIsolation(options: IsolationKitOptions): Promise<readonly IsolationCheck[]> {
  const { executor } = options;
  const table = assertIdentifier(options.table, "table");
  const idColumn = assertIdentifier(options.idColumn ?? "id", "column");
  const tenantColumn = assertIdentifier(options.tenantColumn ?? "tenant_id", "column");
  const setting = options.setting ?? "app.tenant_id";
  const [a, b] = options.tenants;
  assertTenantId(a);
  assertTenantId(b);
  if (a === b) throw new RangeError("tenants must differ");
  const scope = { ...(options.role === undefined ? {} : { role: options.role }), setting };
  const as = <T>(tenant: string, fn: (tx: SqlExecutor) => Promise<T>) => withTenant(executor, tenant, fn, scope);
  const checks: IsolationCheck[] = [];
  const record = (name: string, status: IsolationCheckStatus, detail: string) => { checks.push({ name, status, passed: status === "passed", detail }); };
  const check = (name: string, passed: boolean, detail: string) => { record(name, passed ? "passed" : "failed", detail); };

  const insertRow = async (tx: SqlExecutor, tenant: string, values: Readonly<Record<string, unknown>>) => {
    const keys = Object.keys(values).filter((k) => k !== tenantColumn).map((k) => assertIdentifier(k, "column"));
    const cols = [tenantColumn, ...keys];
    await tx.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, [tenant, ...keys.map((k) => values[k])]);
  };
  const idOf = (values: Readonly<Record<string, unknown>>) => {
    const id = values[idColumn];
    if (id === undefined || id === null) throw new RangeError(`row() must include ${idColumn}`);
    return id;
  };

  const rowA = options.row(a, 0);
  const rowB = options.row(b, 0);
  const idA = idOf(rowA);
  const idB = idOf(rowB);
  const seeded: Array<[string, unknown]> = [];
  try {
    const role = await as(a, async (tx) => (await tx.query("SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).rows[0]);
    const bypass = !role || truthy(role.rolsuper) || truthy(role.rolbypassrls);
    check("role-cannot-bypass-rls", !bypass, bypass ? `role ${String(role?.name)} is a superuser or has BYPASSRLS; pass a restricted role` : `role ${String(role?.name)}`);
    if (bypass) throw new TenantIsolationAssertionError(checks);

    await as(a, (tx) => insertRow(tx, a, rowA));
    seeded.push([a, idA]);
    await as(b, (tx) => insertRow(tx, b, rowB));
    seeded.push([b, idB]);

    const visible = await as(a, async (tx) => (await tx.query(`SELECT ${tenantColumn} AS t, ${idColumn} AS id FROM ${table}`)).rows);
    const foreign = visible.filter((r) => String(r.t) !== a);
    check("unscoped-select-sees-only-own-tenant", foreign.length === 0 && visible.some((r) => r.id === idA),
      `${visible.length} visible, ${foreign.length} from other tenants`);

    const byId = await as(a, async (tx) => (await tx.query(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = $1`, [idB])).rows.length);
    check("select-other-tenant-id-returns-nothing", byId === 0, `${byId} row(s)`);

    const updated = await as(a, async (tx) => (await tx.query(`UPDATE ${table} SET ${tenantColumn} = ${tenantColumn} WHERE ${idColumn} = $1 RETURNING ${idColumn}`, [idB])).rows.length);
    check("update-other-tenant-row-affects-nothing", updated === 0, `${updated} row(s)`);

    const deleted = await as(a, async (tx) => (await tx.query(`DELETE FROM ${table} WHERE ${idColumn} = $1 RETURNING ${idColumn}`, [idB])).rows.length);
    check("delete-other-tenant-row-affects-nothing", deleted === 0, `${deleted} row(s)`);

    const extra = options.row(b, 1);
    let inserted = false;
    try { await as(a, (tx) => insertRow(tx, b, extra)); inserted = true; seeded.push([b, idOf(extra)]); } catch { /* refused by WITH CHECK */ }
    check("insert-as-other-tenant-is-refused", !inserted, inserted ? "row inserted" : "refused");

    let moved = false;
    try {
      moved = await as(a, async (tx) => (await tx.query(`UPDATE ${table} SET ${tenantColumn} = $1 WHERE ${idColumn} = $2 RETURNING ${idColumn}`, [b, idA])).rows.length > 0);
    } catch { /* refused by WITH CHECK */ }
    if (moved) { seeded.splice(0, 1, [b, idA]); }
    check("move-row-to-other-tenant-is-refused", !moved, moved ? "row moved" : "refused");

    const unset = await inTransaction(executor, async (tx) => {
      if (options.role !== undefined) await tx.query(`SET LOCAL ROLE ${assertIdentifier(options.role, "role")}`);
      return (await tx.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n;
    });
    check("no-tenant-set-returns-no-rows", Number(unset) === 0, `${String(unset)} row(s)`);

    const leakName = "tenant-setting-does-not-outlive-transaction";
    const client = options.client ?? (executor.transaction ? null : executor);
    if (client === null) {
      record(leakName, "not-checked", "executor.transaction() may run on a different pooled connection than a follow-up query; pass client (one dedicated connection) to check");
    } else {
      const inside = await withTenant(client, a, async (tx) => (await tx.query("SELECT current_setting($1, true) AS v, current_user AS u", [setting])).rows[0], scope);
      const after = (await client.query("SELECT current_setting($1, true) AS v, current_user AS u", [setting])).rows[0];
      const setInside = inside?.v === a && (options.role === undefined || inside?.u === options.role);
      const clearedAfter = (after?.v === null || after?.v === undefined || after?.v === "") && (options.role === undefined || after?.u !== options.role);
      check(leakName, setInside && clearedAfter,
        `same connection: inside ${JSON.stringify(inside?.v ?? null)} as ${String(inside?.u)}, after commit ${JSON.stringify(after?.v ?? null)} as ${String(after?.u)}`);
    }
  } finally {
    for (const [tenant, id] of seeded) {
      await as(tenant, (tx) => tx.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [id])).catch(() => undefined);
    }
  }
  if (checks.some((c) => c.status === "failed")) throw new TenantIsolationAssertionError(checks);
  return checks;
}
