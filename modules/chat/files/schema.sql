-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for chat (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool. The seq counter lives on the conversation row (last_seq) and is incremented in
-- the same transaction as the message insert, so seq is gap-free and unique per conversation.
CREATE TABLE IF NOT EXISTS chat_conversations (
  id              text PRIMARY KEY,
  tenant_id       text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('direct', 'group')),
  direct_key      text UNIQUE,
  title           text,
  last_seq        bigint NOT NULL DEFAULT 0,
  last_message_at bigint,
  created_at      bigint NOT NULL,
  CHECK ((kind = 'direct') = (direct_key IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id text NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at       bigint NOT NULL,
  left_at         bigint,
  -- The conversation's last_seq when the member left; history stops there.
  left_seq        bigint,
  last_read_seq   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members (user_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
  conversation_id text NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  seq             bigint NOT NULL,
  id              text NOT NULL UNIQUE,
  sender_id       text NOT NULL,
  client_id       text NOT NULL,
  body            text,
  created_at      bigint NOT NULL,
  edited_at       bigint,
  deleted_at      bigint,
  PRIMARY KEY (conversation_id, seq),
  UNIQUE (conversation_id, sender_id, client_id)
);

CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker_id text NOT NULL,
  blocked_id text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
