// SPDX-License-Identifier: Apache-2.0
// SchedulerStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Every state change is one statement: materializing is a CTE that compare-and-sets next_run_at and inserts
// runs with ON CONFLICT (schedule_id, scheduled_for) DO NOTHING; claims, slots, heartbeats and finishes are
// conditional UPDATEs, which PostgreSQL re-checks on the locked row, so they are safe across connections.
import type { CatchUpPolicy, FinishPatch, OverlapPolicy, RunRecord, RunStatus, ScheduleRecord, SchedulerStore, SlotResult } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Optional; not needed by this store, accepted so the same executor can be shared with other Genlib stores. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlStoreOptions {
  /** Schedule table (default scheduled_tasks). Lower-case letters, digits and underscores only. */
  readonly table?: string;
  /** Run table (default scheduled_task_runs). */
  readonly runTable?: string;
}

const SCHEDULE_COLUMNS = "id, cron, time_zone, handler, payload::text AS payload, overlap, catch_up, max_catch_up, grace_ms, " +
  "max_attempts, retry_base_ms, retry_max_ms, lease_ms, enabled, next_run_at, created_at, updated_at";
const RUN_COLUMNS = "id, schedule_id, scheduled_for, status, attempt, next_attempt_at, lease_owner, lease_expires_at, " +
  "started_at, finished_at, error, created_at";
const NAME = /^[a-z_][a-z0-9_]{0,62}$/;

const optNumber = (value: unknown): number | null => (value == null ? null : Number(value));

function toSchedule(row: Record<string, unknown>): ScheduleRecord {
  return {
    id: String(row.id), cron: String(row.cron), timeZone: String(row.time_zone), handler: String(row.handler),
    payload: row.payload == null ? null : JSON.parse(String(row.payload)), overlap: String(row.overlap) as OverlapPolicy,
    catchUp: String(row.catch_up) as CatchUpPolicy, maxCatchUp: Number(row.max_catch_up), graceMs: Number(row.grace_ms),
    maxAttempts: Number(row.max_attempts), retryBaseMs: Number(row.retry_base_ms), retryMaxMs: Number(row.retry_max_ms),
    leaseMs: Number(row.lease_ms), enabled: row.enabled === true || row.enabled === "t", nextRunAt: optNumber(row.next_run_at),
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

function toRun(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id), scheduleId: String(row.schedule_id), scheduledFor: Number(row.scheduled_for), status: String(row.status) as RunStatus,
    attempt: Number(row.attempt), nextAttemptAt: Number(row.next_attempt_at), leaseOwner: row.lease_owner == null ? null : String(row.lease_owner),
    leaseExpiresAt: optNumber(row.lease_expires_at), startedAt: optNumber(row.started_at), finishedAt: optNumber(row.finished_at),
    error: row.error == null ? null : String(row.error), createdAt: Number(row.created_at),
  };
}

export function createSqlSchedulerStore(db: SqlExecutor, options: SqlStoreOptions = {}): SchedulerStore {
  const tasks = options.table ?? "scheduled_tasks";
  const runs = options.runTable ?? "scheduled_task_runs";
  if (!NAME.test(tasks) || !NAME.test(runs)) throw new RangeError("Invalid table name");
  const due = `((status = 'pending' AND next_attempt_at <= $NOW) OR (status = 'running' AND lease_expires_at < $NOW))`;

  return {
    async saveSchedule(s) {
      const { rows } = await db.query(
        `INSERT INTO ${tasks} (id, cron, time_zone, handler, payload, overlap, catch_up, max_catch_up, grace_ms, max_attempts,
           retry_base_ms, retry_max_ms, lease_ms, enabled, next_run_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::bigint, $16, $17)
         ON CONFLICT (id) DO UPDATE SET cron = EXCLUDED.cron, time_zone = EXCLUDED.time_zone, handler = EXCLUDED.handler,
           payload = EXCLUDED.payload, overlap = EXCLUDED.overlap, catch_up = EXCLUDED.catch_up, max_catch_up = EXCLUDED.max_catch_up,
           grace_ms = EXCLUDED.grace_ms, max_attempts = EXCLUDED.max_attempts, retry_base_ms = EXCLUDED.retry_base_ms,
           retry_max_ms = EXCLUDED.retry_max_ms, lease_ms = EXCLUDED.lease_ms, enabled = EXCLUDED.enabled,
           next_run_at = EXCLUDED.next_run_at, updated_at = EXCLUDED.updated_at
         RETURNING ${SCHEDULE_COLUMNS}`,
        [s.id, s.cron, s.timeZone, s.handler, JSON.stringify(s.payload), s.overlap, s.catchUp, s.maxCatchUp, s.graceMs, s.maxAttempts,
          s.retryBaseMs, s.retryMaxMs, s.leaseMs, s.enabled, s.nextRunAt, s.createdAt, s.updatedAt],
      );
      return toSchedule(rows[0]!);
    },
    async getSchedule(id) {
      const { rows } = await db.query(`SELECT ${SCHEDULE_COLUMNS} FROM ${tasks} WHERE id = $1`, [id]);
      return rows[0] ? toSchedule(rows[0]) : null;
    },
    async listSchedules() {
      return (await db.query(`SELECT ${SCHEDULE_COLUMNS} FROM ${tasks} ORDER BY id`)).rows.map(toSchedule);
    },
    async deleteSchedule(id) {
      return (await db.query(`DELETE FROM ${tasks} WHERE id = $1 RETURNING id`, [id])).rows.length === 1;
    },
    async dueSchedules(now, limit) {
      const { rows } = await db.query(
        `SELECT ${SCHEDULE_COLUMNS} FROM ${tasks} WHERE enabled AND next_run_at <= $1 ORDER BY next_run_at LIMIT $2`, [now, limit]);
      return rows.map(toSchedule);
    },
    async materialize({ scheduleId, expectedNextRunAt, nextRunAt, runs: newRuns }) {
      const payload = JSON.stringify(newRuns.map((r) => ({ id: r.id, scheduled_for: r.scheduledFor, next_attempt_at: r.nextAttemptAt, created_at: r.createdAt })));
      const { rows } = await db.query(
        `WITH adv AS (
           UPDATE ${tasks} SET next_run_at = $3::bigint WHERE id = $1 AND next_run_at = $2::bigint RETURNING id
         ), ins AS (
           INSERT INTO ${runs} (id, schedule_id, scheduled_for, status, attempt, next_attempt_at, created_at)
           SELECT r.id, $1, r.scheduled_for, 'pending', 0, r.next_attempt_at, r.created_at
           FROM jsonb_to_recordset($4::jsonb) AS r(id text, scheduled_for bigint, next_attempt_at bigint, created_at bigint)
           WHERE EXISTS (SELECT 1 FROM adv)
           ON CONFLICT DO NOTHING
           RETURNING 1
         )
         SELECT (SELECT count(*) FROM adv)::int AS advanced, (SELECT count(*) FROM ins)::int AS inserted`,
        [scheduleId, expectedNextRunAt, nextRunAt, payload],
      );
      const row = rows[0] ?? {};
      return { advanced: Number(row.advanced) === 1, inserted: Number(row.inserted ?? 0) };
    },
    async dueRuns(now, limit, excludeScheduleIds = []) {
      // DISTINCT ON keeps each schedule's earliest due run, so one busy schedule's backlog cannot fill the page.
      const { rows } = await db.query(
        `SELECT ${RUN_COLUMNS} FROM (
           SELECT DISTINCT ON (schedule_id) ${RUN_COLUMNS} FROM ${runs}
           WHERE ${due.replaceAll("$NOW", "$1")} AND NOT (schedule_id = ANY($3::text[]))
           ORDER BY schedule_id, next_attempt_at, scheduled_for
         ) AS earliest ORDER BY next_attempt_at, scheduled_for LIMIT $2`,
        [now, limit, [...excludeScheduleIds]],
      );
      return rows.map(toRun);
    },
    async claimRun({ runId, workerId, now, leaseMs }) {
      const { rows } = await db.query(
        `UPDATE ${runs} SET status = 'running', lease_owner = $2, lease_expires_at = $3::bigint + $4::bigint, attempt = attempt + 1, started_at = $3
         WHERE id = $1 AND ${due.replaceAll("$NOW", "$3")} RETURNING ${RUN_COLUMNS}`,
        [runId, workerId, now, leaseMs],
      );
      return rows[0] ? toRun(rows[0]) : null;
    },
    async acquireSlot({ scheduleId, runId, workerId, now, expiresAt }): Promise<SlotResult> {
      const { rows } = await db.query(
        `UPDATE ${tasks} SET slot_run_id = $2, slot_owner = $3, slot_since = $4, slot_expires_at = $5
         WHERE id = $1 AND (slot_run_id IS NULL OR slot_expires_at < $4 OR slot_run_id = $2) RETURNING id`,
        [scheduleId, runId, workerId, now, expiresAt],
      );
      if (rows.length === 1) return { acquired: true };
      const holder = (await db.query(`SELECT slot_since FROM ${tasks} WHERE id = $1`, [scheduleId])).rows[0];
      return { acquired: false, since: optNumber(holder?.slot_since) };
    },
    async releaseSlot({ scheduleId, runId, workerId }) {
      await db.query(
        `UPDATE ${tasks} SET slot_run_id = NULL, slot_owner = NULL, slot_since = NULL, slot_expires_at = NULL
         WHERE id = $1 AND slot_run_id = $2 AND slot_owner = $3`, [scheduleId, runId, workerId]);
    },
    async heartbeat({ runId, scheduleId, workerId, now, expiresAt }) {
      const { rows } = await db.query(
        `WITH r AS (
           UPDATE ${runs} SET lease_expires_at = $5 WHERE id = $1 AND status = 'running' AND lease_owner = $3 AND lease_expires_at >= $4 RETURNING id
         ), s AS (
           UPDATE ${tasks} SET slot_expires_at = $5 WHERE id = $2 AND slot_run_id = $1 AND slot_owner = $3 AND EXISTS (SELECT 1 FROM r) RETURNING id
         )
         SELECT (SELECT count(*) FROM r)::int AS ok, (SELECT count(*) FROM s)::int AS slot`,
        [runId, scheduleId, workerId, now, expiresAt],
      );
      return Number(rows[0]?.ok) === 1;
    },
    async finishRun(runId, workerId, patch: FinishPatch) {
      const { rows } = await db.query(
        `UPDATE ${runs} SET status = $3, lease_owner = NULL, lease_expires_at = NULL, attempt = COALESCE($4::int, attempt),
           next_attempt_at = COALESCE($5::bigint, next_attempt_at), error = CASE WHEN $6::boolean THEN $7::text ELSE error END,
           finished_at = COALESCE($8::bigint, finished_at)
         WHERE id = $1 AND status = 'running' AND lease_owner = $2 RETURNING id`,
        [runId, workerId, patch.status, patch.attempt ?? null, patch.nextAttemptAt ?? null, patch.error !== undefined, patch.error ?? null, patch.finishedAt ?? null],
      );
      return rows.length === 1;
    },
    async listRuns(scheduleId, limit) {
      const { rows } = await db.query(`SELECT ${RUN_COLUMNS} FROM ${runs} WHERE schedule_id = $1 ORDER BY scheduled_for DESC LIMIT $2`, [scheduleId, limit]);
      return rows.map(toRun);
    },
  };
}
