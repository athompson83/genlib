// SPDX-License-Identifier: Apache-2.0

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HTML escaping for text and quoted attributes, unescaping of numeric references (1-10 decimal or 1-8 hex digits,
 * ';' required, C1 0x80-0x9F mapped per the HTML5 windows-1252 table, invalid values to U+FFFD) and a fixed set of
 * named references, and stripTags for plain-text previews.
 */
public final class HtmlEscape {
    private static final Map<String, String> NAMED = Map.ofEntries(
            Map.entry("amp", "&"), Map.entry("lt", "<"), Map.entry("gt", ">"), Map.entry("quot", "\""), Map.entry("apos", "'"),
            Map.entry("nbsp", " "), Map.entry("copy", "©"), Map.entry("reg", "®"), Map.entry("trade", "™"),
            Map.entry("hellip", "…"), Map.entry("mdash", "—"), Map.entry("ndash", "–"), Map.entry("lsquo", "‘"),
            Map.entry("rsquo", "’"), Map.entry("ldquo", "“"), Map.entry("rdquo", "”"), Map.entry("bull", "•"),
            Map.entry("middot", "·"), Map.entry("deg", "°"), Map.entry("plusmn", "±"), Map.entry("times", "×"),
            Map.entry("divide", "÷"), Map.entry("euro", "€"), Map.entry("pound", "£"), Map.entry("yen", "¥"),
            Map.entry("cent", "¢"), Map.entry("sect", "§"), Map.entry("para", "¶"), Map.entry("laquo", "«"),
            Map.entry("raquo", "»"), Map.entry("iexcl", "¡"), Map.entry("iquest", "¿"), Map.entry("shy", "­"));
    private static final int[] C1 = {
        0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
        0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178};
    private static final Pattern REF = Pattern.compile("&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});");
    private static final Pattern SCRIPT = Pattern.compile(
            "<(script|style)\\b[^>]*>.*?(?:</\\1\\s*>|(?=\\n?\\z))",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL | Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern TAG = Pattern.compile("<[A-Za-z/!?][^>]*>");

    private HtmlEscape() {}

    /** Escapes & < > " ' for HTML text and single- or double-quoted attributes. */
    public static String escapeHtml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private static String numeric(long v) {
        if (v == 0 || (v >= 0xD800 && v <= 0xDFFF) || v > 0x10FFFF) return "�";
        int cp = v >= 0x80 && v <= 0x9F ? C1[(int) v - 0x80] : (int) v;
        return new String(Character.toChars(cp));
    }

    /** Decodes numeric and the fixed named character references; unknown names and references without ';' stay. */
    public static String unescapeHtml(String s) {
        return REF.matcher(s).replaceAll(m -> {
            String g = m.group(1);
            String r;
            if (g.charAt(0) == '#') {
                boolean hex = g.charAt(1) == 'x' || g.charAt(1) == 'X';
                long v = hex ? Long.parseLong(g.substring(2), 16) : Long.parseLong(g.substring(1));
                r = numeric(Math.min(v, 0x110000));
            } else {
                r = NAMED.getOrDefault(g, m.group());
            }
            return Matcher.quoteReplacement(r);
        });
    }

    /** Plain-text preview: drops script/style contents, removes tags, then unescapes. NOT a sanitizer for HTML output. */
    public static String stripTags(String s) {
        s = SCRIPT.matcher(s).replaceAll("");
        s = TAG.matcher(s).replaceAll("");
        return unescapeHtml(s);
    }
}
