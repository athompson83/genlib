// SPDX-License-Identifier: Apache-2.0
// WebhookDeliveryStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool/Client, Neon serverless, PGlite, postgres.js via a thin wrapper). Apply schema.sql first.
// enqueue's `tx` is an executor bound to your open transaction, so delivery rows commit or roll back with your change.
// Claims are one UPDATE over a `FOR UPDATE SKIP LOCKED` subquery, so workers on separate connections never claim the
// same row; completion is a conditional UPDATE on the lease owner.
import type {
  AttemptRecord, CompletePatch, DeliveryFilter, DeliveryRecord, DeliveryStatus, EndpointPatch, StoredEndpoint,
  StoredSecret, WebhookDeliveryStore,
} from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlWebhookStoreOptions {
  /** Table names (letters, digits, underscores). Defaults: webhook_endpoints, webhook_deliveries, webhook_attempts. */
  readonly endpointsTable?: string;
  readonly deliveriesTable?: string;
  readonly attemptsTable?: string;
}

const NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const ENDPOINT_COLUMNS = "id, tenant_id, url, description, event_types, enabled, secrets, version, created_at, updated_at";
const DELIVERY_COLUMNS = "id, tenant_id, endpoint_id, event_id, event_type, body, status, attempts, next_attempt_at, lease_owner, " +
  "lease_expires_at, last_error, last_status_code, created_at, completed_at";
const ATTEMPT_COLUMNS = "id, tenant_id, delivery_id, attempt, started_at, duration_ms, outcome, status_code, error, response_body";

const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);
const optText = (value: unknown): string | null => (value == null ? null : String(value));
const optNumber = (value: unknown): number | null => (value == null ? null : Number(value));

function toEndpoint(row: Record<string, unknown>): StoredEndpoint {
  const types = json(row.event_types);
  const secrets = (json(row.secrets) as Record<string, unknown>[] | null) ?? [];
  return {
    id: String(row.id), tenantId: String(row.tenant_id), url: String(row.url), description: String(row.description ?? ""),
    eventTypes: Array.isArray(types) ? types.map(String) : null, enabled: row.enabled === true,
    secrets: secrets.map((s): StoredSecret => ({
      id: String(s.id), value: String(s.value), createdAt: Number(s.createdAt), expiresAt: optNumber(s.expiresAt),
    })),
    version: Number(row.version), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

function toDelivery(row: Record<string, unknown>): DeliveryRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), endpointId: String(row.endpoint_id), eventId: String(row.event_id),
    eventType: String(row.event_type), body: String(row.body), status: String(row.status) as DeliveryStatus,
    attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), leaseOwner: optText(row.lease_owner),
    leaseExpiresAt: optNumber(row.lease_expires_at), lastError: optText(row.last_error), lastStatusCode: optNumber(row.last_status_code),
    createdAt: Number(row.created_at), completedAt: optNumber(row.completed_at),
  };
}

function toAttempt(row: Record<string, unknown>): AttemptRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), deliveryId: String(row.delivery_id), attempt: Number(row.attempt),
    startedAt: Number(row.started_at), durationMs: Number(row.duration_ms), outcome: String(row.outcome) as AttemptRecord["outcome"],
    statusCode: optNumber(row.status_code), error: optText(row.error), responseBody: optText(row.response_body),
  };
}

const secretsJson = (secrets: readonly StoredSecret[]) =>
  JSON.stringify(secrets.map(s => ({ id: s.id, value: s.value, createdAt: s.createdAt, expiresAt: s.expiresAt })));

export function createSqlWebhookStore(db: SqlExecutor, options: SqlWebhookStoreOptions = {}): WebhookDeliveryStore<SqlExecutor> {
  const endpoints = options.endpointsTable ?? "webhook_endpoints";
  const deliveries = options.deliveriesTable ?? "webhook_deliveries";
  const attempts = options.attemptsTable ?? "webhook_attempts";
  if (![endpoints, deliveries, attempts].every(name => NAME.test(name))) throw new RangeError("Invalid table name");
  const rows = async (sql: string, params: unknown[], executor: SqlExecutor = db) => (await executor.query(sql, params)).rows;

  return {
    async insertEndpoint(e) {
      await rows(
        `INSERT INTO ${endpoints} (${ENDPOINT_COLUMNS}) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)`,
        [e.id, e.tenantId, e.url, e.description, e.eventTypes ? JSON.stringify(e.eventTypes) : null, e.enabled, secretsJson(e.secrets),
          e.version, e.createdAt, e.updatedAt],
      );
    },
    async getEndpoint(tenantId, id) {
      const [row] = await rows(`SELECT ${ENDPOINT_COLUMNS} FROM ${endpoints} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return row ? toEndpoint(row) : null;
    },
    async listEndpoints(tenantId) {
      return (await rows(`SELECT ${ENDPOINT_COLUMNS} FROM ${endpoints} WHERE tenant_id = $1 ORDER BY created_at, id`, [tenantId])).map(toEndpoint);
    },
    async updateEndpoint(tenantId, id, expectedVersion, patch: EndpointPatch, updatedAt) {
      const params: unknown[] = [tenantId, id, expectedVersion, updatedAt];
      const sets = ["version = version + 1", "updated_at = $4"];
      const set = (column: string, value: unknown, cast = "") => { params.push(value); sets.push(`${column} = $${params.length}${cast}`); };
      if (patch.url !== undefined) set("url", patch.url);
      if (patch.description !== undefined) set("description", patch.description);
      if (patch.eventTypes !== undefined) set("event_types", patch.eventTypes === null ? null : JSON.stringify(patch.eventTypes), "::jsonb");
      if (patch.enabled !== undefined) set("enabled", patch.enabled);
      if (patch.secrets !== undefined) set("secrets", secretsJson(patch.secrets), "::jsonb");
      const [row] = await rows(
        `UPDATE ${endpoints} SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 AND version = $3 RETURNING ${ENDPOINT_COLUMNS}`,
        params,
      );
      return row ? toEndpoint(row) : null;
    },
    async deleteEndpoint(tenantId, id) {
      return (await rows(`DELETE FROM ${endpoints} WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id])).length === 1;
    },
    async endpointsForEvent(tenantId, eventType, tx) {
      return (await rows(
        `SELECT ${ENDPOINT_COLUMNS} FROM ${endpoints}
         WHERE tenant_id = $1 AND enabled AND (event_types IS NULL OR event_types @> jsonb_build_array($2::text))
         ORDER BY created_at, id`,
        [tenantId, eventType], tx ?? db,
      )).map(toEndpoint);
    },
    async insertDeliveries(list, tx) {
      const executor = tx ?? db;
      const out: DeliveryRecord[] = [];
      for (const d of list) {
        const [inserted] = await rows(
          `INSERT INTO ${deliveries} (${DELIVERY_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (endpoint_id, event_id) DO NOTHING RETURNING ${DELIVERY_COLUMNS}`,
          [d.id, d.tenantId, d.endpointId, d.eventId, d.eventType, d.body, d.status, d.attempts, d.nextAttemptAt, d.leaseOwner,
            d.leaseExpiresAt, d.lastError, d.lastStatusCode, d.createdAt, d.completedAt],
          executor,
        );
        const row = inserted ?? (await rows(
          `SELECT ${DELIVERY_COLUMNS} FROM ${deliveries} WHERE endpoint_id = $1 AND event_id = $2`, [d.endpointId, d.eventId], executor,
        ))[0];
        if (!row) throw new Error("Delivery insert returned no row");
        out.push(toDelivery(row));
      }
      return out;
    },
    async claim({ now, limit, workerId, leaseMs }) {
      const due = `(status = 'pending' AND next_attempt_at <= $1) OR (status = 'delivering' AND lease_expires_at < $1)`;
      const claimed = await rows(
        `UPDATE ${deliveries} SET status = 'delivering', lease_owner = $3, lease_expires_at = $1::bigint + $4::bigint, attempts = attempts + 1
         WHERE id IN (SELECT id FROM ${deliveries} WHERE ${due} ORDER BY next_attempt_at LIMIT $2 FOR UPDATE SKIP LOCKED)
           AND (${due})
         RETURNING ${DELIVERY_COLUMNS}`,
        [now, limit, workerId, leaseMs],
      );
      return claimed.map(toDelivery).sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt);
    },
    async complete(id, workerId, patch: CompletePatch) {
      const has = (key: keyof CompletePatch) => patch[key] !== undefined;
      const updated = await rows(
        `UPDATE ${deliveries} SET status = $3, lease_owner = NULL, lease_expires_at = NULL,
           next_attempt_at = COALESCE($4::bigint, next_attempt_at),
           last_error = CASE WHEN $5 THEN $6 ELSE last_error END,
           last_status_code = CASE WHEN $7 THEN $8::integer ELSE last_status_code END,
           completed_at = CASE WHEN $9 THEN $10::bigint ELSE completed_at END
         WHERE id = $1 AND status = 'delivering' AND lease_owner = $2 RETURNING id`,
        [id, workerId, patch.status, patch.nextAttemptAt ?? null, has("lastError"), patch.lastError ?? null,
          has("lastStatusCode"), patch.lastStatusCode ?? null, has("completedAt"), patch.completedAt ?? null],
      );
      return updated.length === 1;
    },
    async renewLease(id, workerId, leaseExpiresAt) {
      return (await rows(
        `UPDATE ${deliveries} SET lease_expires_at = $3 WHERE id = $1 AND status = 'delivering' AND lease_owner = $2 RETURNING id`,
        [id, workerId, leaseExpiresAt],
      )).length === 1;
    },
    async recordAttempt(a) {
      await rows(
        `INSERT INTO ${attempts} (${ATTEMPT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [a.id, a.tenantId, a.deliveryId, a.attempt, a.startedAt, a.durationMs, a.outcome, a.statusCode, a.error, a.responseBody],
      );
    },
    async getDelivery(tenantId, id) {
      const [row] = await rows(`SELECT ${DELIVERY_COLUMNS} FROM ${deliveries} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      return row ? toDelivery(row) : null;
    },
    async listDeliveries(tenantId, filter: DeliveryFilter) {
      const params: unknown[] = [tenantId];
      const where = ["tenant_id = $1"];
      if (filter.endpointId !== undefined) { params.push(filter.endpointId); where.push(`endpoint_id = $${params.length}`); }
      if (filter.status !== undefined) { params.push(filter.status); where.push(`status = $${params.length}`); }
      params.push(filter.limit);
      return (await rows(
        `SELECT ${DELIVERY_COLUMNS} FROM ${deliveries} WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params,
      )).map(toDelivery);
    },
    async listAttempts(tenantId, deliveryId) {
      return (await rows(
        `SELECT ${ATTEMPT_COLUMNS} FROM ${attempts} WHERE tenant_id = $1 AND delivery_id = $2 ORDER BY started_at, attempt, id`,
        [tenantId, deliveryId],
      )).map(toAttempt);
    },
    async replay(tenantId, id, now) {
      const [row] = await rows(
        `UPDATE ${deliveries} SET status = 'pending', attempts = 0, next_attempt_at = $3, lease_owner = NULL, lease_expires_at = NULL,
           completed_at = NULL
         WHERE tenant_id = $1 AND id = $2 AND status IN ('dead', 'succeeded') RETURNING ${DELIVERY_COLUMNS}`,
        [tenantId, id, now],
      );
      return row ? toDelivery(row) : null;
    },
  };
}
