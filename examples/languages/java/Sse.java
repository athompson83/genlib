// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.List;

/** Server-sent events (WHATWG HTML event stream): incremental parser and formatter. */
public final class Sse {
    private Sse() {}

    /** One dispatched event: type (default "message"), data lines joined with "\n" and the last event id. */
    public record Event(String event, String data, String id) {}

    /** Incremental parser; text may arrive in arbitrary chunks, including a CRLF split across chunks. */
    public static final class Parser {
        private final StringBuilder buf = new StringBuilder();
        private final List<String> data = new ArrayList<>();
        private String event = "";
        private String lastId = "";
        private Long retry;
        private boolean pendingCr;
        private boolean first = true;

        /** Latest valid retry value in milliseconds, or null until one arrives. */
        public Long retry() { return retry; }

        /** Feeds a chunk of stream text and returns the events completed by it. */
        public List<Event> feed(String text) {
            List<Event> out = new ArrayList<>();
            if (first && !text.isEmpty()) {
                if (text.charAt(0) == '﻿') text = text.substring(1);
                first = false;
            }
            for (int i = 0; i < text.length(); i++) {
                char ch = text.charAt(i);
                if (pendingCr) {
                    pendingCr = false;
                    if (ch == '\n') continue;
                }
                if (ch == '\r') { pendingCr = true; line(buf.toString(), out); buf.setLength(0); }
                else if (ch == '\n') { line(buf.toString(), out); buf.setLength(0); }
                else buf.append(ch);
            }
            return out;
        }

        private void line(String line, List<Event> out) {
            if (line.isEmpty()) {
                if (!data.isEmpty()) out.add(new Event(event.isEmpty() ? "message" : event, String.join("\n", data), lastId));
                data.clear();
                event = "";
                return;
            }
            if (line.startsWith(":")) return;
            int colon = line.indexOf(':');
            String field = colon < 0 ? line : line.substring(0, colon);
            String value = colon < 0 ? "" : line.substring(colon + 1);
            if (colon >= 0 && value.startsWith(" ")) value = value.substring(1);
            switch (field) {
                case "data" -> data.add(value);
                case "event" -> event = value;
                case "id" -> { if (value.indexOf('\0') < 0) lastId = value; }
                case "retry" -> {
                    if (!value.isEmpty() && value.chars().allMatch(c -> c >= '0' && c <= '9')) {
                        try { retry = Long.parseLong(value); } catch (NumberFormatException e) { /* too large: ignored */ }
                    }
                }
                default -> { }
            }
        }
    }

    /** All complete events in text (an unterminated final event is dropped). */
    public static List<Event> parse(String text) { return new Parser().feed(text); }

    /** One event as stream text; event, id and retry may be null (absent); data lines become data: lines. */
    public static String format(String data, String event, String id, Long retry) {
        if (event != null && (event.indexOf('\r') >= 0 || event.indexOf('\n') >= 0)) throw new IllegalArgumentException("event must not contain line breaks");
        if (id != null && (id.indexOf('\r') >= 0 || id.indexOf('\n') >= 0)) throw new IllegalArgumentException("id must not contain line breaks");
        if (id != null && id.indexOf('\0') >= 0) throw new IllegalArgumentException("id must not contain NUL");
        if (retry != null && retry < 0) throw new IllegalArgumentException("retry must be >= 0");
        StringBuilder out = new StringBuilder();
        if (event != null) out.append("event: ").append(event).append('\n');
        if (id != null) out.append("id: ").append(id).append('\n');
        if (retry != null) out.append("retry: ").append(retry).append('\n');
        for (String line : data.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1)) out.append("data: ").append(line).append('\n');
        return out.append('\n').toString();
    }

    /** One event with only data. */
    public static String format(String data) { return format(data, null, null, null); }

    /** A comment line (keep-alive ping) that dispatches no event: ": text\n\n", or ":\n\n" when empty. */
    public static String formatComment(String text) {
        if (text.indexOf('\r') >= 0 || text.indexOf('\n') >= 0) throw new IllegalArgumentException("comment must be one line");
        return ":" + (text.isEmpty() ? "" : " " + text) + "\n\n";
    }

    /** An empty comment ":\n\n". */
    public static String formatComment() { return formatComment(""); }
}
