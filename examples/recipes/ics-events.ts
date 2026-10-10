// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 5545 iCalendar (VCALENDAR/VEVENT) writer for "add to calendar" files. Original source; copy and adapt.
// Escapes TEXT values, folds lines longer than 75 UTF-8 octets without splitting a character
// and ends every line with CRLF. Serve the result as text/calendar; charset=utf-8.

export interface IcsEvent {
  uid: string;
  /** UTC "YYYY-MM-DDTHH:MM:SSZ": when this copy of the event was created. */
  dtstamp: string;
  /** UTC "YYYY-MM-DDTHH:MM:SSZ" or an all-day date "YYYY-MM-DD"; start and end use the same form. */
  start: string;
  end: string;
  summary: string;
  description?: string;
  location?: string;
  /** Absolute http(s) URL, written unescaped. */
  url?: string;
}

const UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(y: string, m: string, d: string): boolean {
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

type Moment = { kind: "utc" | "date"; value: string };

function parseMoment(text: unknown, name: string, utcOnly = false): Moment {
  if (typeof text !== "string") throw new TypeError(`${name} must be a string`);
  const utc = UTC.exec(text);
  if (utc) {
    const [, y = "", mo = "", d = "", h = "", mi = "", s = ""] = utc;
    if (!validDate(y, mo, d) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) throw new RangeError(`${name} is not a valid UTC time`);
    return { kind: "utc", value: `${y}${mo}${d}T${h}${mi}${s}Z` };
  }
  const date = utcOnly ? null : DATE.exec(text);
  if (date) {
    const [, y = "", mo = "", d = ""] = date;
    if (!validDate(y, mo, d)) throw new RangeError(`${name} is not a valid date`);
    return { kind: "date", value: `${y}${mo}${d}` };
  }
  throw new RangeError(`${name} must be ${utcOnly ? "" : "YYYY-MM-DD or "}YYYY-MM-DDTHH:MM:SSZ`);
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks (CRLF, LF or a lone CR). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds one content line: at most 75 octets, then CRLF + space + at most 74 octets per line. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let out = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      out += "\r\n ";
      size = 0;
      limit = 74;
    }
    out += ch;
    size += bytes;
  }
  return `${out}\r\n`;
}

function requireText(value: unknown, name: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || (!optional && value.length === 0)) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

/** Builds a VCALENDAR (METHOD:PUBLISH) with one VEVENT per event, validating every field. */
export function icsCalendar(events: readonly IcsEvent[], prodId: string): string {
  const prod = requireText(prodId, "prodId") ?? "";
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${escapeText(prod)}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  events.forEach((event, i) => {
    const at = `events[${i}]`;
    const uid = requireText(event.uid, `${at}.uid`) ?? "";
    const summary = requireText(event.summary, `${at}.summary`) ?? "";
    const stamp = parseMoment(event.dtstamp, `${at}.dtstamp`, true);
    const start = parseMoment(event.start, `${at}.start`);
    const end = parseMoment(event.end, `${at}.end`);
    if (start.kind !== end.kind) throw new RangeError(`${at}: start and end must both be dates or both be UTC times`);
    if (end.value <= start.value) throw new RangeError(`${at}: end must be after start`);
    const description = requireText(event.description, `${at}.description`, true);
    const location = requireText(event.location, `${at}.location`, true);
    const url = requireText(event.url, `${at}.url`, true);
    if (url !== undefined && (!/^https?:\/\/[^/?#\s]+[^\s]*$/i.test(url) || /[\u0000-\u001f\u007f]/.test(url))) {
      throw new RangeError(`${at}.url must be an absolute http(s) URL`);
    }
    const when = (name: string, m: Moment): string => (m.kind === "date" ? `${name};VALUE=DATE:${m.value}` : `${name}:${m.value}`);
    lines.push("BEGIN:VEVENT", `UID:${escapeText(uid)}`, `DTSTAMP:${stamp.value}`, when("DTSTART", start), when("DTEND", end),
      `SUMMARY:${escapeText(summary)}`);
    if (description !== undefined) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (location !== undefined) lines.push(`LOCATION:${escapeText(location)}`);
    if (url !== undefined) lines.push(`URL:${url}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("");
}
