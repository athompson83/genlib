-- SPDX-License-Identifier: Apache-2.0
-- Tenant isolation on PostgreSQL: an application role that cannot bypass row-level security, and an example
-- tenant table with RLS enabled and forced. For your own tables, generate the same statements with
-- tenantTableSql('your_table') from sql.ts. Apply as the database owner with your migration tool.

-- 1. The application role. Superusers and BYPASSRLS roles skip every policy, so queries must run as this role:
--    either log in as a LOGIN role that is a member of it, or SET LOCAL ROLE app_user inside withTenant.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
-- GRANT app_user TO your_login_user;  -- lets the login user SET ROLE app_user

-- 2. Example tenant table. Every tenant table carries tenant_id and leads its indexes with it.
CREATE TABLE IF NOT EXISTS tenant_items (
  id         text PRIMARY KEY,
  tenant_id  text NOT NULL,
  title      text NOT NULL,
  created_at bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tenant_items_tenant ON tenant_items (tenant_id, id);

-- 3. Row-level security. FORCE applies the policy to the table owner too. The setting is read with
--    missing_ok = true and NULLIF, so an unset (or reset, '') tenant matches no row instead of raising or matching all.
ALTER TABLE tenant_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_items;
CREATE POLICY tenant_isolation ON tenant_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_items TO app_user;
