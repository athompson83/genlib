-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for email-outbox (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool. Insert outbox rows in the same transaction as the business change when you can.
CREATE TABLE IF NOT EXISTS email_outbox (
  id               text PRIMARY KEY,
  key              text NOT NULL UNIQUE,
  tenant_id        text,
  to_addr          text NOT NULL,
  subject          text NOT NULL,
  text_body        text NOT NULL,
  html_body        text,
  tags             jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint      char(64) NOT NULL,
  status           text NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained',
                     'failed', 'dead', 'cancelled', 'suppressed')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  bigint NOT NULL,
  lease_owner      text,
  lease_expires_at bigint,
  provider_id      text,
  last_error       text,
  created_at       bigint NOT NULL,
  sent_at          bigint
);
CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS email_outbox_provider ON email_outbox (provider_id) WHERE provider_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_suppressions (
  address text PRIMARY KEY,
  reason  text NOT NULL,
  at      bigint NOT NULL
);
