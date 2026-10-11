// SPDX-License-Identifier: Apache-2.0
// AuditStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns { rows }
// (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql first.
// `append` runs on the caller's transaction executor: it locks the tenant's head row (audit_log_lock_head), builds
// the entry and inserts it, so the entry commits or rolls back with the caller's change and concurrent appends for
// one tenant queue on the head lock. Pass `null` as tx to record on its own, in a transaction from `db.transaction`.
import type { AuditActorType, AuditEntry, AuditFilter, AuditOutcome, AuditStore, ChainHead } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction. Needed only to record with tx = null. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

const COLUMNS = "tenant_id, seq, id, at, actor_type, actor_id, action, target_type, target_id, outcome, request_id, details, prev_hash, hash";

function toEntry(row: Record<string, unknown>): AuditEntry {
  const optional = (key: string) => (row[key] == null ? null : String(row[key]));
  const details = typeof row.details === "string" ? JSON.parse(row.details) as Record<string, unknown> : (row.details ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id), tenantId: String(row.tenant_id), seq: Number(row.seq), at: Number(row.at),
    actorType: String(row.actor_type) as AuditActorType, actorId: String(row.actor_id), action: String(row.action),
    targetType: optional("target_type"), targetId: optional("target_id"), outcome: String(row.outcome) as AuditOutcome,
    requestId: optional("request_id"), details, prevHash: String(row.prev_hash), hash: String(row.hash),
  };
}

function toHead(row: Record<string, unknown>): ChainHead {
  return { seq: Number(row.seq), hash: String(row.hash), anchorSeq: Number(row.anchor_seq), anchorHash: String(row.anchor_hash) };
}

export function createSqlAuditStore(db: SqlExecutor): AuditStore<SqlExecutor | null> {
  async function appendIn(tx: SqlExecutor, tenantId: string, build: (head: ChainHead) => Promise<AuditEntry>): Promise<AuditEntry> {
    const { rows } = await tx.query("SELECT seq, hash, anchor_seq, anchor_hash FROM audit_log_lock_head($1)", [tenantId]);
    const row = rows[0];
    if (!row) throw new Error("audit_log_heads row missing");
    const entry = await build(toHead(row));
    await tx.query(
      `INSERT INTO audit_log (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)`,
      [entry.tenantId, entry.seq, entry.id, entry.at, entry.actorType, entry.actorId, entry.action, entry.targetType, entry.targetId,
        entry.outcome, entry.requestId, JSON.stringify(entry.details), entry.prevHash, entry.hash],
    );
    return entry;
  }

  return {
    async append(tx, tenantId, build) {
      if (tx !== null) return appendIn(tx, tenantId, build);
      if (!db.transaction) throw new Error("Pass the caller's transaction executor, or give the store an executor with transaction()");
      return db.transaction((inner) => appendIn(inner, tenantId, build));
    },
    async head(tenantId) {
      const { rows } = await db.query("SELECT seq, hash, anchor_seq, anchor_hash FROM audit_log_heads WHERE tenant_id = $1", [tenantId]);
      return rows[0] ? toHead(rows[0]) : null;
    },
    async page(tenantId: string, query: AuditFilter & { readonly beforeSeq: number | null; readonly limit: number }) {
      // Column names come from this fixed list, never from the query keys.
      const where = ["tenant_id = $1"];
      const params: unknown[] = [tenantId];
      const add = (clause: (n: string) => string, value: unknown) => { params.push(value); where.push(clause(`$${params.length}`)); };
      if (query.actorId !== undefined) add((n) => `actor_id = ${n}`, query.actorId);
      if (query.action !== undefined) add((n) => `action = ${n}`, query.action);
      if (query.actionPrefix !== undefined) add((n) => `left(action, length(${n}::text)) = ${n}::text`, query.actionPrefix);
      if (query.from !== undefined) add((n) => `at >= ${n}::bigint`, query.from);
      if (query.to !== undefined) add((n) => `at < ${n}::bigint`, query.to);
      if (query.beforeSeq !== null) add((n) => `seq < ${n}::bigint`, query.beforeSeq);
      params.push(query.limit);
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM audit_log WHERE ${where.join(" AND ")} ORDER BY seq DESC LIMIT $${params.length}`, params);
      return rows.map(toEntry);
    },
    async scan(tenantId, afterSeq, uptoSeq, limit) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM audit_log WHERE tenant_id = $1 AND seq > $2 AND seq <= $3 ORDER BY seq LIMIT $4`,
        [tenantId, afterSeq, uptoSeq, limit],
      );
      return rows.map(toEntry);
    },
    async purge(tenantId, before) {
      const { rows } = await db.query("SELECT audit_log_purge($1, $2::bigint) AS deleted", [tenantId, before]);
      return Number(rows[0]?.deleted ?? 0);
    },
    async tenants() {
      const { rows } = await db.query("SELECT tenant_id FROM audit_log_heads ORDER BY tenant_id");
      return rows.map((row) => String(row.tenant_id));
    },
  };
}
