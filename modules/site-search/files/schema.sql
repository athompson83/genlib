-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for site-search (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlSearchStore
-- (and rename the indexes below to match).
CREATE TABLE IF NOT EXISTS search_documents (
  tenant_id  text NOT NULL,
  id         text NOT NULL,
  -- setweight(to_tsvector(config, folded field text), 'A'..'D') per declared field, concatenated.
  tsv        tsvector NOT NULL,
  -- Declared filter attributes: keyword -> JSON array of strings, number/date -> JSON number, boolean -> JSON boolean.
  attrs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Original field text, returned for highlights.
  fields     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Principals allowed to see the document; empty means every reader in the tenant.
  visibility text[] NOT NULL DEFAULT '{}',
  updated_at bigint NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
-- Full-text matching (tsv @@ to_tsquery(...)).
CREATE INDEX IF NOT EXISTS search_documents_tsv ON search_documents USING GIN (tsv);
-- Attribute containment filters (attrs @> '{"category": ["shoes"]}').
CREATE INDEX IF NOT EXISTS search_documents_attrs ON search_documents USING GIN (attrs jsonb_path_ops);
