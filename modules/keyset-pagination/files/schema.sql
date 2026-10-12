-- SPDX-License-Identifier: Apache-2.0
-- Example list table and keyset indexes for keyset-pagination (sql-store.ts). The module does not own your table:
-- copy the index pattern to the table you already list. One B-tree index per declared sort, leading with the scope
-- columns (tenant) and then the sort columns in the sort's directions, ending with the unique tie-breaker.
-- Sort columns must be NOT NULL; nullable columns break the seek predicate.
CREATE TABLE IF NOT EXISTS keyset_example_items (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  status      text NOT NULL,
  score       integer NOT NULL,
  created_at  bigint NOT NULL,
  title       text NOT NULL
);
-- sort "newest": created_at DESC, id DESC (uniform direction: the row comparison becomes an index condition).
CREATE INDEX IF NOT EXISTS keyset_example_items_newest
  ON keyset_example_items (tenant_id, created_at DESC, id DESC);
-- sort "score": score ASC, created_at DESC, id ASC (mixed directions: the index matches the ORDER BY).
CREATE INDEX IF NOT EXISTS keyset_example_items_score
  ON keyset_example_items (tenant_id, score ASC, created_at DESC, id ASC);
