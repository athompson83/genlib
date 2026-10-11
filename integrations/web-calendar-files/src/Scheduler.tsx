// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react';
import { Calendar, dateFnsLocalizer, type DateLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { localDateOnly, toDisplayEvents, type CalendarEvent } from './events.js';

export const defaultLocalizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } });

export function Scheduler({ events, date, view, onNavigate, onView, onSelect, onCreate, localizer = defaultLocalizer,
  culture = 'en-US', height = 640 }: {
  events: CalendarEvent[]; date: Date; view: View; onNavigate: (date: Date) => void; onView: (view: View) => void;
  onSelect: (event: CalendarEvent) => void;
  onCreate?: (range: { start: string; end: string; allDay: boolean }) => void;
  localizer?: DateLocalizer; culture?: string; height?: number;
}) {
  const display = useMemo(() => toDisplayEvents(events), [events]);
  return <section aria-label="Schedule" className="genlib-scheduler"><p>Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    <div style={{ height }}><Calendar localizer={localizer} culture={culture} events={display} startAccessor="start" endAccessor="end"
      titleAccessor="title" date={date} view={view} onNavigate={onNavigate} onView={onView} selectable={!!onCreate}
      onSelectEvent={selected => { const original = events.find(event => event.id === selected.id); if (original) onSelect(original); }}
      onSelectSlot={slot => {
        const allDay = view === 'month' || (slot.start.getHours() === 0 && slot.end.getHours() === 0 && slot.end > slot.start);
        onCreate?.({ start: allDay ? localDateOnly(slot.start) : slot.start.toISOString(), end: allDay ? localDateOnly(slot.end) : slot.end.toISOString(), allDay });
      }} /></div>
    <details><summary>Schedule as a list</summary><ol>{events.map(event => <li key={event.id}><button type="button" onClick={() => onSelect(event)}>{event.title}</button> — {event.start} to {event.end}{event.allDay ? ' (all day; exclusive end)' : ''}</li>)}</ol></details>
  </section>;
}
