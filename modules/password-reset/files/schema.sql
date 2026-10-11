-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for password-reset (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlPasswordResetStore.
-- Only the SHA-256 hash of each token is stored. Delete old rows on a schedule (for example, older than 30 days).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  token_hash  char(64) NOT NULL UNIQUE,
  email       text NOT NULL,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL,
  used_at     bigint,
  revoked_at  bigint
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_pending
  ON password_reset_tokens (user_id, created_at DESC) WHERE used_at IS NULL AND revoked_at IS NULL;
