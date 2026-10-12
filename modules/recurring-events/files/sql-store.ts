// SPDX-License-Identifier: Apache-2.0
// RecurringEventStore on PostgreSQL through any `query(text, params)` executor with $1 placeholders that returns
// { rows } and can run a transaction (node-postgres via a small wrapper, PGlite, Neon). Apply schema.sql first.
// Every write is one transaction that starts with a conditional `UPDATE ... WHERE version = $expected`, so of
// several concurrent writers with the same version exactly one succeeds and the rest change nothing.
import type { EventSeries, OccurrenceOverride, OverrideChanges, RecurringEventStore } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction (BEGIN/COMMIT, ROLLBACK on throw) on one connection. */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlRecurringEventStoreOptions {
  /** Default recurring_event_series. Lowercase letters, digits and underscores only. */
  readonly seriesTable?: string;
  /** Default recurring_event_overrides. */
  readonly overridesTable?: string;
}

const SERIES_COLUMNS = "id, calendar_id, title, description, location, time_zone, start_local, duration_minutes, rrule, exdates, rdates, range_start, range_end, split_from, version, created_at, updated_at";
const OVERRIDE_COLUMNS = "series_id, recurrence_id, cancelled, start_local, duration_minutes, title, description, location, updated_at";

/** Thrown inside a transaction to roll it back when the version check fails. */
class Conflict extends Error {}

const textOrNull = (value: unknown): string | null => (value == null ? null : String(value));
const numberOrNull = (value: unknown): number | null => (value == null ? null : Number(value));
function stringList(value: unknown): string[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function toSeries(row: Record<string, unknown>): EventSeries {
  return {
    id: String(row.id), calendarId: String(row.calendar_id), title: String(row.title),
    description: textOrNull(row.description), location: textOrNull(row.location), timeZone: String(row.time_zone),
    start: String(row.start_local), durationMinutes: Number(row.duration_minutes), rrule: textOrNull(row.rrule),
    exdates: stringList(row.exdates), rdates: stringList(row.rdates),
    rangeStart: Number(row.range_start), rangeEnd: numberOrNull(row.range_end), splitFrom: textOrNull(row.split_from),
    version: Number(row.version), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

function toOverride(row: Record<string, unknown>): OccurrenceOverride {
  return {
    seriesId: String(row.series_id), recurrenceId: String(row.recurrence_id), cancelled: row.cancelled === true || row.cancelled === "t",
    start: textOrNull(row.start_local), durationMinutes: numberOrNull(row.duration_minutes), title: textOrNull(row.title),
    description: textOrNull(row.description), location: textOrNull(row.location), updatedAt: Number(row.updated_at),
  };
}

const seriesParams = (s: EventSeries): unknown[] => [
  s.id, s.calendarId, s.title, s.description, s.location, s.timeZone, s.start, s.durationMinutes, s.rrule,
  JSON.stringify(s.exdates), JSON.stringify(s.rdates), s.rangeStart, s.rangeEnd, s.splitFrom, s.version, s.createdAt, s.updatedAt,
];

export function createSqlRecurringEventStore(db: SqlExecutor, options: SqlRecurringEventStoreOptions = {}): RecurringEventStore {
  const seriesTable = options.seriesTable ?? "recurring_event_series";
  const overridesTable = options.overridesTable ?? "recurring_event_overrides";
  for (const name of [seriesTable, overridesTable]) if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new RangeError("Invalid table name");

  const insertSeriesSql = `INSERT INTO ${seriesTable} (${SERIES_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17)`;
  const updateSeriesSql = `UPDATE ${seriesTable} SET calendar_id = $2, title = $3, description = $4, location = $5, time_zone = $6, start_local = $7,
    duration_minutes = $8, rrule = $9, exdates = $10::jsonb, rdates = $11::jsonb, range_start = $12, range_end = $13, split_from = $14,
    version = $15, created_at = $16, updated_at = $17 WHERE id = $1 AND version = $18 RETURNING id`;
  const upsertOverrideSql = `INSERT INTO ${overridesTable} (${OVERRIDE_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (series_id, recurrence_id) DO UPDATE SET cancelled = EXCLUDED.cancelled, start_local = EXCLUDED.start_local,
    duration_minutes = EXCLUDED.duration_minutes, title = EXCLUDED.title, description = EXCLUDED.description,
    location = EXCLUDED.location, updated_at = EXCLUDED.updated_at`;

  async function applyChanges(tx: SqlExecutor, seriesId: string, changes: OverrideChanges): Promise<void> {
    if (changes.remove.length) await tx.query(`DELETE FROM ${overridesTable} WHERE series_id = $1 AND recurrence_id = ANY($2::text[])`, [seriesId, [...changes.remove]]);
    for (const o of changes.upsert) {
      await tx.query(upsertOverrideSql, [seriesId, o.recurrenceId, o.cancelled, o.start, o.durationMinutes, o.title, o.description, o.location, o.updatedAt]);
    }
  }

  async function conditionalUpdate(tx: SqlExecutor, series: EventSeries, expectedVersion: number): Promise<void> {
    const { rows } = await tx.query(updateSeriesSql, [...seriesParams(series), expectedVersion]);
    if (rows.length !== 1) throw new Conflict();
  }

  async function guarded(work: (tx: SqlExecutor) => Promise<void>): Promise<boolean> {
    try {
      await db.transaction(work);
      return true;
    } catch (error) {
      if (error instanceof Conflict) return false;
      throw error;
    }
  }

  return {
    async insertSeries(series) {
      await db.query(insertSeriesSql, seriesParams(series));
    },
    async getSeries(id) {
      const { rows } = await db.query(`SELECT ${SERIES_COLUMNS} FROM ${seriesTable} WHERE id = $1`, [id]);
      return rows[0] ? toSeries(rows[0]) : null;
    },
    async listOverrides(seriesIds) {
      if (!seriesIds.length) return [];
      const { rows } = await db.query(`SELECT ${OVERRIDE_COLUMNS} FROM ${overridesTable} WHERE series_id = ANY($1::text[]) ORDER BY series_id, recurrence_id`, [[...seriesIds]]);
      return rows.map(toOverride);
    },
    async listSeriesInRange(calendarId, from, to, limit) {
      const { rows } = await db.query(
        `SELECT ${SERIES_COLUMNS} FROM ${seriesTable} WHERE calendar_id = $1 AND range_start < $3 AND (range_end IS NULL OR range_end > $2)
         ORDER BY range_start, id LIMIT $4`,
        [calendarId, from, to, limit],
      );
      return rows.map(toSeries);
    },
    updateSeries(series, expectedVersion, changes) {
      return guarded(async (tx) => {
        await conditionalUpdate(tx, series, expectedVersion);
        await applyChanges(tx, series.id, changes);
      });
    },
    splitSeries(original, expectedVersion, originalChanges, created, createdOverrides) {
      return guarded(async (tx) => {
        await conditionalUpdate(tx, original, expectedVersion);
        await applyChanges(tx, original.id, originalChanges);
        await tx.query(insertSeriesSql, seriesParams(created));
        await applyChanges(tx, created.id, { remove: [], upsert: createdOverrides });
      });
    },
    async deleteSeries(id, expectedVersion) {
      return guarded(async (tx) => {
        const { rows } = await tx.query(`DELETE FROM ${seriesTable} WHERE id = $1 AND version = $2 RETURNING id`, [id, expectedVersion]);
        if (rows.length !== 1) throw new Conflict();
        await tx.query(`DELETE FROM ${overridesTable} WHERE series_id = $1`, [id]);
      });
    },
  };
}
