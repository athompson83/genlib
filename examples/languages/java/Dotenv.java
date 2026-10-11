// SPDX-License-Identifier: Apache-2.0

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * .env file parser: comments, 'export ', unquoted (trimmed, ' #' comments), single-quoted (literal) and double-quoted
 * (multi-line, escapes) values, optional ${NAME} / ${NAME:-default} expansion. Errors throw IllegalArgumentException
 * with a message starting "line N:".
 */
public final class Dotenv {
    private Dotenv() {}

    private static final Pattern KEY = Pattern.compile("[A-Za-z_][A-Za-z0-9_.]*");
    private static final Pattern REF = Pattern.compile("(?<!\\x00)\\$\\{([A-Za-z_][A-Za-z0-9_.]*)(:-([^}]*))?\\}");

    /** Parses .env text into an ordered map without expansion. */
    public static LinkedHashMap<String, String> parseDotenv(String text) { return parseDotenv(text, false, Map.of()); }

    /** Parses .env text; with expand, ${NAME} and ${NAME:-default} resolve from earlier keys, then vars. */
    public static LinkedHashMap<String, String> parseDotenv(String text, boolean expand, Map<String, String> vars) {
        String[] lines = text.replace("\r\n", "\n").split("\n", -1);
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        Map<String, Boolean> single = new LinkedHashMap<>();
        int i = 0;
        while (i < lines.length) {
            String line = lines[i];
            int no = i + 1;
            i++;
            String s = strip(line);
            if (s.isEmpty() || s.startsWith("#")) continue;
            if (s.startsWith("export ")) s = lstrip(s.substring(7));
            int eq = s.indexOf('=');
            if (eq < 0) throw new IllegalArgumentException("line " + no + ": expected KEY=VALUE");
            String key = strip(s.substring(0, eq));
            String rest = lstrip(s.substring(eq + 1));
            if (!KEY.matcher(key).matches()) throw new IllegalArgumentException("line " + no + ": invalid key '" + key + "'");
            String val;
            String tail;
            boolean isSingle = false;
            if (rest.startsWith("'")) {
                int end = rest.indexOf('\'', 1);
                if (end < 0) throw new IllegalArgumentException("line " + no + ": unterminated single quote");
                val = rest.substring(1, end);
                tail = rest.substring(end + 1);
                isSingle = true;
            } else if (rest.startsWith("\"")) {
                String buf = rest.substring(1);
                StringBuilder v = new StringBuilder();
                int j = 0;
                while (true) {
                    boolean closed = false;
                    while (j < buf.length()) {
                        char c = buf.charAt(j);
                        if (c == '\\' && j + 1 < buf.length()) {
                            char n = buf.charAt(j + 1);
                            switch (n) {
                                case 'n' -> v.append('\n');
                                case 'r' -> v.append('\r');
                                case 't' -> v.append('\t');
                                case '"' -> v.append('"');
                                case '\\' -> v.append('\\');
                                case '$' -> v.append("\0$");
                                default -> v.append('\\').append(n);
                            }
                            j += 2;
                            continue;
                        }
                        if (c == '"') { closed = true; break; }
                        v.append(c);
                        j++;
                    }
                    if (closed) { tail = buf.substring(j + 1); break; }
                    if (i >= lines.length) throw new IllegalArgumentException("line " + no + ": unterminated double quote");
                    v.append('\n');
                    buf = lines[i];
                    i++;
                    j = 0;
                }
                val = v.toString();
            } else {
                int cut = rest.length();
                for (int k = 1; k < rest.length(); k++) {
                    if (rest.charAt(k) == '#' && isSpace(rest.charAt(k - 1))) { cut = k - 1; break; }
                }
                val = strip(rest.substring(0, cut));
                tail = "";
            }
            String t = strip(tail);
            if (!t.isEmpty() && !t.startsWith("#")) throw new IllegalArgumentException("line " + no + ": unexpected text after closing quote");
            out.put(key, val);
            single.put(key, isSingle);
        }
        if (expand) {
            LinkedHashMap<String, String> done = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : out.entrySet()) {
                String v = e.getValue();
                if (!single.get(e.getKey())) {
                    Matcher m = REF.matcher(v);
                    StringBuilder sb = new StringBuilder();
                    while (m.find()) {
                        String name = m.group(1);
                        String dflt = m.group(3);
                        String got = done.containsKey(name) ? done.get(name) : vars.get(name);
                        String rep = got != null && !got.isEmpty() ? got : (dflt != null ? dflt : "");
                        m.appendReplacement(sb, Matcher.quoteReplacement(rep));
                    }
                    m.appendTail(sb);
                    v = sb.toString();
                }
                done.put(e.getKey(), v);
            }
            out = done;
        }
        out.replaceAll((k, v) -> v.replace("\0$", "$"));
        return out;
    }

    private static boolean isSpace(char c) {
        return c == ' ' || (c >= '\t' && c <= '\r') || (c >= '\u001c' && c <= '\u001f') || c == '\u0085' || c == ' '
            || c == ' ' || (c >= ' ' && c <= ' ') || c == ' ' || c == ' ' || c == ' '
            || c == ' ' || c == '　';
    }

    private static String lstrip(String s) {
        int a = 0;
        while (a < s.length() && isSpace(s.charAt(a))) a++;
        return s.substring(a);
    }

    private static String strip(String s) {
        int b = s.length();
        while (b > 0 && isSpace(s.charAt(b - 1))) b--;
        return lstrip(s.substring(0, b));
    }
}
