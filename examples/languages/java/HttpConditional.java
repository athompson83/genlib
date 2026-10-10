// SPDX-License-Identifier: Apache-2.0
import java.time.DateTimeException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Entity tags and conditional request evaluation (RFC 9110 section 13): returns 200, 304 or 412. */
public final class HttpConditional {
    private static final Pattern ETAG = Pattern.compile("(?:W/)?\"[\\x21\\x23-\\x7e\\x80-\\xff]*\"");
    private static final Pattern IMF = Pattern.compile("([A-Z][a-z]{2}), ([0-9]{2}) ([A-Z][a-z]{2}) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT");
    private static final String[] DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
    private static final String[] MONTHS = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    private HttpConditional() {}

    /** Parsed If-Match / If-None-Match value: either the wildcard "*" or a list of valid entity tags. */
    public record EntityTags(boolean wildcard, List<String> tags) {}

    /** A request's conditional headers and the current representation's validators; null means absent / unknown. */
    public record Request(String method, String etag, Long lastModified, String ifMatch, String ifNoneMatch, String ifModifiedSince, String ifUnmodifiedSince) {}

    private static String trim(String s) {
        int a = 0, b = s.length();
        while (a < b && (s.charAt(a) == ' ' || s.charAt(a) == '\t')) a++;
        while (b > a && (s.charAt(b - 1) == ' ' || s.charAt(b - 1) == '\t')) b--;
        return s.substring(a, b);
    }

    /** "*" or the valid entity tags among the comma-separated items (invalid items are ignored). */
    public static EntityTags parseEtags(String header) {
        if (header == null) throw new IllegalArgumentException("header is required");
        String h = trim(header);
        if (h.equals("*")) return new EntityTags(true, List.of());
        List<String> out = new ArrayList<>();
        for (String part : h.split(",", -1)) {
            String p = trim(part);
            if (ETAG.matcher(p).matches()) out.add(p);
        }
        return new EntityTags(false, List.copyOf(out));
    }

    private static String opaque(String e) { return e.startsWith("W/") ? e.substring(2) : e; }

    /** Strong comparison: neither tag is weak and they are identical. */
    public static boolean strongMatch(String a, String b) { return !a.startsWith("W/") && !b.startsWith("W/") && a.equals(b); }

    /** Weak comparison: identical after removing a leading W/. */
    public static boolean weakMatch(String a, String b) { return opaque(a).equals(opaque(b)); }

    /** IMF-fixdate text for unix seconds, e.g. "Wed, 21 Oct 2026 07:28:00 GMT". */
    public static String formatHttpDate(long unixSeconds) {
        LocalDateTime d = LocalDateTime.ofEpochSecond(unixSeconds, 0, ZoneOffset.UTC);
        return String.format(Locale.ROOT, "%s, %02d %s %04d %02d:%02d:%02d GMT", DAYS[d.getDayOfWeek().getValue() - 1], d.getDayOfMonth(),
            MONTHS[d.getMonthValue() - 1], d.getYear(), d.getHour(), d.getMinute(), d.getSecond());
    }

    /** Unix seconds for an exact IMF-fixdate, or null when the text is anything else. */
    public static Long parseHttpDate(String text) {
        if (text == null) return null;
        Matcher m = IMF.matcher(text);
        if (!m.matches()) return null;
        int month = List.of(MONTHS).indexOf(m.group(3)) + 1;
        int year = Integer.parseInt(m.group(4));
        if (month == 0 || year < 1) return null;
        try {
            LocalDateTime d = LocalDateTime.of(year, month, Integer.parseInt(m.group(2)), Integer.parseInt(m.group(5)), Integer.parseInt(m.group(6)), Integer.parseInt(m.group(7)));
            if (!DAYS[d.getDayOfWeek().getValue() - 1].equals(m.group(1))) return null;
            return d.toEpochSecond(ZoneOffset.UTC);
        } catch (DateTimeException e) {
            return null;
        }
    }

    /** Evaluates preconditions in RFC 9110 13.2.2 order: 412 (failed), 304 (not modified) or 200 (proceed). */
    public static int evaluateConditional(Request r) {
        if (r == null || r.method() == null) throw new IllegalArgumentException("method is required");
        boolean safe = r.method().equals("GET") || r.method().equals("HEAD");
        String etag = r.etag();
        if (r.ifMatch() != null) {
            EntityTags tags = parseEtags(r.ifMatch());
            if (tags.wildcard()) {
                if (etag == null) return 412;
            } else if (etag == null || tags.tags().stream().noneMatch(t -> strongMatch(t, etag))) return 412;
        } else if (r.ifUnmodifiedSince() != null && r.lastModified() != null) {
            Long d = parseHttpDate(r.ifUnmodifiedSince());
            if (d != null && r.lastModified() > d) return 412;
        }
        if (r.ifNoneMatch() != null) {
            EntityTags tags = parseEtags(r.ifNoneMatch());
            boolean hit = etag != null && (tags.wildcard() || tags.tags().stream().anyMatch(t -> weakMatch(t, etag)));
            if (hit) return safe ? 304 : 412;
        } else if (r.ifModifiedSince() != null && safe && r.lastModified() != null) {
            Long d = parseHttpDate(r.ifModifiedSince());
            if (d != null && r.lastModified() <= d) return 304;
        }
        return 200;
    }
}
