// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: server-sent events (WHATWG HTML "event stream" interpretation). Original source; copy and adapt.
// An incremental parser that accepts text in arbitrary chunks (even a CRLF split across two chunks) and a
// formatter for writing events and keep-alive comments from a server. Same behavior as the Genlib Python, Go,
// Rust, Java, Kotlin, C#, Swift and Dart sse modules (shared vectors).

/** One dispatched event: type (default "message"), data lines joined with "\n" and the last event id seen. */
export interface SseEvent { event: string; data: string; id: string }

/** Incremental event-stream parser; feed() returns completed events, retry holds the latest valid retry (ms). */
export class SseParser {
  private buf = "";
  private data: string[] = [];
  private eventType = "";
  private lastId = "";
  private pendingCr = false;
  private first = true;
  /** Latest valid retry value in milliseconds, or null until one arrives. */
  retry: number | null = null;

  /** Consumes one chunk of stream text and returns the events it completed. */
  feed(text: string): SseEvent[] {
    const out: SseEvent[] = [];
    if (this.first && text.length > 0) {
      if (text.startsWith("﻿")) text = text.slice(1);
      this.first = false;
    }
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (this.pendingCr) {
        this.pendingCr = false;
        if (c === 10) { start = i + 1; continue; }
      }
      if (c === 13 || c === 10) {
        this.line(this.buf + text.slice(start, i), out);
        this.buf = "";
        start = i + 1;
        if (c === 13) this.pendingCr = true;
      }
    }
    this.buf += text.slice(start);
    return out;
  }

  private line(line: string, out: SseEvent[]): void {
    if (line === "") {
      if (this.data.length > 0) out.push({ event: this.eventType || "message", data: this.data.join("\n"), id: this.lastId });
      this.data = [];
      this.eventType = "";
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "event") this.eventType = value;
    else if (field === "id") { if (!value.includes("\0")) this.lastId = value; }
    else if (field === "retry" && /^[0-9]+$/.test(value)) this.retry = Number(value);
  }
}

/** All complete events in text; an unterminated final event is dropped, as the specification requires. */
export function parseSse(text: string): SseEvent[] {
  return new SseParser().feed(text);
}

/** One event as stream text: event, id and retry lines (when given), one data: line per line, a blank line. */
export function formatSse(data: string, event?: string | null, id?: string | null, retry?: number | null): string {
  if (event != null && /[\r\n]/.test(event)) throw new RangeError("event must not contain line breaks");
  if (id != null && /[\r\n]/.test(id)) throw new RangeError("id must not contain line breaks");
  if (id != null && id.includes("\0")) throw new RangeError("id must not contain NUL");
  if (retry != null && (!Number.isSafeInteger(retry) || retry < 0)) throw new RangeError("retry must be a non-negative integer");
  const out: string[] = [];
  if (event != null) out.push(`event: ${event}`);
  if (id != null) out.push(`id: ${id}`);
  if (retry != null) out.push(`retry: ${retry}`);
  for (const line of data.split(/\r\n|\r|\n/)) out.push(`data: ${line}`);
  return out.join("\n") + "\n\n";
}

/** A comment line (keep-alive ping) that dispatches no event: ":\n\n" or ": text\n\n". */
export function formatComment(text = ""): string {
  if (/[\r\n]/.test(text)) throw new RangeError("comment must be one line");
  return ":" + (text ? ` ${text}` : "") + "\n\n";
}
