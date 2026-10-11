// SPDX-License-Identifier: Apache-2.0

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Newline-delimited JSON. parseNdjson splits on \n (dropping a trailing \r), skips blank lines (spaces/tabs only) and
 * parses each other line with JsonPatch.parse, so values are LinkedHashMap, ArrayList, String, Long or Double,
 * Boolean and null. A bad line throws IllegalArgumentException whose message starts with "line N" (1-based).
 * stringifyNdjson writes each value compactly with object keys in insertion order, escaping only " \ and control
 * characters (lowercase backslash-u00XX), keeping non-ASCII as is, and ends every value with \n.
 */
public final class Ndjson {
    private Ndjson() {}

    /** Parses NDJSON text into its values; errors name the 1-based line. */
    public static List<Object> parseNdjson(String text) {
        List<Object> out = new ArrayList<>();
        String[] lines = text.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            if (line.endsWith("\r")) line = line.substring(0, line.length() - 1);
            if (line.replace(" ", "").replace("\t", "").isEmpty()) continue;
            try {
                out.add(JsonPatch.parse(line));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("line " + (i + 1) + ": " + e.getMessage(), e);
            }
        }
        return out;
    }

    /** One compact JSON value per line, each followed by \n ("" for no values). */
    public static String stringifyNdjson(List<?> values) {
        StringBuilder out = new StringBuilder();
        for (Object v : values) {
            write(v, out);
            out.append('\n');
        }
        return out.toString();
    }

    private static void write(Object v, StringBuilder out) {
        if (v == null) out.append("null");
        else if (v instanceof Boolean) out.append(v);
        else if (v instanceof String s) writeString(s, out);
        else if (v instanceof Long || v instanceof Integer || v instanceof Short || v instanceof Byte || v instanceof BigInteger) out.append(v);
        else if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (!Double.isFinite(d)) throw new IllegalArgumentException("JSON has no NaN or infinity");
            out.append(d == Math.rint(d) ? new BigDecimal(d).toBigInteger().toString() : Double.toString(d));
        } else if (v instanceof Map<?, ?> m) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!(e.getKey() instanceof String k)) throw new IllegalArgumentException("object keys must be strings");
                if (!first) out.append(',');
                first = false;
                writeString(k, out);
                out.append(':');
                write(e.getValue(), out);
            }
            out.append('}');
        } else if (v instanceof List<?> l) {
            out.append('[');
            for (int i = 0; i < l.size(); i++) {
                if (i > 0) out.append(',');
                write(l.get(i), out);
            }
            out.append(']');
        } else throw new IllegalArgumentException("not a JSON value: " + v.getClass().getName());
    }

    private static void writeString(String s, StringBuilder out) {
        out.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }
}
