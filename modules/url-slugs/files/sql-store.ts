// SPDX-License-Identifier: Apache-2.0
// SlugStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns { rows }
// (node-postgres, Neon, PGlite, or postgres.js through a thin wrapper), plus `transaction` for renames. Apply
// schema.sql first. Uniqueness is the database's job: INSERT ... ON CONFLICT (scope, slug) DO NOTHING for slugs and
// a partial unique index for the one current slug per entity; the core retries when either reports a conflict.
import type { InsertOutcome, RenameOutcome, SlugRecord, SlugStore } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction (BEGIN/COMMIT, rollback when it throws). Required for rename. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlSlugStoreOptions {
  /** Table name (default url_slugs), optionally schema-qualified ("app.url_slugs"). Lowercase letters, digits and underscores only; quoted in SQL. */
  readonly table?: string;
}

const COLUMNS = "scope, slug, entity_id, created_at, retired_at";

function toRecord(row: Record<string, unknown>): SlugRecord {
  return {
    scope: String(row.scope), slug: String(row.slug), entityId: String(row.entity_id), createdAt: Number(row.created_at),
    ...(row.retired_at == null ? {} : { retiredAt: Number(row.retired_at) }),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

class Rollback extends Error {
  readonly outcome: RenameOutcome;
  constructor(outcome: RenameOutcome) {
    super(outcome);
    this.outcome = outcome;
  }
}

export function createSqlSlugStore(db: SqlExecutor, options: SqlSlugStoreOptions = {}): SlugStore {
  const name = options.table ?? "url_slugs";
  if (typeof name !== "string" || !/^[a-z_][a-z0-9_]{0,62}(\.[a-z_][a-z0-9_]{0,62})?$/.test(name)) throw new RangeError("Invalid table name");
  // Validated, then quoted, so keywords such as "order" or "user"."select" work.
  const table = name.split(".").map((part) => `"${part}"`).join(".");

  return {
    async takenAmong(scope, slugs) {
      if (slugs.length === 0) return [];
      const { rows } = await db.query(`SELECT slug FROM ${table} WHERE scope = $1 AND slug = ANY($2::text[])`, [scope, [...slugs]]);
      return rows.map((row) => String(row.slug));
    },

    async insert(record): Promise<InsertOutcome> {
      try {
        const { rows } = await db.query(
          `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, NULL) ON CONFLICT (scope, slug) DO NOTHING RETURNING slug`,
          [record.scope, record.slug, record.entityId, record.createdAt],
        );
        return rows.length === 1 ? "inserted" : "slug-taken";
      } catch (error) {
        // ON CONFLICT names only (scope, slug); a violation of the current-slug index means the entity has one.
        if (isUniqueViolation(error)) return "entity-exists";
        throw error;
      }
    },

    async rename(scope, entityId, slug, now): Promise<RenameOutcome> {
      if (!db.transaction) throw new Error("createSqlSlugStore: the executor needs transaction() for rename");
      try {
        return await db.transaction(async (tx): Promise<RenameOutcome> => {
          // Lock the current row so concurrent renames of one entity run one after another.
          const current = await tx.query(
            `SELECT slug FROM ${table} WHERE scope = $1 AND entity_id = $2 AND retired_at IS NULL FOR UPDATE`, [scope, entityId]);
          const from = current.rows[0]?.slug;
          if (from === undefined) {
            // Either the entity has no slug, or a concurrent rename replaced the row we waited on.
            const any = await tx.query(`SELECT 1 FROM ${table} WHERE scope = $1 AND entity_id = $2 LIMIT 1`, [scope, entityId]);
            return any.rows.length === 0 ? "not-found" : "conflict";
          }
          if (String(from) === slug) return "unchanged";
          const target = await tx.query(`SELECT entity_id FROM ${table} WHERE scope = $1 AND slug = $2`, [scope, slug]);
          const owner = target.rows[0]?.entity_id;
          if (owner !== undefined && String(owner) !== entityId) return "slug-taken";
          await tx.query(`UPDATE ${table} SET retired_at = $3 WHERE scope = $1 AND slug = $2`, [scope, String(from), now]);
          if (owner !== undefined) {
            await tx.query(`UPDATE ${table} SET retired_at = NULL WHERE scope = $1 AND slug = $2 AND entity_id = $3`, [scope, slug, entityId]);
          } else {
            const inserted = await tx.query(
              `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, NULL) ON CONFLICT (scope, slug) DO NOTHING RETURNING slug`,
              [scope, slug, entityId, now],
            );
            if (inserted.rows.length === 0) throw new Rollback("slug-taken"); // taken since the check: undo the retire
          }
          return "renamed";
        });
      } catch (error) {
        if (error instanceof Rollback) return error.outcome;
        if (isUniqueViolation(error)) return "conflict";
        throw error;
      }
    },

    async lookup(scope, slug) {
      const { rows } = await db.query(
        `SELECT h.entity_id, c.slug AS current FROM ${table} h
           JOIN ${table} c ON c.scope = h.scope AND c.entity_id = h.entity_id AND c.retired_at IS NULL
         WHERE h.scope = $1 AND h.slug = $2`,
        [scope, slug],
      );
      const row = rows[0];
      return row ? { entityId: String(row.entity_id), current: String(row.current) } : null;
    },

    async history(scope, entityId) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM ${table} WHERE scope = $1 AND entity_id = $2 ORDER BY created_at, slug`, [scope, entityId]);
      return rows.map(toRecord);
    },

    async remove(scope, entityId) {
      const { rows } = await db.query(`DELETE FROM ${table} WHERE scope = $1 AND entity_id = $2 RETURNING slug`, [scope, entityId]);
      return rows.length;
    },
  };
}
