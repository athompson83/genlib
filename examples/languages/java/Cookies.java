// SPDX-License-Identifier: Apache-2.0
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** Set-Cookie serialization with RFC 6265 and current browser prefix/SameSite/Partitioned rules, and Cookie header parsing. */
public final class Cookies {
    private static final Pattern TOKEN = Pattern.compile("[!#$%&'*+\\-.^_`|~0-9A-Za-z]+");
    private static final Pattern OCTETS = Pattern.compile("[\\x21\\x23-\\x2b\\x2d-\\x3a\\x3c-\\x5b\\x5d-\\x7e]*");
    private static final Pattern DOMAIN = Pattern.compile("\\.?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*");
    private static final Pattern PATH_BAD = Pattern.compile("[\\x00-\\x1f\\x7f;]");

    private Cookies() {}

    /** Set-Cookie attributes; null / false means not set. Build with the fluent setters. */
    public static final class Options {
        Long maxAge;
        Long expires;
        String domain;
        String path;
        boolean secure;
        boolean httpOnly;
        String sameSite;
        boolean partitioned;

        /** Max-Age in seconds (non-negative). */
        public Options maxAge(long v) { maxAge = v; return this; }
        /** Expires as unix seconds, written as an IMF-fixdate. */
        public Options expires(long v) { expires = v; return this; }
        public Options domain(String v) { domain = v; return this; }
        public Options path(String v) { path = v; return this; }
        public Options secure(boolean v) { secure = v; return this; }
        public Options httpOnly(boolean v) { httpOnly = v; return this; }
        /** "Strict", "Lax" or "None" (exact case). */
        public Options sameSite(String v) { sameSite = v; return this; }
        public Options partitioned(boolean v) { partitioned = v; return this; }
    }

    public static String serializeCookie(String name, String value) { return serializeCookie(name, value, new Options()); }

    /** A Set-Cookie header value; throws IllegalArgumentException for invalid names, values or attribute combinations. */
    public static String serializeCookie(String name, String value, Options o) {
        if (name == null || !TOKEN.matcher(name).matches()) throw new IllegalArgumentException("cookie name must be an RFC 7230 token");
        if (value == null || !OCTETS.matcher(value).matches()) throw new IllegalArgumentException("cookie value has characters outside cookie-octet; encode it first");
        if (o == null) throw new IllegalArgumentException("options are required");
        if (o.domain != null && !DOMAIN.matcher(o.domain).matches()) throw new IllegalArgumentException("invalid cookie domain");
        if (o.path != null && (!o.path.startsWith("/") || PATH_BAD.matcher(o.path).find())) throw new IllegalArgumentException("cookie path must start with / and contain no controls or ;");
        if (o.sameSite != null && !List.of("Strict", "Lax", "None").contains(o.sameSite)) throw new IllegalArgumentException("SameSite must be Strict, Lax or None");
        if ("None".equals(o.sameSite) && !o.secure) throw new IllegalArgumentException("SameSite=None requires Secure");
        if (o.partitioned && !o.secure) throw new IllegalArgumentException("Partitioned requires Secure");
        if (name.startsWith("__Secure-") && !o.secure) throw new IllegalArgumentException("__Secure- requires Secure");
        if (name.startsWith("__Host-") && (!o.secure || o.domain != null || !"/".equals(o.path))) throw new IllegalArgumentException("__Host- requires Secure, Path=/ and no Domain");
        if (o.maxAge != null && o.maxAge < 0) throw new IllegalArgumentException("maxAge must be non-negative");
        List<String> out = new ArrayList<>();
        out.add(name + "=" + value);
        if (o.maxAge != null) out.add("Max-Age=" + o.maxAge);
        if (o.expires != null) out.add("Expires=" + imfFixdate(o.expires));
        if (o.domain != null) out.add("Domain=" + o.domain.toLowerCase(Locale.ROOT));
        if (o.path != null) out.add("Path=" + o.path);
        if (o.secure) out.add("Secure");
        if (o.httpOnly) out.add("HttpOnly");
        if (o.sameSite != null) out.add("SameSite=" + o.sameSite);
        if (o.partitioned) out.add("Partitioned");
        return String.join("; ", out);
    }

    private static final String[] DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
    private static final String[] MONTHS = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    /** IMF-fixdate text for unix seconds, e.g. "Wed, 21 Oct 2026 07:28:00 GMT". */
    static String imfFixdate(long unixSeconds) {
        LocalDateTime d = LocalDateTime.ofEpochSecond(unixSeconds, 0, ZoneOffset.UTC);
        return String.format(Locale.ROOT, "%s, %02d %s %04d %02d:%02d:%02d GMT", DAYS[d.getDayOfWeek().getValue() - 1], d.getDayOfMonth(),
            MONTHS[d.getMonthValue() - 1], d.getYear(), d.getHour(), d.getMinute(), d.getSecond());
    }

    private static String trim(String s) {
        int a = 0, b = s.length();
        while (a < b && (s.charAt(a) == ' ' || s.charAt(a) == '\t')) a++;
        while (b > a && (s.charAt(b - 1) == ' ' || s.charAt(b - 1) == '\t')) b--;
        return s.substring(a, b);
    }

    /** Ordered name/value pairs from a Cookie request header (duplicates kept, one pair of surrounding quotes removed). */
    public static List<Map.Entry<String, String>> parseCookieHeader(String header) {
        if (header == null) throw new IllegalArgumentException("header is required");
        List<Map.Entry<String, String>> out = new ArrayList<>();
        for (String piece : header.split(";", -1)) {
            int eq = piece.indexOf('=');
            if (eq < 0) continue;
            String n = trim(piece.substring(0, eq));
            String v = trim(piece.substring(eq + 1));
            if (n.isEmpty()) continue;
            if (v.length() >= 2 && v.charAt(0) == '"' && v.charAt(v.length() - 1) == '"') v = v.substring(1, v.length() - 1);
            out.add(Map.entry(n, v));
        }
        return out;
    }
}
