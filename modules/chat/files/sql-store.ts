// SPDX-License-Identifier: Apache-2.0
// ChatStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite), plus a
// `transaction(work)` method, which this store requires. Apply schema.sql first.
// - send: lock the conversation row, return an existing (sender, clientId) message, check active membership,
//   then `UPDATE chat_conversations SET last_seq = last_seq + 1 ... RETURNING last_seq` and insert the message,
//   all in one transaction, so seq is gap-free and unique under concurrency.
// - openDirect: INSERT ... ON CONFLICT (direct_key) DO NOTHING, members in the same transaction, then read back.
// - leave / addMembers lock the conversation row so admin promotion and the member cap see a stable set.
import type { ChatMessage, ChatStore, Conversation, ConversationKind, InboxRow, Member, MemberRole } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction (BEGIN/COMMIT, rollback on throw). Required by this store. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlChatStoreOptions {
  /** Table names (defaults chat_conversations, chat_members, chat_messages, chat_blocks). Letters, digits and underscores only. */
  readonly tables?: { readonly conversations?: string; readonly members?: string; readonly messages?: string; readonly blocks?: string };
}

const TABLE = /^[a-z_][a-z0-9_]{0,62}$/;
const CONVERSATION = "id, tenant_id, kind, direct_key, title, last_seq, last_message_at, created_at";
const MEMBER = "conversation_id, user_id, role, joined_at, left_at, left_seq, last_read_seq";
const MESSAGE = "conversation_id, seq, id, sender_id, client_id, body, created_at, edited_at, deleted_at";

const num = (value: unknown): number | null => (value == null ? null : Number(value));
const prefixed = (columns: string, alias: string, as = ""): string => columns.split(", ").map((column) => `${alias}.${column}${as ? ` AS ${as}${column}` : ""}`).join(", ");

function toConversation(row: Record<string, unknown>, p = ""): Conversation {
  return {
    id: String(row[`${p}id`]), tenantId: String(row[`${p}tenant_id`]), kind: String(row[`${p}kind`]) as ConversationKind,
    directKey: row[`${p}direct_key`] == null ? null : String(row[`${p}direct_key`]), title: row[`${p}title`] == null ? null : String(row[`${p}title`]),
    lastSeq: Number(row[`${p}last_seq`]), lastMessageAt: num(row[`${p}last_message_at`]), createdAt: Number(row[`${p}created_at`]),
  };
}

function toMember(row: Record<string, unknown>, p = ""): Member {
  return {
    conversationId: String(row[`${p}conversation_id`]), userId: String(row[`${p}user_id`]), role: String(row[`${p}role`]) as MemberRole,
    joinedAt: Number(row[`${p}joined_at`]), leftAt: num(row[`${p}left_at`]), leftSeq: num(row[`${p}left_seq`]), lastReadSeq: Number(row[`${p}last_read_seq`]),
  };
}

function toMessage(row: Record<string, unknown>, p = ""): ChatMessage {
  return {
    conversationId: String(row[`${p}conversation_id`]), seq: Number(row[`${p}seq`]), id: String(row[`${p}id`]), senderId: String(row[`${p}sender_id`]),
    clientId: String(row[`${p}client_id`]), body: row[`${p}body`] == null ? null : String(row[`${p}body`]), createdAt: Number(row[`${p}created_at`]),
    editedAt: num(row[`${p}edited_at`]), deletedAt: num(row[`${p}deleted_at`]),
  };
}

export function createSqlChatStore(db: SqlExecutor, options: SqlChatStoreOptions = {}): ChatStore {
  if (typeof db.transaction !== "function") throw new TypeError("createSqlChatStore requires an executor with transaction(work)");
  const transaction = db.transaction.bind(db) as <T>(work: (tx: SqlExecutor) => Promise<T>) => Promise<T>;
  const conversations = options.tables?.conversations ?? "chat_conversations";
  const members = options.tables?.members ?? "chat_members";
  const messages = options.tables?.messages ?? "chat_messages";
  const blocks = options.tables?.blocks ?? "chat_blocks";
  for (const table of [conversations, members, messages, blocks]) if (!TABLE.test(table)) throw new RangeError("Invalid table name");

  const insertMembers = async (tx: SqlExecutor, rows: readonly Member[]) => {
    for (const member of rows) {
      await tx.query(
        `INSERT INTO ${members} (${MEMBER}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [member.conversationId, member.userId, member.role, member.joinedAt, member.leftAt, member.leftSeq, member.lastReadSeq],
      );
    }
  };
  const insertConversation = (tx: SqlExecutor, c: Conversation, suffix = "") => tx.query(
    `INSERT INTO ${conversations} (${CONVERSATION}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ${suffix}`,
    [c.id, c.tenantId, c.kind, c.directKey, c.title, c.lastSeq, c.lastMessageAt, c.createdAt],
  );
  const lock = (tx: SqlExecutor, id: string) => tx.query(`SELECT last_seq FROM ${conversations} WHERE id = $1 FOR UPDATE`, [id]);
  const getMessage = async (tx: SqlExecutor, conversationId: string, seq: number) =>
    (await tx.query(`SELECT ${MESSAGE} FROM ${messages} WHERE conversation_id = $1 AND seq = $2`, [conversationId, seq])).rows.map((row) => toMessage(row))[0] ?? null;

  return {
    async findConversation(id) {
      return (await db.query(`SELECT ${CONVERSATION} FROM ${conversations} WHERE id = $1`, [id])).rows.map((row) => toConversation(row))[0] ?? null;
    },

    openDirect: (conversation, rows) => transaction(async (tx) => {
      const inserted = await insertConversation(tx, conversation, "ON CONFLICT (direct_key) DO NOTHING RETURNING id");
      if (inserted.rows.length === 1) await insertMembers(tx, rows);
      const found = await tx.query(`SELECT ${CONVERSATION} FROM ${conversations} WHERE direct_key = $1`, [conversation.directKey]);
      return toConversation(found.rows[0]!);
    }),

    createGroup: (conversation, rows) => transaction(async (tx) => {
      await insertConversation(tx, conversation);
      await insertMembers(tx, rows);
    }),

    async getMember(conversationId, userId) {
      return (await db.query(`SELECT ${MEMBER} FROM ${members} WHERE conversation_id = $1 AND user_id = $2`, [conversationId, userId])).rows.map((row) => toMember(row))[0] ?? null;
    },

    async listMembers(conversationId) {
      return (await db.query(`SELECT ${MEMBER} FROM ${members} WHERE conversation_id = $1 AND left_at IS NULL ORDER BY joined_at, user_id`, [conversationId])).rows.map((row) => toMember(row));
    },

    addMembers: (conversationId, userIds, at, maxMembers) => transaction(async (tx) => {
      if ((await lock(tx, conversationId)).rows.length !== 1) return null;
      const { rows } = await tx.query(`SELECT user_id FROM ${members} WHERE conversation_id = $1 AND left_at IS NULL`, [conversationId]);
      const active = new Set(rows.map((row) => String(row.user_id)));
      const toAdd = userIds.filter((userId) => !active.has(userId));
      if (active.size + toAdd.length > maxMembers) return null;
      const added: Member[] = [];
      for (const userId of toAdd) {
        const result = await tx.query(
          `INSERT INTO ${members} (${MEMBER}) VALUES ($1, $2, 'member', $3, NULL, NULL, 0)
           ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'member', joined_at = EXCLUDED.joined_at, left_at = NULL, left_seq = NULL
           RETURNING ${MEMBER}`,
          [conversationId, userId, at],
        );
        added.push(toMember(result.rows[0]!));
      }
      return added;
    }),

    leave: (conversationId, userId, at) => transaction(async (tx) => {
      const locked = await lock(tx, conversationId);
      if (locked.rows.length !== 1) return null;
      const { rows } = await tx.query(
        `UPDATE ${members} SET left_at = $3, left_seq = $4 WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL RETURNING ${MEMBER}`,
        [conversationId, userId, at, Number(locked.rows[0]!.last_seq)],
      );
      if (rows.length !== 1) return null;
      await tx.query(
        `UPDATE ${members} SET role = 'admin'
         WHERE conversation_id = $1 AND user_id = (
           SELECT user_id FROM ${members} WHERE conversation_id = $1 AND left_at IS NULL ORDER BY joined_at, user_id LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM ${members} WHERE conversation_id = $1 AND left_at IS NULL AND role = 'admin')`,
        [conversationId],
      );
      return toMember(rows[0]!);
    }),

    appendMessage: (input) => transaction(async (tx) => {
      if ((await lock(tx, input.conversationId)).rows.length !== 1) return null;
      const existing = await tx.query(
        `SELECT ${MESSAGE} FROM ${messages} WHERE conversation_id = $1 AND sender_id = $2 AND client_id = $3`,
        [input.conversationId, input.senderId, input.clientId],
      );
      if (existing.rows.length === 1) return { message: toMessage(existing.rows[0]!), created: false };
      const member = await tx.query(`SELECT 1 FROM ${members} WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`, [input.conversationId, input.senderId]);
      if (member.rows.length !== 1) return null;
      const counter = await tx.query(
        `UPDATE ${conversations} SET last_seq = last_seq + 1, last_message_at = $2 WHERE id = $1 RETURNING last_seq`,
        [input.conversationId, input.createdAt],
      );
      const seq = Number(counter.rows[0]!.last_seq);
      const inserted = await tx.query(
        `INSERT INTO ${messages} (${MESSAGE}) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL) RETURNING ${MESSAGE}`,
        [input.conversationId, seq, input.id, input.senderId, input.clientId, input.body, input.createdAt],
      );
      await tx.query(`UPDATE ${members} SET last_read_seq = GREATEST(last_read_seq, $3) WHERE conversation_id = $1 AND user_id = $2`, [input.conversationId, input.senderId, seq]);
      return { message: toMessage(inserted.rows[0]!), created: true };
    }),

    getMessage: (conversationId, seq) => getMessage(db, conversationId, seq),

    async editMessage(conversationId, seq, body, at) {
      const { rows } = await db.query(
        `UPDATE ${messages} SET body = $3, edited_at = $4 WHERE conversation_id = $1 AND seq = $2 AND deleted_at IS NULL RETURNING ${MESSAGE}`,
        [conversationId, seq, body, at],
      );
      return rows.map((row) => toMessage(row))[0] ?? null;
    },

    async deleteMessage(conversationId, seq, at) {
      const { rows } = await db.query(
        `UPDATE ${messages} SET body = NULL, deleted_at = $3 WHERE conversation_id = $1 AND seq = $2 AND deleted_at IS NULL RETURNING ${MESSAGE}`,
        [conversationId, seq, at],
      );
      return rows.map((row) => toMessage(row))[0] ?? null;
    },

    async history(conversationId, query) {
      const params: unknown[] = [conversationId];
      const where = ["conversation_id = $1"];
      if (query.beforeSeq !== undefined) { params.push(query.beforeSeq); where.push(`seq < $${params.length}`); }
      if (query.afterSeq !== undefined) { params.push(query.afterSeq); where.push(`seq > $${params.length}`); }
      if (query.maxSeq !== undefined) { params.push(query.maxSeq); where.push(`seq <= $${params.length}`); }
      params.push(query.limit);
      const ascending = query.afterSeq !== undefined;
      const { rows } = await db.query(
        `SELECT ${MESSAGE} FROM ${messages} WHERE ${where.join(" AND ")} ORDER BY seq ${ascending ? "ASC" : "DESC"} LIMIT $${params.length}`,
        params,
      );
      const list = rows.map((row) => toMessage(row));
      return ascending ? list : list.reverse();
    },

    async markRead(conversationId, userId, seq) {
      const { rows } = await db.query(
        `UPDATE ${members} SET last_read_seq = GREATEST(last_read_seq, $3) WHERE conversation_id = $1 AND user_id = $2 RETURNING last_read_seq`,
        [conversationId, userId, seq],
      );
      return rows.length === 1 ? Number(rows[0]!.last_read_seq) : null;
    },

    async unreadCounts(tenantId, userId, conversationIds) {
      const params: unknown[] = [tenantId, userId];
      let filter = "";
      if (conversationIds) { params.push([...conversationIds]); filter = "AND c.id = ANY($3::text[])"; }
      const { rows } = await db.query(
        `SELECT c.id, (SELECT count(*)::int FROM ${messages} msg
            WHERE msg.conversation_id = c.id AND msg.seq > m.last_read_seq AND msg.sender_id <> $2 AND msg.deleted_at IS NULL) AS unread
         FROM ${conversations} c JOIN ${members} m ON m.conversation_id = c.id AND m.user_id = $2 AND m.left_at IS NULL
         WHERE c.tenant_id = $1 ${filter}`,
        params,
      );
      return new Map(rows.map((row) => [String(row.id), Number(row.unread)]));
    },

    async listInbox(tenantId, userId, cursor, limit) {
      const params: unknown[] = [tenantId, userId];
      let after = "";
      if (cursor) {
        params.push(cursor.activityAt, cursor.id);
        after = "AND (COALESCE(c.last_message_at, c.created_at), c.id) < ($3::bigint, $4::text)";
      }
      params.push(limit);
      const { rows } = await db.query(
        `SELECT ${prefixed(CONVERSATION, "c", "c_")}, ${prefixed(MEMBER, "m", "m_")}, ${prefixed(MESSAGE, "msg", "g_")}
         FROM ${conversations} c
         JOIN ${members} m ON m.conversation_id = c.id AND m.user_id = $2 AND m.left_at IS NULL
         LEFT JOIN ${messages} msg ON msg.conversation_id = c.id AND msg.seq = c.last_seq
         WHERE c.tenant_id = $1 ${after}
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
         LIMIT $${params.length}`,
        params,
      );
      return rows.map((row): InboxRow => ({
        conversation: toConversation(row, "c_"), member: toMember(row, "m_"),
        lastMessage: row.g_seq == null ? null : toMessage(row, "g_"),
      }));
    },

    async addBlock(blockerId, blockedId, at) {
      await db.query(`INSERT INTO ${blocks} (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [blockerId, blockedId, at]);
    },

    async removeBlock(blockerId, blockedId) {
      await db.query(`DELETE FROM ${blocks} WHERE blocker_id = $1 AND blocked_id = $2`, [blockerId, blockedId]);
    },

    async isBlocked(userA, userB) {
      const { rows } = await db.query(
        `SELECT 1 FROM ${blocks} WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [userA, userB],
      );
      return rows.length > 0;
    },
  };
}
