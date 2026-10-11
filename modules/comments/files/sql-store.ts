// SPDX-License-Identifier: Apache-2.0
// CommentStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. Every write is one statement: a reaction toggle is DELETE-or-INSERT ... ON CONFLICT DO NOTHING,
// and a flag inserts its (comment, user) row and increments flag_count, hiding at the threshold, together.
import type { Comment, CommentStatus, CommentStore, ReactionSummary, ReplyPreview } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlCommentStoreOptions {
  /** Table names (defaults comments, comment_reactions, comment_flags). Letters, digits and underscores only. */
  readonly tables?: { readonly comments?: string; readonly reactions?: string; readonly flags?: string };
}

const COLUMNS = "id, tenant_id, resource_type, resource_id, parent_id, depth, author_id, body, mentions, created_at, edited_at, deleted_at, status, flag_count";
const TABLE = /^[a-z_][a-z0-9_]{0,62}$/;

function toComment(row: Record<string, unknown>): Comment {
  const text = (key: string) => String(row[key]);
  const time = (key: string) => Number(row[key]);
  return {
    id: text("id"), tenantId: text("tenant_id"), resourceType: text("resource_type"), resourceId: text("resource_id"),
    parentId: row.parent_id == null ? null : text("parent_id"), depth: Number(row.depth), authorId: text("author_id"),
    body: row.body == null ? null : text("body"), mentions: Array.isArray(row.mentions) ? row.mentions.map(String) : [],
    createdAt: time("created_at"),
    ...(row.edited_at == null ? {} : { editedAt: time("edited_at") }),
    ...(row.deleted_at == null ? {} : { deletedAt: time("deleted_at") }),
    status: text("status") as CommentStatus, flagCount: Number(row.flag_count),
  };
}

export function createSqlCommentStore(db: SqlExecutor, options: SqlCommentStoreOptions = {}): CommentStore {
  const comments = options.tables?.comments ?? "comments";
  const reactions = options.tables?.reactions ?? "comment_reactions";
  const flags = options.tables?.flags ?? "comment_flags";
  for (const table of [comments, reactions, flags]) if (!TABLE.test(table)) throw new RangeError("Invalid table name");
  const many = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.map(toComment);
  const one = async (sql: string, params: unknown[]) => (await many(sql, params))[0] ?? null;

  return {
    async insert(comment) {
      await db.query(
        `INSERT INTO ${comments} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14)`,
        [comment.id, comment.tenantId, comment.resourceType, comment.resourceId, comment.parentId, comment.depth, comment.authorId,
          comment.body, [...comment.mentions], comment.createdAt, comment.editedAt ?? null, comment.deletedAt ?? null, comment.status, comment.flagCount],
      );
    },
    findById: (id) => one(`SELECT ${COLUMNS} FROM ${comments} WHERE id = $1`, [id]),
    updateBody: (id, patch) => one(
      `UPDATE ${comments} SET body = $2, mentions = $3::text[], edited_at = $4,
         status = CASE WHEN status = 'approved' THEN 'visible' ELSE status END
       WHERE id = $1 AND deleted_at IS NULL RETURNING ${COLUMNS}`,
      [id, patch.body, [...patch.mentions], patch.editedAt],
    ),
    softDelete: (id, at) => one(
      `UPDATE ${comments} SET body = NULL, mentions = '{}', deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING ${COLUMNS}`,
      [id, at],
    ),
    setStatus: (id, status) => one(`UPDATE ${comments} SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, status]),
    listTopLevel(target, page) {
      const base = `SELECT ${COLUMNS} FROM ${comments} WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3 AND parent_id IS NULL`;
      const params: unknown[] = [target.tenantId, target.resourceType, target.resourceId];
      return page.cursor === null
        ? many(`${base} ORDER BY created_at DESC, id DESC LIMIT $4`, [...params, page.limit])
        : many(`${base} AND (created_at, id) < ($4::bigint, $5::text) ORDER BY created_at DESC, id DESC LIMIT $6`, [...params, page.cursor.createdAt, page.cursor.id, page.limit]);
    },
    listReplies(parentId, page) {
      const base = `SELECT ${COLUMNS} FROM ${comments} WHERE parent_id = $1`;
      return page.cursor === null
        ? many(`${base} ORDER BY created_at, id LIMIT $2`, [parentId, page.limit])
        : many(`${base} AND (created_at, id) > ($2::bigint, $3::text) ORDER BY created_at, id LIMIT $4`, [parentId, page.cursor.createdAt, page.cursor.id, page.limit]);
    },
    async replyPreview(parentIds, perParent) {
      const result = new Map<string, ReplyPreview>();
      if (parentIds.length === 0) return result;
      const ids = [...parentIds];
      const counts = await db.query(`SELECT parent_id, count(*)::int AS n FROM ${comments} WHERE parent_id = ANY($1::text[]) GROUP BY parent_id`, [ids]);
      for (const row of counts.rows) result.set(String(row.parent_id), { count: Number(row.n), replies: [] });
      if (perParent > 0 && result.size > 0) {
        const rows = await many(
          `SELECT ${COLUMNS} FROM (
             SELECT ${COLUMNS}, row_number() OVER (PARTITION BY parent_id ORDER BY created_at, id) AS position
             FROM ${comments} WHERE parent_id = ANY($1::text[])
           ) ranked WHERE position <= $2 ORDER BY parent_id, created_at, id`,
          [ids, perParent],
        );
        for (const reply of rows) result.get(reply.parentId ?? "")?.replies.push(reply);
      }
      return result;
    },
    async toggleReaction(commentId, userId, emoji, at) {
      // One statement: delete the reaction if present, otherwise insert it. Concurrent toggles by different users
      // never conflict; a racing duplicate insert by the same user is absorbed by ON CONFLICT DO NOTHING.
      const { rows } = await db.query(
        `WITH removed AS (
           DELETE FROM ${reactions} WHERE comment_id = $1 AND user_id = $2 AND emoji = $3 RETURNING 1
         ), added AS (
           INSERT INTO ${reactions} (comment_id, user_id, emoji, created_at)
           SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM removed)
           ON CONFLICT DO NOTHING RETURNING 1
         )
         SELECT (SELECT count(*) FROM removed)::int AS removed`,
        [commentId, userId, emoji, at],
      );
      return Number(rows[0]?.removed ?? 0) > 0 ? "removed" : "added";
    },
    async reactions(commentIds, userId) {
      const result = new Map<string, ReactionSummary[]>();
      if (commentIds.length === 0) return result;
      const { rows } = await db.query(
        `SELECT comment_id, emoji, count(*)::int AS n, bool_or(user_id = $2) AS mine
         FROM ${reactions} WHERE comment_id = ANY($1::text[]) GROUP BY comment_id, emoji`,
        [[...commentIds], userId],
      );
      for (const row of rows) {
        const id = String(row.comment_id);
        const list = result.get(id) ?? [];
        list.push({ emoji: String(row.emoji), count: Number(row.n), reacted: row.mine === true });
        result.set(id, list);
      }
      return result;
    },
    addFlag: (commentId, userId, reason, at, threshold) => one(
      // The flag row and the counter change together: a repeat flag inserts nothing, so nothing is updated. The
      // UPDATE row lock serializes concurrent flags, and each re-reads flag_count, so the count is exact and the
      // comment is hidden by exactly the flag that reaches the threshold.
      `WITH flagged AS (
         INSERT INTO ${flags} (comment_id, user_id, reason, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING RETURNING comment_id
       )
       UPDATE ${comments} SET flag_count = flag_count + 1,
         status = CASE WHEN status = 'visible' AND flag_count + 1 >= $5 THEN 'hidden' ELSE status END
       WHERE id = (SELECT comment_id FROM flagged) RETURNING ${COLUMNS}`,
      [commentId, userId, reason, at, threshold],
    ),
  };
}
