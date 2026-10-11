// SPDX-License-Identifier: Apache-2.0
// InvitationStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. The accepted transition is one conditional UPDATE, so only one concurrent accept can win;
// pass `onAccepted` to create the membership in the same transaction when the executor supports transactions.
import type { Invitation, InvitationStatus, InvitationStore } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction (BEGIN/COMMIT, rollback on throw). Optional; required for onAccepted atomicity. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlStoreOptions {
  /** Table name (default org_invitations). Letters, digits and underscores only. */
  readonly table?: string;
  /**
   * Called inside the accepting transaction with the accepted invitation; insert the membership row here.
   * Without executor.transaction it runs after the update commits, so make it idempotent and retry on failure.
   */
  readonly onAccepted?: (tx: SqlExecutor, invitation: Invitation) => Promise<void>;
}

const COLUMNS = "id, tenant_id, email, role, invited_by, token_hash, status, created_at, expires_at, accepted_by, closed_at";

function toInvitation(row: Record<string, unknown>): Invitation {
  const text = (key: string) => String(row[key]);
  const time = (key: string) => Number(row[key]);
  return {
    id: text("id"), tenantId: text("tenant_id"), email: text("email"), role: text("role"), invitedBy: text("invited_by"),
    tokenHash: text("token_hash").trim(), status: text("status") as InvitationStatus, createdAt: time("created_at"), expiresAt: time("expires_at"),
    ...(row.accepted_by == null ? {} : { acceptedBy: text("accepted_by") }),
    ...(row.closed_at == null ? {} : { closedAt: time("closed_at") }),
  };
}

export function createSqlInvitationStore(db: SqlExecutor, options: SqlStoreOptions = {}): InvitationStore {
  const table = options.table ?? "org_invitations";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.map(toInvitation)[0] ?? null;

  return {
    async insert(invitation) {
      await db.query(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [invitation.id, invitation.tenantId, invitation.email, invitation.role, invitation.invitedBy, invitation.tokenHash,
          invitation.status, invitation.createdAt, invitation.expiresAt, invitation.acceptedBy ?? null, invitation.closedAt ?? null],
      );
    },
    findByTokenHash: (tokenHash) => one(`SELECT ${COLUMNS} FROM ${table} WHERE token_hash = $1`, [tokenHash]),
    findById: (id) => one(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, [id]),
    async listPending(tenantId, email) {
      const { rows } = email === undefined
        ? await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE tenant_id = $1 AND status = 'pending' ORDER BY created_at`, [tenantId])
        : await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE tenant_id = $1 AND email = $2 AND status = 'pending' ORDER BY created_at`, [tenantId, email]);
      return rows.map(toInvitation);
    },
    async transition(id, from, patch) {
      const update = (tx: SqlExecutor) => tx.query(
        `UPDATE ${table} SET status = $3, closed_at = $4, accepted_by = COALESCE($5, accepted_by) WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
        [id, from, patch.status, patch.closedAt ?? null, patch.acceptedBy ?? null],
      );
      if (patch.status !== "accepted" || !options.onAccepted) return (await update(db)).rows.length === 1;
      const onAccepted = options.onAccepted;
      if (db.transaction) {
        return db.transaction(async (tx) => {
          const { rows } = await update(tx);
          if (rows.length !== 1) return false;
          await onAccepted(tx, toInvitation(rows[0]!));
          return true;
        });
      }
      const { rows } = await update(db);
      if (rows.length !== 1) return false;
      await onAccepted(db, toInvitation(rows[0]!));
      return true;
    },
  };
}
