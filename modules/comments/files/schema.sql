-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for comments (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename tables by passing { tables } to createSqlCommentStore
-- (and rename the indexes and references below to match).
CREATE TABLE IF NOT EXISTS comments (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text NOT NULL,
  parent_id     text REFERENCES comments (id),
  depth         smallint NOT NULL CHECK (depth >= 0),
  author_id     text NOT NULL,
  body          text,
  mentions      text[] NOT NULL DEFAULT '{}',
  created_at    bigint NOT NULL,
  edited_at     bigint,
  deleted_at    bigint,
  status        text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'approved')),
  flag_count    integer NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
  CHECK ((parent_id IS NULL) = (depth = 0)),
  CHECK ((deleted_at IS NULL) = (body IS NOT NULL))
);
-- Top-level listing, newest first, keyset (created_at, id).
CREATE INDEX IF NOT EXISTS comments_top_level ON comments (tenant_id, resource_type, resource_id, created_at DESC, id DESC) WHERE parent_id IS NULL;
-- Replies to one comment, oldest first, and reply counts.
CREATE INDEX IF NOT EXISTS comments_replies ON comments (parent_id, created_at, id) WHERE parent_id IS NOT NULL;
-- Moderation queue per tenant.
CREATE INDEX IF NOT EXISTS comments_hidden ON comments (tenant_id, created_at) WHERE status = 'hidden';

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id text NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id    text NOT NULL,
  emoji      text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS comment_flags (
  comment_id text NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id    text NOT NULL,
  reason     text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);
