-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for short-links (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlShortLinkStore.
-- code is unique across tenants because the redirect route resolves a code without a tenant.
CREATE TABLE IF NOT EXISTS short_links (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL,
  code          text NOT NULL UNIQUE,
  url           text NOT NULL,
  created_by    text NOT NULL,
  created_at    bigint NOT NULL,
  expires_at    bigint,
  max_clicks    bigint CHECK (max_clicks IS NULL OR max_clicks > 0),
  clicks        bigint NOT NULL DEFAULT 0,
  last_click_at bigint,
  disabled      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS short_links_tenant_recent ON short_links (tenant_id, created_at DESC, id DESC);
