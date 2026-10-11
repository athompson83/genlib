// SPDX-License-Identifier: Apache-2.0

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * RFC 6570 URI Template expansion, levels 1-4. Variable values are a String, a List of Strings or an ordered Map of
 * String to String (use LinkedHashMap; iteration order is the output order). A missing name, null, an empty list or
 * an empty map is undefined and skipped. Strings are processed by code point and percent-encoded as UTF-8 with
 * uppercase hex. Literal text keeps unreserved and reserved characters and %XX triplets (RFC 6570 section 3.1) and
 * percent-encodes everything else, including a '%' not followed by two hex digits. An invalid template (unclosed or stray brace, empty expression, bad name or prefix, reserved
 * operator = , ! @ |) or a prefix on a list/map throws IllegalArgumentException.
 */
public final class UrlTemplate {
    private static final String RESERVED = ":/?#[]@!$&'()*+,;=";
    private static final Pattern VARSPEC = Pattern.compile("([^:*]+)(?::([0-9]+)|(\\*))?");
    private static final Pattern VARNAME =
        Pattern.compile("(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*");

    private UrlTemplate() {}

    private static boolean unreserved(int c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_' || c == '~';
    }

    private static boolean hexDigit(char c) {
        return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
    }

    private static String enc(String s, boolean allowReserved) {
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < s.length()) {
            int c = s.codePointAt(i);
            int len = Character.charCount(c);
            if (allowReserved && c == '%' && i + 2 < s.length() && hexDigit(s.charAt(i + 1)) && hexDigit(s.charAt(i + 2))) {
                out.append(s, i, i + 3);
                i += 3;
                continue;
            }
            if (unreserved(c) || (allowReserved && c < 128 && RESERVED.indexOf(c) >= 0)) out.appendCodePoint(c);
            else for (byte b : new String(Character.toChars(c)).getBytes(StandardCharsets.UTF_8)) out.append(String.format("%%%02X", b & 0xFF));
            i += len;
        }
        return out.toString();
    }

    private static String named(String name, String v, String ifemp, boolean allow) {
        return enc(name, allow) + (v.isEmpty() ? ifemp : "=" + enc(v, allow));
    }

    private static String expression(String expr, Map<String, ?> vars) {
        if (expr.isEmpty()) throw new IllegalArgumentException("empty expression");
        char c0 = expr.charAt(0);
        if ("=,!@|".indexOf(c0) >= 0) throw new IllegalArgumentException("reserved operator: " + c0);
        String op = "+#./;?&".indexOf(c0) >= 0 ? String.valueOf(c0) : "";
        String first = op.equals("+") ? "" : op;
        String sep = switch (op) { case ".", "/", ";" -> op; case "?", "&" -> "&"; default -> ","; };
        boolean isNamed = op.equals(";") || op.equals("?") || op.equals("&");
        String ifemp = op.equals("?") || op.equals("&") ? "=" : "";
        boolean allow = op.equals("+") || op.equals("#");
        List<String> parts = new ArrayList<>();
        for (String spec : expr.substring(op.length()).split(",", -1)) {
            Matcher m = VARSPEC.matcher(spec);
            if (!m.matches() || !VARNAME.matcher(m.group(1)).matches()) throw new IllegalArgumentException("bad varspec: " + spec);
            String name = m.group(1);
            int prefix = 0;
            if (m.group(2) != null) {
                String d = m.group(2);
                if (d.startsWith("0") || d.length() > 4) throw new IllegalArgumentException("bad prefix: " + spec);
                prefix = Integer.parseInt(d);
            }
            boolean explode = m.group(3) != null;
            Object value = vars.get(name);
            if (value == null || (value instanceof List<?> l && l.isEmpty()) || (value instanceof Map<?, ?> mm && mm.isEmpty())) continue;
            if (value instanceof String s) {
                String v = s;
                if (prefix > 0 && s.codePointCount(0, s.length()) > prefix) v = s.substring(0, s.offsetByCodePoints(0, prefix));
                parts.add(isNamed ? named(name, v, ifemp, allow) : enc(v, allow));
                continue;
            }
            if (prefix > 0) throw new IllegalArgumentException("prefix on composite value: " + name);
            List<String> items = new ArrayList<>();
            if (value instanceof List<?> list) {
                for (Object x : list) {
                    String xs = (String) x;
                    if (!explode) items.add(enc(xs, allow));
                    else items.add(isNamed ? named(name, xs, ifemp, allow) : enc(xs, allow));
                }
                if (!explode) {
                    String joined = String.join(",", items);
                    parts.add(isNamed ? enc(name, allow) + "=" + joined : joined);
                } else parts.add(String.join(sep, items));
            } else if (value instanceof Map<?, ?> map) {
                for (Map.Entry<?, ?> e : map.entrySet()) {
                    String k = (String) e.getKey();
                    String v = (String) e.getValue();
                    if (!explode) items.add(enc(k, allow) + "," + enc(v, allow));
                    else items.add(isNamed ? named(k, v, ifemp, allow) : enc(k, allow) + "=" + enc(v, allow));
                }
                if (!explode) {
                    String joined = String.join(",", items);
                    parts.add(isNamed ? enc(name, allow) + "=" + joined : joined);
                } else parts.add(String.join(sep, items));
            } else throw new IllegalArgumentException("unsupported value type for " + name);
        }
        return parts.isEmpty() ? "" : first + String.join(sep, parts);
    }

    /** Expands an RFC 6570 template with String, List of String or ordered Map of String values. */
    public static String expandTemplate(String template, Map<String, ?> variables) {
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < template.length()) {
            char c = template.charAt(i);
            if (c == '{') {
                int j = template.indexOf('}', i);
                if (j < 0) throw new IllegalArgumentException("unclosed expression");
                out.append(expression(template.substring(i + 1, j), variables));
                i = j + 1;
            } else if (c == '}') {
                throw new IllegalArgumentException("stray }");
            } else if (c == '%' && i + 2 < template.length() && hexDigit(template.charAt(i + 1)) && hexDigit(template.charAt(i + 2))) {
                // RFC 6570 section 3.1: a pct-encoded triplet in literal text is copied as-is.
                out.append(template, i, i + 3);
                i += 3;
            } else {
                // Other literal code points keep unreserved and reserved characters and encode the rest.
                int len = Character.charCount(template.codePointAt(i));
                out.append(enc(template.substring(i, i + len), true));
                i += len;
            }
        }
        return out.toString();
    }
}
