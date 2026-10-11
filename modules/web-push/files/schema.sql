-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL table for web-push (sql-store.ts). Times are epoch milliseconds, as push.ts uses.
-- Apply with your migration tool; rename the table by passing { table } to createSqlPushSubscriptionStore.
-- p256dh and auth are the browser's public key and auth secret: not passwords, but they let anyone holding them
-- encrypt messages to that browser, so keep the table private to the server.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint        text PRIMARY KEY,
  user_id         text NOT NULL,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  created_at      bigint NOT NULL,
  last_success_at bigint,
  failure_count   integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id ON push_subscriptions (user_id);
