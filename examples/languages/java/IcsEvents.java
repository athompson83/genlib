// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;

/** RFC 5545 VCALENDAR writer with TEXT escaping and 75-octet line folding. */
public final class IcsEvents {
    private IcsEvents() {}

    /** One VEVENT. start/end are both UTC "YYYY-MM-DDTHH:MM:SSZ" or both "YYYY-MM-DD"; description, location, url may be null. */
    public record Event(String uid, String dtstamp, String start, String end, String summary,
                        String description, String location, String url) {
        public static Event of(String uid, String dtstamp, String start, String end, String summary) {
            return new Event(uid, dtstamp, start, end, summary, null, null, null);
        }
    }

    private static LocalDateTime utc(String s) {
        if (s == null || !s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z")) return null;
        try { return LocalDateTime.parse(s.substring(0, 19)); } catch (DateTimeParseException e) { return null; }
    }

    private static LocalDate date(String s) {
        if (s == null || !s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return null;
        try { return LocalDate.parse(s); } catch (DateTimeParseException e) { return null; }
    }

    /** Escapes RFC 5545 TEXT: backslash, semicolon, comma and line breaks. */
    public static String escapeText(String value) {
        return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n");
    }

    /** Folds a content line at 75 octets (74 after the leading space), never splitting a UTF-8 character. */
    public static String fold(String line) {
        StringBuilder out = new StringBuilder();
        int used = 0;
        int limit = 75;
        for (int i = 0; i < line.length(); ) {
            int cp = line.codePointAt(i);
            String ch = new String(Character.toChars(cp));
            int size = ch.getBytes(StandardCharsets.UTF_8).length;
            if (used + size > limit) { out.append("\r\n "); used = 0; limit = 74; }
            out.append(ch);
            used += size;
            i += Character.charCount(cp);
        }
        return out.append("\r\n").toString();
    }

    private static String required(String value, String name) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(name + " is required");
        return value;
    }

    private static String compact(String s) { return s.replace("-", "").replace(":", ""); }

    private static void validateUrl(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        String rest = lower.startsWith("https://") ? lower.substring(8) : lower.startsWith("http://") ? lower.substring(7) : null;
        boolean ok = rest != null && !rest.isEmpty() && "/?#".indexOf(rest.charAt(0)) < 0;
        for (int i = 0; ok && i < url.length(); i++)
            if (Character.isWhitespace(url.charAt(i)) || Character.isISOControl(url.charAt(i))) ok = false;
        if (!ok) throw new IllegalArgumentException("url must be an absolute http(s) URL: " + url);
    }

    /** Builds a published VCALENDAR; every line ends with CRLF. */
    public static String icsCalendar(List<Event> events, String prodId) {
        if (events == null) throw new IllegalArgumentException("events is required");
        StringBuilder out = new StringBuilder();
        out.append(fold("BEGIN:VCALENDAR")).append(fold("VERSION:2.0"))
            .append(fold("PRODID:" + escapeText(required(prodId, "prodId"))))
            .append(fold("CALSCALE:GREGORIAN")).append(fold("METHOD:PUBLISH"));
        for (Event e : events) {
            if (e == null) throw new IllegalArgumentException("event must not be null");
            required(e.uid(), "uid");
            required(e.summary(), "summary");
            if (utc(e.dtstamp()) == null) throw new IllegalArgumentException("dtstamp must be UTC YYYY-MM-DDTHH:MM:SSZ: " + e.dtstamp());
            String startLine;
            String endLine;
            LocalDateTime st = utc(e.start());
            LocalDateTime en = utc(e.end());
            if (st != null && en != null) {
                if (!en.isAfter(st)) throw new IllegalArgumentException("end must be after start");
                startLine = "DTSTART:" + compact(e.start());
                endLine = "DTEND:" + compact(e.end());
            } else {
                LocalDate sd = date(e.start());
                LocalDate ed = date(e.end());
                if (sd == null || ed == null)
                    throw new IllegalArgumentException("start and end must both be UTC date-times or both be dates");
                if (!ed.isAfter(sd)) throw new IllegalArgumentException("end must be after start");
                startLine = "DTSTART;VALUE=DATE:" + compact(e.start());
                endLine = "DTEND;VALUE=DATE:" + compact(e.end());
            }
            if (e.url() != null) validateUrl(e.url());
            out.append(fold("BEGIN:VEVENT")).append(fold("UID:" + escapeText(e.uid())))
                .append(fold("DTSTAMP:" + compact(e.dtstamp()))).append(fold(startLine)).append(fold(endLine))
                .append(fold("SUMMARY:" + escapeText(e.summary())));
            if (e.description() != null) out.append(fold("DESCRIPTION:" + escapeText(e.description())));
            if (e.location() != null) out.append(fold("LOCATION:" + escapeText(e.location())));
            if (e.url() != null) out.append(fold("URL:" + e.url()));
            out.append(fold("END:VEVENT"));
        }
        return out.append(fold("END:VCALENDAR")).toString();
    }
}
