-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for org-invitations (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlInvitationStore.
CREATE TABLE IF NOT EXISTS org_invitations (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  email       text NOT NULL,
  role        text NOT NULL,
  invited_by  text NOT NULL,
  token_hash  char(64) NOT NULL UNIQUE,
  status      text NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL,
  accepted_by text,
  closed_at   bigint
);
CREATE INDEX IF NOT EXISTS org_invitations_pending ON org_invitations (tenant_id, created_at) WHERE status = 'pending';
