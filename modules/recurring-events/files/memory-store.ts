// SPDX-License-Identifier: Apache-2.0
// Per-process RecurringEventStore for tests and prototypes. Each method checks and writes without awaiting in
// between, so version checks are atomic within one process. Not shared across processes or restarts.
import type { EventSeries, OccurrenceOverride, OverrideChanges, RecurringEventStore } from "./core.js";

export class MemoryRecurringEventStore implements RecurringEventStore {
  readonly #series = new Map<string, EventSeries>();
  readonly #overrides = new Map<string, Map<string, OccurrenceOverride>>();

  async insertSeries(series: EventSeries): Promise<void> {
    if (this.#series.has(series.id)) throw new Error(`duplicate series id ${series.id}`);
    this.#series.set(series.id, { ...series });
    this.#overrides.set(series.id, new Map());
  }

  async getSeries(id: string): Promise<EventSeries | null> {
    const series = this.#series.get(id);
    return series ? { ...series } : null;
  }

  async listOverrides(seriesIds: readonly string[]): Promise<OccurrenceOverride[]> {
    return seriesIds.flatMap((id) => [...(this.#overrides.get(id)?.values() ?? [])].map((o) => ({ ...o })));
  }

  async listSeriesInRange(calendarId: string, from: number, to: number, limit: number): Promise<EventSeries[]> {
    return [...this.#series.values()]
      .filter((s) => s.calendarId === calendarId && s.rangeStart < to && (s.rangeEnd === null || s.rangeEnd > from))
      .sort((a, b) => a.rangeStart - b.rangeStart || (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  #apply(id: string, changes: OverrideChanges): void {
    const map = this.#overrides.get(id) ?? new Map<string, OccurrenceOverride>();
    for (const rid of changes.remove) map.delete(rid);
    for (const o of changes.upsert) map.set(o.recurrenceId, { ...o, seriesId: id });
    this.#overrides.set(id, map);
  }

  async updateSeries(series: EventSeries, expectedVersion: number, changes: OverrideChanges): Promise<boolean> {
    if (this.#series.get(series.id)?.version !== expectedVersion) return false;
    this.#series.set(series.id, { ...series });
    this.#apply(series.id, changes);
    return true;
  }

  async splitSeries(original: EventSeries, expectedVersion: number, originalChanges: OverrideChanges, created: EventSeries, createdOverrides: readonly OccurrenceOverride[]): Promise<boolean> {
    if (this.#series.get(original.id)?.version !== expectedVersion || this.#series.has(created.id)) return false;
    this.#series.set(original.id, { ...original });
    this.#apply(original.id, originalChanges);
    this.#series.set(created.id, { ...created });
    this.#overrides.set(created.id, new Map());
    this.#apply(created.id, { remove: [], upsert: createdOverrides });
    return true;
  }

  async deleteSeries(id: string, expectedVersion: number): Promise<boolean> {
    if (this.#series.get(id)?.version !== expectedVersion) return false;
    this.#series.delete(id);
    this.#overrides.delete(id);
    return true;
  }
}
