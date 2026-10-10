// SPDX-License-Identifier: Apache-2.0
export interface CalendarEvent {
  id: string;
  title: string;
  /** Timed events use ISO instants with Z/offset. All-day events use YYYY-MM-DD dates. End is exclusive. */
  start: string;
  end: string;
  allDay?: boolean;
  sequence: number;
  updatedAt: string;
  description?: string;
  location?: string;
  resourceId?: string;
}

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('Expected YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
  return date;
}
export function parseInstant(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) throw new Error('Timed events require an explicit UTC offset.');
  parseDateOnly(value.slice(0, 10));
  const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('Invalid event instant.');
  return date;
}
export function validateEvents(events: readonly CalendarEvent[]): void {
  const ids = new Set<string>();
  for (const event of events) {
    if (!event.id || /[\r\n]/u.test(event.id) || ids.has(event.id) || !event.title.trim() || !Number.isSafeInteger(event.sequence) || event.sequence < 0) throw new Error('Events need unique IDs, titles and nonnegative sequence numbers.');
    ids.add(event.id);
    const start = event.allDay ? parseDateOnly(event.start) : parseInstant(event.start);
    const end = event.allDay ? parseDateOnly(event.end) : parseInstant(event.end);
    if (end <= start) throw new Error('Event end must follow start.');
    parseInstant(event.updatedAt);
  }
}
/** Native Date calendar widgets display the browser's local timezone. Preserve all-day dates locally. */
export function toDisplayEvents(events: readonly CalendarEvent[]) {
  validateEvents(events);
  const localDate = (value: string) => { const utc = parseDateOnly(value); return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()); };
  return events.map(event => ({ ...event, start: event.allDay ? localDate(event.start) : parseInstant(event.start), end: event.allDay ? localDate(event.end) : parseInstant(event.end) }));
}
export function localDateOnly(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}
