-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for email-signup (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the tables by passing { accountsTable, tokensTable } to
-- createSqlEmailSignupStore (then rename the constraints and indexes below to match).
-- Emails are stored normalized (trimmed, lowercased); the unique index makes concurrent signups create one row.
-- Only the SHA-256 hash of each verification token is stored. Delete old token rows on a schedule.
CREATE TABLE IF NOT EXISTS email_signup_accounts (
  id                 text PRIMARY KEY,
  email              text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  password_hash      text NOT NULL,
  created_at         bigint NOT NULL,
  verified_at        bigint,
  last_sent_at       bigint,
  send_window_start  bigint,
  send_window_count  integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS email_signup_accounts_email ON email_signup_accounts (email);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          text PRIMARY KEY,
  account_id  text NOT NULL REFERENCES email_signup_accounts (id) ON DELETE CASCADE,
  token_hash  char(64) NOT NULL UNIQUE,
  email       text NOT NULL,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL,
  used_at     bigint,
  revoked_at  bigint
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_pending
  ON email_verification_tokens (account_id) WHERE used_at IS NULL AND revoked_at IS NULL;
