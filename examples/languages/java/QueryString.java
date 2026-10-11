// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** application/x-www-form-urlencoded query strings exactly as the WHATWG URL standard parses and serializes them. */
public final class QueryString {
    private QueryString() {}

    /** One name/value pair, in query order. */
    public record Param(String name, String value) {}

    /** Parses a query (one leading '?' allowed) into ordered pairs; '+' is a space, invalid '%' stays literal. */
    public static List<Param> parseQuery(String s) {
        if (s.startsWith("?")) s = s.substring(1);
        List<Param> out = new ArrayList<>();
        for (String piece : s.split("&", -1)) {
            if (piece.isEmpty()) continue;
            int eq = piece.indexOf('=');
            String n = eq < 0 ? piece : piece.substring(0, eq);
            String v = eq < 0 ? "" : piece.substring(eq + 1);
            out.add(new Param(decode(n), decode(v)));
        }
        return out;
    }

    /** Serializes pairs: A-Z a-z 0-9 * - . _ kept, space as '+', every other UTF-8 byte as uppercase %XX. */
    public static String stringifyQuery(List<Param> pairs) {
        StringBuilder sb = new StringBuilder();
        for (Param p : pairs) {
            if (sb.length() > 0) sb.append('&');
            encode(p.name(), sb);
            sb.append('=');
            encode(p.value(), sb);
        }
        return sb.toString();
    }

    /** All values for name, in order. */
    public static List<String> getAll(List<Param> pairs, String name) {
        List<String> out = new ArrayList<>();
        for (Param p : pairs) if (p.name().equals(name)) out.add(p.value());
        return out;
    }

    private static int hex(byte b) {
        if (b >= '0' && b <= '9') return b - '0';
        if (b >= 'a' && b <= 'f') return b - 'a' + 10;
        if (b >= 'A' && b <= 'F') return b - 'A' + 10;
        return -1;
    }

    private static String decode(String s) {
        byte[] b = s.replace('+', ' ').getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int i = 0;
        while (i < b.length) {
            if (b[i] == '%' && i + 2 < b.length && hex(b[i + 1]) >= 0 && hex(b[i + 2]) >= 0) {
                out.write(hex(b[i + 1]) * 16 + hex(b[i + 2]));
                i += 3;
            } else out.write(b[i++]);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static void encode(String s, StringBuilder sb) {
        for (byte x : s.getBytes(StandardCharsets.UTF_8)) {
            int c = x & 0xff;
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '*' || c == '-' || c == '.' || c == '_') sb.append((char) c);
            else if (c == ' ') sb.append('+');
            else sb.append('%').append(Character.toUpperCase(Character.forDigit(c >> 4, 16))).append(Character.toUpperCase(Character.forDigit(c & 15, 16)));
        }
    }
}
