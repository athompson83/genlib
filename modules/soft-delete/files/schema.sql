-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL trash table for soft-delete (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename it by passing { batchTable } to createSqlSoftDeleteStore.
CREATE TABLE IF NOT EXISTS soft_delete_batches (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  entity      text NOT NULL,
  record_id   text NOT NULL,
  deleted_at  bigint NOT NULL,
  deleted_by  text NOT NULL,
  count       integer NOT NULL CHECK (count > 0),
  purge_after bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS soft_delete_batches_trash ON soft_delete_batches (tenant_id, deleted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS soft_delete_batches_due ON soft_delete_batches (purge_after, id);

-- Pattern for each of your own soft-deletable tables (adapt names; this block is a comment, not applied):
--
--   ALTER TABLE projects
--     ADD COLUMN deleted_at   bigint,
--     ADD COLUMN deleted_by   text,
--     ADD COLUMN delete_batch text,
--     ADD CONSTRAINT projects_deleted_consistent
--       CHECK ((deleted_at IS NULL) = (deleted_by IS NULL) AND (deleted_at IS NULL) = (delete_batch IS NULL));
--   -- Unique among live rows only, so a deleted row never blocks a new one; restore then reports the conflict.
--   ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tenant_id_slug_key;
--   CREATE UNIQUE INDEX projects_live_slug ON projects (tenant_id, slug) WHERE deleted_at IS NULL;
--   CREATE INDEX projects_delete_batch ON projects (tenant_id, delete_batch) WHERE delete_batch IS NOT NULL;
--   -- Default reads go through the view (or add `deleted_at IS NULL` to every query): lists, search, counts, exports.
--   CREATE VIEW projects_live AS SELECT * FROM projects WHERE deleted_at IS NULL;
--
--   -- A child table keeps a plain foreign key (NO ACTION, not ON DELETE CASCADE): the purge job deletes children
--   -- first, and a live child left under a purged parent makes the purge fail instead of silently losing rows.
--   CREATE INDEX tasks_project ON tasks (tenant_id, project_id) WHERE deleted_at IS NULL;
--
-- Row-level security, when you use it, should also hide deleted rows from ordinary roles:
--   CREATE POLICY projects_live_only ON projects FOR SELECT USING (deleted_at IS NULL AND tenant_id = current_setting('app.tenant_id'));
