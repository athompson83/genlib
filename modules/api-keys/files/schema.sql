-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for api-keys (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlApiKeyStore.
-- key_hash is the hex HMAC-SHA-256 of the full key under a server pepper; the key itself is never stored.
-- lookup_id is unique because verification finds the row by it before comparing hashes.
CREATE TABLE IF NOT EXISTS api_keys (
  id           text PRIMARY KEY,
  tenant_id    text NOT NULL,
  name         text NOT NULL,
  lookup_id    text NOT NULL UNIQUE,
  prefix       text NOT NULL,
  environment  text NOT NULL CHECK (environment IN ('live', 'test')),
  key_hash     text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  scopes       text[] NOT NULL,
  created_by   text NOT NULL,
  created_at   bigint NOT NULL,
  expires_at   bigint,
  revoked_at   bigint,
  revoked_by   text,
  last_used_at bigint
);
CREATE INDEX IF NOT EXISTS api_keys_tenant_recent ON api_keys (tenant_id, created_at DESC, id DESC);
