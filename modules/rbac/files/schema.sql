-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for rbac (sql-store.ts). Times are epoch milliseconds, as core.ts uses. Text columns use the
-- "C" collation so list order matches the in-memory store's code-point order and the keyset cursor.
-- Apply with your migration tool; rename the table by passing { table } to createSqlRbacStore.
CREATE TABLE IF NOT EXISTS rbac_assignments (
  tenant_id   text COLLATE "C" NOT NULL,
  subject_id  text COLLATE "C" NOT NULL,
  role        text COLLATE "C" NOT NULL,
  -- NULL means tenant-wide; otherwise the one resource the role applies to.
  resource_id text COLLATE "C" CHECK (resource_id IS NULL OR resource_id <> ''),
  expires_at  bigint,
  created_at  bigint NOT NULL,
  granted_by  text NOT NULL
);
-- One row per (tenant, subject, role, scope); COALESCE makes a NULL resource_id one tenant-wide value.
-- Its leading columns also serve per-subject lookups and the tenant listing order.
CREATE UNIQUE INDEX IF NOT EXISTS rbac_assignments_key
  ON rbac_assignments (tenant_id, subject_id, role, (COALESCE(resource_id, '')));
-- Holders of a role across a tenant (the last-owner guard).
CREATE INDEX IF NOT EXISTS rbac_assignments_role_holders
  ON rbac_assignments (tenant_id, role) WHERE resource_id IS NULL;
