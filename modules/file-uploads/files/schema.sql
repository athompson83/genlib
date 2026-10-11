-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for file-uploads (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the tables by passing { table, quotaTable } to createSqlUploadMetadataStore.
-- Bytes live in your BlobStore (object storage) under storage_key, a random id; never under the user's file name.
CREATE TABLE IF NOT EXISTS file_uploads (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL,
  owner_id      text NOT NULL,
  storage_key   text NOT NULL UNIQUE,
  filename      text NOT NULL,
  content_type  text NOT NULL,
  size          bigint NOT NULL CHECK (size > 0),
  status        text NOT NULL CHECK (status IN ('quarantined', 'clean', 'infected')),
  created_at    bigint NOT NULL,
  scanned_at    bigint
);
CREATE INDEX IF NOT EXISTS file_uploads_tenant ON file_uploads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_uploads_quarantined ON file_uploads (created_at) WHERE status = 'quarantined';

-- Bytes reserved or stored per tenant. Reservations use one conditional upsert, so concurrent uploads cannot
-- together exceed the quota.
CREATE TABLE IF NOT EXISTS file_upload_quotas (
  tenant_id   text PRIMARY KEY,
  used_bytes  bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0)
);
