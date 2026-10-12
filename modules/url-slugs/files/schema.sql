-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for url-slugs (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlSlugStore (and rename the
-- indexes here to match). One row per slug ever used in a scope: retired rows are old slugs that redirect.
CREATE TABLE IF NOT EXISTS url_slugs (
  scope       text NOT NULL,
  slug        text NOT NULL,
  entity_id   text NOT NULL,
  created_at  bigint NOT NULL,
  retired_at  bigint,
  -- A slug, current or old, belongs to one entity per scope: concurrent creates cannot share it.
  PRIMARY KEY (scope, slug)
);
-- At most one current slug per entity: concurrent renames of one entity cannot leave two current slugs.
CREATE UNIQUE INDEX IF NOT EXISTS url_slugs_current ON url_slugs (scope, entity_id) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS url_slugs_entity ON url_slugs (scope, entity_id, created_at);
