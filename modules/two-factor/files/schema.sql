-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for two-factor (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the tables by passing { prefix } to createSqlTwoFactorStore (the names
-- below assume the default prefix "two_factor"). The TOTP secret is stored only as AES-256-GCM ciphertext, and
-- recovery codes only as HMAC-SHA-256 hashes. Delete the user's rows when the account is deleted.
CREATE TABLE IF NOT EXISTS two_factor_enrollments (
  user_id             text PRIMARY KEY,
  status              text NOT NULL CHECK (status IN ('pending', 'active')),
  key_id              text NOT NULL,
  iv                  text NOT NULL,
  ciphertext          text NOT NULL,
  created_at          bigint NOT NULL,
  pending_expires_at  bigint,
  confirmed_at        bigint,
  last_used_step      bigint
);
CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
  user_id     text NOT NULL,
  code_hash   char(64) NOT NULL,
  created_at  bigint NOT NULL,
  used_at     bigint,
  PRIMARY KEY (user_id, code_hash)
);
CREATE TABLE IF NOT EXISTS two_factor_attempts (
  user_id       text PRIMARY KEY,
  window_start  bigint NOT NULL,
  count         integer NOT NULL
);
