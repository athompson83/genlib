-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for scheduled-tasks (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool. The UNIQUE (schedule_id, scheduled_for) constraint is what makes each
-- occurrence run once across instances; do not drop it.
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id              text PRIMARY KEY,
  cron            text NOT NULL,
  time_zone       text NOT NULL,
  handler         text NOT NULL,
  payload         jsonb NOT NULL DEFAULT 'null'::jsonb,
  overlap         text NOT NULL CHECK (overlap IN ('skip', 'queue', 'allow')),
  catch_up        text NOT NULL CHECK (catch_up IN ('none', 'latest', 'all')),
  max_catch_up    integer NOT NULL,
  grace_ms        bigint NOT NULL,
  max_attempts    integer NOT NULL,
  retry_base_ms   bigint NOT NULL,
  retry_max_ms    bigint NOT NULL,
  lease_ms        bigint NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  next_run_at     bigint,
  slot_run_id     text,
  slot_owner      text,
  slot_since      bigint,
  slot_expires_at bigint,
  created_at      bigint NOT NULL,
  updated_at      bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS scheduled_tasks_due ON scheduled_tasks (next_run_at) WHERE enabled;

CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id               text PRIMARY KEY,
  schedule_id      text NOT NULL REFERENCES scheduled_tasks (id) ON DELETE CASCADE,
  scheduled_for    bigint NOT NULL,
  status           text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  attempt          integer NOT NULL DEFAULT 0,
  next_attempt_at  bigint NOT NULL,
  lease_owner      text,
  lease_expires_at bigint,
  started_at       bigint,
  finished_at      bigint,
  error            text,
  created_at       bigint NOT NULL,
  UNIQUE (schedule_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS scheduled_task_runs_due ON scheduled_task_runs (status, next_attempt_at);
