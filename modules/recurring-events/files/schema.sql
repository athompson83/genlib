-- SPDX-License-Identifier: Apache-2.0
-- PostgreSQL tables for recurring-events (sql-store.ts). Times are epoch milliseconds; local date-times are
-- text YYYY-MM-DDTHH:MM:SS in the series' IANA zone. Rename the tables by passing { seriesTable, overridesTable }.
CREATE TABLE IF NOT EXISTS recurring_event_series (
  id                text PRIMARY KEY,
  calendar_id       text NOT NULL,
  title             text NOT NULL,
  description       text,
  location          text,
  time_zone         text NOT NULL,
  start_local       text NOT NULL,
  duration_minutes  integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 44640),
  rrule             text,
  exdates           jsonb NOT NULL DEFAULT '[]'::jsonb,
  rdates            jsonb NOT NULL DEFAULT '[]'::jsonb,
  range_start       bigint NOT NULL,
  range_end         bigint,
  split_from        text,
  version           integer NOT NULL,
  created_at        bigint NOT NULL,
  updated_at        bigint NOT NULL
);
-- Window queries: series of one calendar whose [range_start, range_end) overlaps the window.
CREATE INDEX IF NOT EXISTS recurring_event_series_calendar_range
  ON recurring_event_series (calendar_id, range_start, range_end);

CREATE TABLE IF NOT EXISTS recurring_event_overrides (
  series_id         text NOT NULL REFERENCES recurring_event_series (id) ON DELETE CASCADE,
  recurrence_id     text NOT NULL,
  cancelled         boolean NOT NULL DEFAULT false,
  start_local       text,
  duration_minutes  integer CHECK (duration_minutes BETWEEN 1 AND 44640),
  title             text,
  description       text,
  location          text,
  updated_at        bigint NOT NULL,
  PRIMARY KEY (series_id, recurrence_id)
);
