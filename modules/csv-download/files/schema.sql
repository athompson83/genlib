-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for csv-download's audit log (sql-store.ts createSqlExportLog). Times are epoch milliseconds, as
-- core.ts uses. One row per export: who exported which columns, how many rows were written or denied, and the
-- outcome. Rows you export come from your own tables through createSqlRowSource; this module adds no data table.
-- Rename the table by passing { table } to createSqlExportLog. Prune old rows on your retention schedule.
CREATE TABLE IF NOT EXISTS csv_export_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    text NOT NULL,
  user_id      text NOT NULL,
  columns      text NOT NULL,
  ok           boolean NOT NULL,
  error        text,
  rows_written integer NOT NULL,
  rows_denied  integer NOT NULL,
  bytes        bigint NOT NULL,
  pages        integer NOT NULL,
  truncated    boolean NOT NULL,
  started_at   bigint NOT NULL,
  finished_at  bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS csv_export_log_tenant ON csv_export_log (tenant_id, started_at DESC);
