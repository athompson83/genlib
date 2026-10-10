// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, createHttpClient, credential, pathSegment, requireRecord, requireString, type TokenProvider, type TransportOptions } from "./http.js";

export interface GoogleCalendarOptions extends TransportOptions {
  /** Caller-scoped OAuth token with an applicable Calendar events read permission. */
  getAccessToken: TokenProvider;
  /** Trusted allowlist; authorization is still enforced by Google on each request. */
  calendarIds: readonly string[];
}
export interface ListEventsInput {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  maxResults?: number;
  pageToken?: string;
  signal?: AbortSignal;
}
export interface CalendarEvent {
  id: string;
  status: string;
  summary: string | null;
  start: { date?: string; dateTime?: string; timeZone?: string } | null;
  end: { date?: string; dateTime?: string; timeZone?: string } | null;
}
function timestamp(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiClientError("INVALID_INPUT");
  return value;
}
function eventTime(value: unknown): CalendarEvent["start"] {
  if (value === undefined || value === null) return null;
  const data = requireRecord(value);
  const result: NonNullable<CalendarEvent["start"]> = {};
  for (const key of ["date", "dateTime", "timeZone"] as const) {
    if (data[key] !== undefined) result[key] = requireString(data, key);
  }
  return result;
}
export function createGoogleCalendarClient(options: GoogleCalendarOptions) {
  if (typeof options.getAccessToken !== "function" || !Array.isArray(options.calendarIds) || !options.calendarIds.length || options.calendarIds.length > 100) throw new ApiClientError("INVALID_CONFIG");
  const calendarIds = new Set(options.calendarIds.map(id => boundedString(id, "calendar ID", 1024)));
  const getToken = options.getAccessToken;
  const http = createHttpClient({ ...options, origin: "https://www.googleapis.com", headers: async signal => ({
    authorization: `Bearer ${credential(await getToken(signal))}`,
  }) });
  return Object.freeze({
    /** Exactly one bounded page. Follow nextPageToken explicitly with the same filters. */
    async listEvents(input: ListEventsInput): Promise<{ events: CalendarEvent[]; nextPageToken: string | null }> {
      if (!calendarIds.has(input.calendarId)) throw new ApiClientError("INVALID_INPUT");
      const timeMin = timestamp(input.timeMin);
      const timeMax = timestamp(input.timeMax);
      if (Date.parse(timeMax) <= Date.parse(timeMin)) throw new ApiClientError("INVALID_INPUT");
      const maxResults = boundedInteger(input.maxResults ?? 100, 1, 250);
      const query = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: String(maxResults) });
      if (input.pageToken !== undefined) query.set("pageToken", boundedString(input.pageToken, "page token", 4096));
      const data = requireRecord(await http.request(`/calendar/v3/calendars/${pathSegment(input.calendarId)}/events?${query}`, { signal: input.signal }));
      const items = data.items ?? [];
      if (!Array.isArray(items) || items.length > maxResults || (data.nextPageToken !== undefined && typeof data.nextPageToken !== "string")) throw new ApiClientError("INVALID_RESPONSE");
      const events = items.map(value => {
        const record = requireRecord(value);
        if (record.summary !== undefined && typeof record.summary !== "string") throw new ApiClientError("INVALID_RESPONSE");
        return { id: requireString(record, "id"), status: requireString(record, "status"), summary: (record.summary as string | undefined) ?? null, start: eventTime(record.start), end: eventTime(record.end) };
      });
      return { events, nextPageToken: (data.nextPageToken as string | undefined) ?? null };
    },
  });
}
