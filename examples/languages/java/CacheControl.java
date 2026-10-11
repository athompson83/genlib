// SPDX-License-Identifier: Apache-2.0

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cache-Control (RFC 9111) parse, format and freshness. Directive values are Boolean.TRUE (bare directive), Long
 * (delta-seconds directives) or String (any other argument). An unterminated quote throws IllegalArgumentException.
 */
public final class CacheControl {
    private CacheControl() {}

    private static final Set<String> DELTA = Set.of("max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh");
    private static final Pattern TOKEN = Pattern.compile("[!#$%&'*+\\-.^_`|~0-9A-Za-z]+");

    /** Parses a header into an ordered map; names lowercased, first occurrence wins, invalid delta values dropped. */
    public static LinkedHashMap<String, Object> parseCacheControl(String s) {
        LinkedHashMap<String, Object> out = new LinkedHashMap<>();
        int i = 0;
        int n = s.length();
        while (i < n) {
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t' || s.charAt(i) == ',')) i++;
            if (i >= n) break;
            Matcher m = TOKEN.matcher(s).region(i, n);
            if (!m.lookingAt()) {
                int j = s.indexOf(',', i);
                i = j < 0 ? n : j;
                continue;
            }
            String name = m.group().toLowerCase(Locale.ROOT);
            i = m.end();
            Object val = Boolean.TRUE;
            while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
            if (i < n && s.charAt(i) == '=') {
                i++;
                while (i < n && (s.charAt(i) == ' ' || s.charAt(i) == '\t')) i++;
                if (i < n && s.charAt(i) == '"') {
                    i++;
                    StringBuilder buf = new StringBuilder();
                    while (true) {
                        if (i >= n) throw new IllegalArgumentException("unterminated quote");
                        char c = s.charAt(i);
                        if (c == '\\' && i + 1 < n) { buf.append(s.charAt(i + 1)); i += 2; continue; }
                        if (c == '"') { i++; break; }
                        buf.append(c);
                        i++;
                    }
                    val = buf.toString();
                } else {
                    Matcher t = TOKEN.matcher(s).region(i, n);
                    if (t.lookingAt()) { val = t.group(); i = t.end(); } else val = "";
                }
            }
            int j = s.indexOf(',', i);
            i = j < 0 ? n : j;
            if (DELTA.contains(name)) {
                if (val == Boolean.TRUE && !name.equals("max-stale")) continue;
                if (val != Boolean.TRUE) {
                    Long num = digits((String) val);
                    if (num == null) continue;
                    val = num;
                }
            }
            out.putIfAbsent(name, val);
        }
        return out;
    }

    /** Formats directives in order: TRUE as the bare name, numbers as name=N, strings quoted unless tokens. */
    public static String formatCacheControl(Map<String, ?> directives) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, ?> e : directives.entrySet()) {
            if (sb.length() > 0) sb.append(", ");
            String k = e.getKey();
            Object v = e.getValue();
            if (Boolean.TRUE.equals(v)) sb.append(k);
            else if (v instanceof Long || v instanceof Integer) sb.append(k).append('=').append(v);
            else if (v instanceof String str) {
                if (TOKEN.matcher(str).matches()) sb.append(k).append('=').append(str);
                else sb.append(k).append("=\"").append(str.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
            } else throw new IllegalArgumentException("unsupported value for " + k);
        }
        return sb.toString();
    }

    /** Freshness lifetime in seconds: 0 for no-store/no-cache, s-maxage for shared caches, else max-age, else null. */
    public static Long cacheFreshness(Map<String, ?> directives, boolean shared) {
        if (directives.containsKey("no-store") || directives.containsKey("no-cache")) return 0L;
        if (shared && directives.get("s-maxage") instanceof Long v) return v;
        return directives.get("max-age") instanceof Long v ? v : null;
    }

    /** Freshness lifetime for a private cache. */
    public static Long cacheFreshness(Map<String, ?> directives) { return cacheFreshness(directives, false); }

    // ASCII digits only; values beyond Long range are treated as invalid and dropped.
    private static Long digits(String v) {
        if (v.isEmpty()) return null;
        for (int i = 0; i < v.length(); i++) if (v.charAt(i) < '0' || v.charAt(i) > '9') return null;
        try { return Long.parseLong(v); } catch (NumberFormatException e) { return null; }
    }
}
