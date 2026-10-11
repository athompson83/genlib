-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for audit-log (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- audit_log is append-only: triggers refuse UPDATE, DELETE and TRUNCATE. The only deletion path is
-- audit_log_purge(tenant, before), which removes a contiguous oldest prefix of one tenant's chain and moves that
-- tenant's anchor to the last purged entry so the hash chain still verifies. audit_log_heads holds each tenant's
-- latest seq/hash; an INSERT into audit_log must extend that head exactly (seq + 1, prev_hash = head hash).
--
-- Only the table owner can move a head or anchor or delete entries: the triggers check that current_user is the
-- owner (which it is inside the SECURITY DEFINER functions below) and, for deletions and anchor moves, that the
-- transaction-local audit_log.purging flag set by audit_log_purge is on. The flag alone is never enough, because any
-- role can call set_config. Create these objects as a dedicated owner role (not the application role) and grant:
--   GRANT SELECT, INSERT ON audit_log TO app_role;
--   GRANT SELECT ON audit_log_heads TO app_role;
--   GRANT EXECUTE ON FUNCTION audit_log_lock_head(text) TO app_role;
--   GRANT EXECUTE ON FUNCTION audit_log_purge(text, bigint) TO retention_job_role;
-- Do not grant UPDATE, DELETE or TRUNCATE on either table, or ownership/ALTER, to the application role. The
-- functions pin search_path to pg_catalog, public; edit it if you install the tables in another schema.

CREATE TABLE IF NOT EXISTS audit_log_heads (
  tenant_id   text PRIMARY KEY,
  seq         bigint NOT NULL DEFAULT 0 CHECK (seq >= 0),
  hash        text NOT NULL,
  anchor_seq  bigint NOT NULL DEFAULT 0 CHECK (anchor_seq >= 0 AND anchor_seq <= seq),
  anchor_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  tenant_id   text NOT NULL,
  seq         bigint NOT NULL CHECK (seq > 0),
  id          text NOT NULL UNIQUE,
  at          bigint NOT NULL,
  actor_type  text NOT NULL,
  actor_id    text NOT NULL,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  outcome     text NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  request_id  text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   text NOT NULL,
  hash        text NOT NULL,
  PRIMARY KEY (tenant_id, seq)
);
CREATE INDEX IF NOT EXISTS audit_log_actor ON audit_log (tenant_id, actor_id, seq DESC);
CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log (tenant_id, action, seq DESC);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (tenant_id, at);

-- New entries must extend the tenant's head; the head advances in the same statement.
CREATE OR REPLACE FUNCTION audit_log_owner(rel regclass) RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog AS $$
  SELECT current_user = pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = rel
$$;

CREATE OR REPLACE FUNCTION audit_log_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  head audit_log_heads%ROWTYPE;
BEGIN
  SELECT * INTO head FROM audit_log_heads WHERE tenant_id = NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit_log: no chain head for tenant %', NEW.tenant_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.seq <> head.seq + 1 OR NEW.prev_hash <> head.hash THEN
    RAISE EXCEPTION 'audit_log: entry does not extend the chain' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE audit_log_heads SET seq = NEW.seq, hash = NEW.hash WHERE tenant_id = NEW.tenant_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_log_refuse_change() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('audit_log.purging', true), '') = 'on' AND audit_log_owner(TG_RELID) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % refused', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE OR REPLACE FUNCTION audit_log_guard_head() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT audit_log_owner(TG_RELID) THEN
      RAISE EXCEPTION 'audit_log_heads: heads are created only by audit_log_lock_head' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.seq <> 0 OR NEW.anchor_seq <> 0 OR NEW.hash <> repeat('0', 64) OR NEW.anchor_hash <> repeat('0', 64) THEN
      RAISE EXCEPTION 'audit_log_heads: a new head must start at the genesis hash' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_log_heads: DELETE refused' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'audit_log_heads: tenant_id cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- seq/hash advance only from audit_log_before_insert (owner, trigger depth 2), one entry at a time.
  IF (NEW.seq, NEW.hash) IS DISTINCT FROM (OLD.seq, OLD.hash)
     AND (pg_trigger_depth() < 2 OR NEW.seq <> OLD.seq + 1 OR NOT audit_log_owner(TG_RELID)) THEN
    RAISE EXCEPTION 'audit_log_heads: head changes only by appending an entry' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The anchor moves only inside audit_log_purge (owner and purge flag; the flag alone can be set by anyone).
  IF (NEW.anchor_seq, NEW.anchor_hash) IS DISTINCT FROM (OLD.anchor_seq, OLD.anchor_hash)
     AND (coalesce(current_setting('audit_log.purging', true), '') <> 'on' OR NOT audit_log_owner(TG_RELID)) THEN
    RAISE EXCEPTION 'audit_log_heads: anchor changes only through audit_log_purge' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_log_refuse_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: TRUNCATE refused', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_log_insert ON audit_log;
CREATE TRIGGER audit_log_insert BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_before_insert();
DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_refuse_change();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_refuse_truncate();
DROP TRIGGER IF EXISTS audit_log_heads_guard ON audit_log_heads;
CREATE TRIGGER audit_log_heads_guard BEFORE INSERT OR UPDATE OR DELETE ON audit_log_heads FOR EACH ROW EXECUTE FUNCTION audit_log_guard_head();
DROP TRIGGER IF EXISTS audit_log_heads_no_truncate ON audit_log_heads;
CREATE TRIGGER audit_log_heads_no_truncate BEFORE TRUNCATE ON audit_log_heads FOR EACH STATEMENT EXECUTE FUNCTION audit_log_refuse_truncate();

-- Creates the tenant's head at the genesis hash if needed and locks it for the caller's transaction, so the
-- application role needs no INSERT or UPDATE on audit_log_heads.
CREATE OR REPLACE FUNCTION audit_log_lock_head(p_tenant text)
RETURNS TABLE (seq bigint, hash text, anchor_seq bigint, anchor_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO audit_log_heads AS h (tenant_id, seq, hash, anchor_seq, anchor_hash)
    VALUES (p_tenant, 0, repeat('0', 64), 0, repeat('0', 64)) ON CONFLICT (tenant_id) DO NOTHING;
  RETURN QUERY SELECT h.seq, h.hash, h.anchor_seq, h.anchor_hash FROM audit_log_heads h WHERE h.tenant_id = p_tenant FOR UPDATE;
END $$;

-- Retention purge: deletes the tenant's oldest contiguous entries with at < p_before and anchors the chain at the
-- last one deleted. Returns the number of deleted entries.
CREATE OR REPLACE FUNCTION audit_log_purge(p_tenant text, p_before bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  first_kept bigint;
  last_seq   bigint;
  last_hash  text;
  deleted    bigint;
BEGIN
  PERFORM 1 FROM audit_log_heads WHERE tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT min(seq) INTO first_kept FROM audit_log WHERE tenant_id = p_tenant AND at >= p_before;
  SELECT seq, hash INTO last_seq, last_hash FROM audit_log
    WHERE tenant_id = p_tenant AND at < p_before AND (first_kept IS NULL OR seq < first_kept)
    ORDER BY seq DESC LIMIT 1;
  IF last_seq IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM set_config('audit_log.purging', 'on', true);
  DELETE FROM audit_log WHERE tenant_id = p_tenant AND seq <= last_seq;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  UPDATE audit_log_heads SET anchor_seq = last_seq, anchor_hash = last_hash WHERE tenant_id = p_tenant;
  PERFORM set_config('audit_log.purging', 'off', true);
  RETURN deleted;
END $$;

-- SECURITY DEFINER functions run as the owner; only explicitly granted roles may call them.
REVOKE ALL ON FUNCTION audit_log_lock_head(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit_log_purge(text, bigint) FROM PUBLIC;
