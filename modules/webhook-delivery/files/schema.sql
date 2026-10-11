-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for webhook-delivery (sql-store.ts). Times are epoch milliseconds, as core.ts uses.
-- Apply with your migration tool. Enqueue on the same transaction as the business change so delivery rows commit
-- or roll back with it. Secrets are stored as given (whsec_ or sealed by your secretBox); restrict table access.
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  url         text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_types jsonb,
  enabled     boolean NOT NULL DEFAULT true,
  secrets     jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  bigint NOT NULL,
  updated_at  bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant ON webhook_endpoints (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               text PRIMARY KEY,
  tenant_id        text NOT NULL,
  endpoint_id      text NOT NULL,
  event_id         text NOT NULL,
  event_type       text NOT NULL,
  body             text NOT NULL,
  status           text NOT NULL CHECK (status IN ('pending', 'delivering', 'succeeded', 'dead')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  bigint NOT NULL,
  lease_owner      text,
  lease_expires_at bigint,
  last_error       text,
  last_status_code integer,
  created_at       bigint NOT NULL,
  completed_at     bigint,
  UNIQUE (endpoint_id, event_id)
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due ON webhook_deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS webhook_deliveries_tenant ON webhook_deliveries (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_attempts (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL,
  delivery_id   text NOT NULL,
  attempt       integer NOT NULL,
  started_at    bigint NOT NULL,
  duration_ms   integer NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('success', 'http-error', 'redirect', 'network-error', 'timeout', 'blocked')),
  status_code   integer,
  error         text,
  response_body text
);
CREATE INDEX IF NOT EXISTS webhook_attempts_delivery ON webhook_attempts (delivery_id, started_at);
