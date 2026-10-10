// SPDX-License-Identifier: Apache-2.0
import ical from 'ical-generator';
import { parseDateOnly, parseInstant, validateEvents, type CalendarEvent } from './events.js';

/** UTC for timed events avoids an incomplete VTIMEZONE. All-day values retain their nominal dates. */
export function exportCalendar(events: readonly CalendarEvent[], options: { name: string; domain: string }): string {
  validateEvents(events);
  if (!/^[a-z0-9.-]+$/iu.test(options.domain) || !options.name.trim()) throw new Error('Supply a stable calendar UID domain and name.');
  const calendar = ical({ name: options.name, prodId: { company: options.domain, product: 'Genlib calendar', language: 'EN' } });
  for (const event of events) {
    calendar.createEvent({ id: `${encodeURIComponent(event.id)}@${options.domain}`,
      start: event.allDay ? parseDateOnly(event.start) : parseInstant(event.start),
      end: event.allDay ? parseDateOnly(event.end) : parseInstant(event.end),
      allDay: !!event.allDay, summary: event.title, description: event.description, location: event.location,
      sequence: event.sequence, stamp: parseInstant(event.updatedAt), lastModified: parseInstant(event.updatedAt) });
  }
  return calendar.toString();
}
