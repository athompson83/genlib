-- SPDX-License-Identifier: Apache-2.0
-- Apply deliberately through the application's migration system; importing the adapter does not run DDL.
CREATE TABLE IF NOT EXISTS genlib_webhook_inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  provider text NOT NULL,
  event_id text NOT NULL,
  payload_hash char(64) NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'complete', 'dead')),
  received_count integer NOT NULL DEFAULT 1,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, provider, event_id)
);
CREATE INDEX IF NOT EXISTS genlib_webhook_inbox_pending
  ON genlib_webhook_inbox (available_at, id) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS genlib_webhook_inbox_leased
  ON genlib_webhook_inbox (lease_until, id) WHERE state = 'processing';
