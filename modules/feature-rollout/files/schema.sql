-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for feature-rollout (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool. The audit table is append-only: a trigger rejects UPDATE and DELETE, so even a
-- compromised application role cannot rewrite history (a superuser or table owner can still drop the trigger).
-- Grant the application role only SELECT and INSERT on feature_flag_audit.
--
-- run_id: each experiment run (a flag's creation, or a salt change) has its own id, stored in the flag's config.
-- Assignment, exposure and conversion rows are keyed by it, so a rerun starts fresh and old rows are not counted.
-- Delete rows of old runs on a schedule if you do not need them for history.
--
-- Upgrading a database that applied an earlier draft of this file (tables without run_id): run once
--   ALTER TABLE feature_flag_assignments ADD COLUMN IF NOT EXISTS run_id text NOT NULL DEFAULT '';
--   ALTER TABLE feature_flag_assignments DROP CONSTRAINT feature_flag_assignments_pkey,
--     ADD PRIMARY KEY (flag_key, run_id, subject_key);
--   ALTER TABLE feature_flag_exposures ADD COLUMN IF NOT EXISTS run_id text NOT NULL DEFAULT '';
--   ALTER TABLE feature_flag_exposures DROP CONSTRAINT feature_flag_exposures_pkey, ADD PRIMARY KEY (flag_key, run_id, unit_id);
--   ALTER TABLE feature_flag_conversions ADD COLUMN IF NOT EXISTS run_id text NOT NULL DEFAULT '';
--   ALTER TABLE feature_flag_conversions DROP CONSTRAINT feature_flag_conversions_pkey,
--     ADD PRIMARY KEY (flag_key, run_id, metric, unit_id);
--   DROP INDEX IF EXISTS feature_flag_assignments_by_unit;
-- then re-apply this file. Existing flags have no runId and keep run '' (their old rows) until the next salt change.
CREATE TABLE IF NOT EXISTS feature_flags (
  key         text PRIMARY KEY,
  config      jsonb NOT NULL,
  version     integer NOT NULL CHECK (version > 0),
  updated_at  bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flag_audit (
  seq         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          text NOT NULL UNIQUE,
  flag_key    text NOT NULL,
  action      text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  actor       text NOT NULL,
  at          bigint NOT NULL,
  before      jsonb,
  after       jsonb
);
CREATE INDEX IF NOT EXISTS feature_flag_audit_by_flag ON feature_flag_audit (flag_key, seq DESC);

CREATE OR REPLACE FUNCTION feature_flag_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'feature_flag_audit is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS feature_flag_audit_no_change ON feature_flag_audit;
CREATE TRIGGER feature_flag_audit_no_change BEFORE UPDATE OR DELETE ON feature_flag_audit
  FOR EACH ROW EXECUTE FUNCTION feature_flag_audit_append_only();

-- Sticky experiment assignments. Stitched copies (anon -> user) share the unit_id of the first assignment.
CREATE TABLE IF NOT EXISTS feature_flag_assignments (
  flag_key     text NOT NULL,
  run_id       text NOT NULL DEFAULT '',
  subject_key  text NOT NULL,
  unit_id      text NOT NULL,
  variant      text,
  assigned_at  bigint NOT NULL,
  PRIMARY KEY (flag_key, run_id, subject_key)
);
CREATE INDEX IF NOT EXISTS feature_flag_assignments_by_unit ON feature_flag_assignments (flag_key, run_id, unit_id);
CREATE INDEX IF NOT EXISTS feature_flag_assignments_by_subject ON feature_flag_assignments (subject_key);

-- One exposure per unit per flag run; the variant is the one shown at first exposure.
CREATE TABLE IF NOT EXISTS feature_flag_exposures (
  flag_key  text NOT NULL,
  run_id    text NOT NULL DEFAULT '',
  unit_id   text NOT NULL,
  variant   text,
  at        bigint NOT NULL,
  PRIMARY KEY (flag_key, run_id, unit_id)
);

CREATE TABLE IF NOT EXISTS feature_flag_conversions (
  flag_key  text NOT NULL,
  run_id    text NOT NULL DEFAULT '',
  metric    text NOT NULL,
  unit_id   text NOT NULL,
  at        bigint NOT NULL,
  PRIMARY KEY (flag_key, run_id, metric, unit_id)
);
