// SPDX-License-Identifier: Apache-2.0
// FeatureFlagStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. A flag write and its audit entry are one statement (a data-modifying CTE), conditional on the version, so a
// conflicting writer changes nothing and no audit row exists without its change. Inserts use ON CONFLICT DO NOTHING
// so exposures, conversions and first assignments are idempotent under concurrency.
import type {
  FeatureFlagStore, FlagAssignment, FlagAuditEntry, FlagConfig, VariantCount,
} from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const parse = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);
const nullableText = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function toFlag(row: Record<string, unknown>): FlagConfig {
  const config = parse(row.config) as FlagConfig;
  return { ...config, runId: config.runId ?? "", version: Number(row.version), updatedAt: Number(row.updated_at) };
}

function toAssignment(row: Record<string, unknown>): FlagAssignment {
  return {
    flagKey: String(row.flag_key), runId: String(row.run_id), subjectKey: String(row.subject_key), unitId: String(row.unit_id),
    variant: nullableText(row.variant), assignedAt: Number(row.assigned_at),
  };
}

function toAudit(row: Record<string, unknown>): FlagAuditEntry {
  return {
    id: String(row.id), flagKey: String(row.flag_key), action: String(row.action) as FlagAuditEntry["action"],
    actor: String(row.actor), at: Number(row.at),
    before: row.before == null ? null : (parse(row.before) as FlagConfig),
    after: row.after == null ? null : (parse(row.after) as FlagConfig),
  };
}

const toCounts = (rows: Record<string, unknown>[]): VariantCount[] => rows.map((r) => ({ variant: nullableText(r.variant), count: Number(r.count) }));
const ASSIGNMENT = "flag_key, run_id, subject_key, unit_id, variant, assigned_at";
const AUDIT_INSERT = "INSERT INTO feature_flag_audit (id, flag_key, action, actor, at, before, after)";

export function createSqlFeatureFlagStore(db: SqlExecutor): FeatureFlagStore {
  return {
    async listFlags() {
      const { rows } = await db.query("SELECT key, config, version, updated_at FROM feature_flags ORDER BY key");
      return rows.map(toFlag);
    },
    async getFlag(key) {
      const { rows } = await db.query("SELECT key, config, version, updated_at FROM feature_flags WHERE key = $1", [key]);
      return rows[0] ? toFlag(rows[0]) : null;
    },
    async commitFlagChange(change) {
      const a = change.audit;
      const auditParams = [a.id, a.flagKey, a.action, a.actor, a.at, a.before ? JSON.stringify(a.before) : null, a.after ? JSON.stringify(a.after) : null];
      // $1..$7 audit; $8.. the change.
      const auditSelect = `${AUDIT_INSERT} SELECT $1::text, $2::text, $3::text, $4::text, $5::bigint, $6::jsonb, $7::jsonb FROM changed RETURNING id`;
      let sql: string;
      let params: unknown[];
      if (change.next === null) {
        sql = `WITH changed AS (DELETE FROM feature_flags WHERE key = $8 AND version = $9 RETURNING key) ${auditSelect}`;
        params = [...auditParams, change.key, change.expectedVersion];
      } else {
        const n = change.next;
        const values = [change.key, JSON.stringify(n), n.version, n.updatedAt];
        sql = change.expectedVersion === null
          ? `WITH changed AS (INSERT INTO feature_flags (key, config, version, updated_at) VALUES ($8, $9::jsonb, $10, $11) ON CONFLICT (key) DO NOTHING RETURNING key) ${auditSelect}`
          : `WITH changed AS (UPDATE feature_flags SET config = $9::jsonb, version = $10, updated_at = $11 WHERE key = $8 AND version = $12 RETURNING key) ${auditSelect}`;
        params = change.expectedVersion === null ? [...auditParams, ...values] : [...auditParams, ...values, change.expectedVersion];
      }
      const { rows } = await db.query(sql, params);
      return rows.length === 1;
    },
    async listAudit(query) {
      const select = "SELECT id, flag_key, action, actor, at, before, after FROM feature_flag_audit";
      const { rows } = query.flagKey === undefined
        ? await db.query(`${select} ORDER BY seq DESC LIMIT $1`, [query.limit])
        : await db.query(`${select} WHERE flag_key = $1 ORDER BY seq DESC LIMIT $2`, [query.flagKey, query.limit]);
      return rows.map(toAudit);
    },
    async getAssignment(flagKey, runId, subjectKey) {
      const { rows } = await db.query(`SELECT ${ASSIGNMENT} FROM feature_flag_assignments WHERE flag_key = $1 AND run_id = $2 AND subject_key = $3`, [flagKey, runId, subjectKey]);
      return rows[0] ? toAssignment(rows[0]) : null;
    },
    async putAssignmentIfAbsent(a) {
      const inserted = await db.query(
        `INSERT INTO feature_flag_assignments (${ASSIGNMENT}) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (flag_key, run_id, subject_key) DO NOTHING RETURNING ${ASSIGNMENT}`,
        [a.flagKey, a.runId, a.subjectKey, a.unitId, a.variant, a.assignedAt],
      );
      if (inserted.rows[0]) return toAssignment(inserted.rows[0]);
      const { rows } = await db.query(`SELECT ${ASSIGNMENT} FROM feature_flag_assignments WHERE flag_key = $1 AND run_id = $2 AND subject_key = $3`, [a.flagKey, a.runId, a.subjectKey]);
      if (!rows[0]) throw new Error("Assignment vanished during insert");
      return toAssignment(rows[0]);
    },
    async replaceAssignmentVariant(flagKey, runId, unitId, from, to) {
      const { rows } = await db.query(
        "UPDATE feature_flag_assignments SET variant = $5 WHERE flag_key = $1 AND run_id = $2 AND unit_id = $3 AND variant IS NOT DISTINCT FROM $4 RETURNING subject_key",
        [flagKey, runId, unitId, from, to],
      );
      return rows.length;
    },
    async copyAssignments(fromSubjectKey, toSubjectKey, at) {
      const { rows } = await db.query(
        `INSERT INTO feature_flag_assignments (${ASSIGNMENT})
         SELECT flag_key, run_id, $2, unit_id, variant, $3 FROM feature_flag_assignments WHERE subject_key = $1
         ON CONFLICT (flag_key, run_id, subject_key) DO NOTHING RETURNING flag_key`,
        [fromSubjectKey, toSubjectKey, at],
      );
      return rows.length;
    },
    async recordExposure(e) {
      const { rows } = await db.query(
        "INSERT INTO feature_flag_exposures (flag_key, run_id, unit_id, variant, at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (flag_key, run_id, unit_id) DO NOTHING RETURNING unit_id",
        [e.flagKey, e.runId, e.unitId, e.variant, e.at],
      );
      return rows.length === 1;
    },
    async recordConversion(c) {
      const { rows } = await db.query(
        "INSERT INTO feature_flag_conversions (flag_key, run_id, metric, unit_id, at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (flag_key, run_id, metric, unit_id) DO NOTHING RETURNING unit_id",
        [c.flagKey, c.runId, c.metric, c.unitId, c.at],
      );
      return rows.length === 1;
    },
    async exposureCounts(flagKey, runId) {
      const { rows } = await db.query("SELECT variant, count(*)::int AS count FROM feature_flag_exposures WHERE flag_key = $1 AND run_id = $2 GROUP BY variant", [flagKey, runId]);
      return toCounts(rows);
    },
    async conversionCounts(flagKey, runId, metric) {
      const { rows } = await db.query(
        `SELECT e.variant, count(*)::int AS count FROM feature_flag_conversions c
         JOIN feature_flag_exposures e ON e.flag_key = c.flag_key AND e.run_id = c.run_id AND e.unit_id = c.unit_id
         WHERE c.flag_key = $1 AND c.run_id = $2 AND c.metric = $3 GROUP BY e.variant`,
        [flagKey, runId, metric],
      );
      return toCounts(rows);
    },
  };
}
