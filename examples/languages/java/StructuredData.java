// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Script-safe JSON-LD blocks and HTML meta, Open Graph and Twitter tags. */
public final class StructuredData {
    private static final List<String> TWITTER_CARDS = List.of("summary", "summary_large_image", "app", "player");
    private static final int MAX_DEPTH = 64;

    private StructuredData() {}

    /** Page metadata; null optional values are omitted, null type/twitterCard use their defaults. */
    public record Meta(String title, String description, String canonical, String image, String siteName,
                       String type, String twitterCard, String locale) {
        public static Meta of(String title) { return new Meta(title, null, null, null, null, null, null, null); }
    }

    /**
     * Returns {@code <script type="application/ld+json">json</script>} for a Map (use LinkedHashMap
     * for insertion order) or List. Values: Map, List, String, Number, Boolean and null.
     */
    public static String jsonLdScript(Object value) {
        if (!(value instanceof Map) && !(value instanceof List))
            throw new IllegalArgumentException("JSON-LD must be a map or a list");
        return "<script type=\"application/ld+json\">" + toSafeJson(value) + "</script>";
    }

    /** Compact JSON with {@code < > &}, U+2028 and U+2029 escaped as \\uXXXX. */
    public static String toSafeJson(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value, 0);
        return out.toString();
    }

    private static void write(StringBuilder out, Object v, int depth) {
        if (depth > MAX_DEPTH) throw new IllegalArgumentException("JSON nesting exceeds " + MAX_DEPTH + " levels");
        if (v == null) out.append("null");
        else if (v instanceof Boolean) out.append(v.toString());
        else if (v instanceof String) writeString(out, (String) v);
        else if (v instanceof Number) out.append(number((Number) v));
        else if (v instanceof Map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                if (!(e.getKey() instanceof String)) throw new IllegalArgumentException("JSON object keys must be strings");
                if (!first) out.append(',');
                first = false;
                writeString(out, (String) e.getKey());
                out.append(':');
                write(out, e.getValue(), depth + 1);
            }
            out.append('}');
        } else if (v instanceof List) {
            out.append('[');
            boolean first = true;
            for (Object item : (List<?>) v) {
                if (!first) out.append(',');
                first = false;
                write(out, item, depth + 1);
            }
            out.append(']');
        } else throw new IllegalArgumentException("unsupported JSON value type: " + v.getClass().getName());
    }

    private static String number(Number n) {
        if (n instanceof Integer || n instanceof Long || n instanceof Short || n instanceof Byte || n instanceof BigInteger)
            return n.toString();
        if (n instanceof BigDecimal) return ((BigDecimal) n).toPlainString();
        double d = n.doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d))
            throw new IllegalArgumentException("JSON numbers must be finite (NaN and Infinity are not allowed)");
        if (d == Math.rint(d) && Math.abs(d) < 9_007_199_254_740_992.0) return Long.toString((long) d);
        String shortest = n instanceof Float ? Float.toString(n.floatValue()) : Double.toString(d);
        return new BigDecimal(shortest).stripTrailingZeros().toPlainString();
    }

    private static void writeString(StringBuilder out, String s) {
        out.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                default:
                    if (c < 0x20 || c == '<' || c == '>' || c == '&' || c == 0x2028 || c == 0x2029)
                        out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    else out.append(c);
            }
        }
        out.append('"');
    }

    /** Escapes {@code & < > "} for HTML. */
    public static String htmlEscape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static void requireHttps(String field, String value) {
        boolean ok = value.length() > 8 && value.regionMatches(true, 0, "https://", 0, 8) && "/?#".indexOf(value.charAt(8)) < 0;
        for (int i = 0; ok && i < value.length(); i++)
            if (Character.isWhitespace(value.charAt(i)) || Character.isISOControl(value.charAt(i))) ok = false;
        if (!ok) throw new IllegalArgumentException(field + " must be an absolute https URL: " + value);
    }

    /** Renders the tags joined by \n without a trailing newline. */
    public static String metaTags(Meta m) {
        if (m == null || m.title() == null || m.title().trim().isEmpty()) throw new IllegalArgumentException("title must not be empty");
        if (m.canonical() != null) requireHttps("canonical", m.canonical());
        if (m.image() != null) requireHttps("image", m.image());
        String type = m.type() == null ? "website" : m.type();
        if (type.trim().isEmpty()) throw new IllegalArgumentException("type must not be empty");
        String card = m.twitterCard() == null ? "summary_large_image" : m.twitterCard();
        if (!TWITTER_CARDS.contains(card))
            throw new IllegalArgumentException("twitterCard must be one of " + String.join(", ", TWITTER_CARDS) + ": " + card);
        List<String> lines = new ArrayList<>();
        lines.add("<title>" + htmlEscape(m.title()) + "</title>");
        if (m.description() != null) lines.add(name("description", m.description()));
        if (m.canonical() != null) lines.add("<link rel=\"canonical\" href=\"" + htmlEscape(m.canonical()) + "\">");
        lines.add(prop("og:title", m.title()));
        if (m.description() != null) lines.add(prop("og:description", m.description()));
        if (m.canonical() != null) lines.add(prop("og:url", m.canonical()));
        if (m.image() != null) lines.add(prop("og:image", m.image()));
        if (m.siteName() != null) lines.add(prop("og:site_name", m.siteName()));
        lines.add(prop("og:type", type));
        if (m.locale() != null) lines.add(prop("og:locale", m.locale()));
        lines.add(name("twitter:card", card));
        lines.add(name("twitter:title", m.title()));
        if (m.description() != null) lines.add(name("twitter:description", m.description()));
        if (m.image() != null) lines.add(name("twitter:image", m.image()));
        return String.join("\n", lines);
    }

    private static String name(String n, String v) { return "<meta name=\"" + n + "\" content=\"" + htmlEscape(v) + "\">"; }

    private static String prop(String p, String v) { return "<meta property=\"" + p + "\" content=\"" + htmlEscape(v) + "\">"; }
}
