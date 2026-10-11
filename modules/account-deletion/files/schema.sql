-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for account-deletion (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlAccountDeletionStore
-- (the index names below then need the same rename).
-- One live (pending, executing or completed) request per user is enforced by the partial unique index, so a
-- request racing completion cannot add a pending row for a deleted account; cancelled rows may repeat.
CREATE TABLE IF NOT EXISTS account_deletions (
  id                text PRIMARY KEY,
  user_id           text NOT NULL,
  requested_by      text NOT NULL,
  requested_at      bigint NOT NULL,
  scheduled_for     bigint NOT NULL,
  status            text NOT NULL CHECK (status IN ('pending', 'cancelled', 'executing', 'completed')),
  reason            text,
  cancelled_at      bigint,
  cancelled_by      text,
  completed_at      bigint,
  claim_token       text,
  claim_expires_at  bigint,
  attempts          integer NOT NULL DEFAULT 0,
  completed_steps   text[] NOT NULL DEFAULT '{}',
  last_error        text
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletions_one_live ON account_deletions (user_id) WHERE status IN ('pending', 'executing', 'completed');
CREATE INDEX IF NOT EXISTS account_deletions_user_recent ON account_deletions (user_id, requested_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS account_deletions_due ON account_deletions (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS account_deletions_retry ON account_deletions (claim_expires_at) WHERE status = 'executing';
