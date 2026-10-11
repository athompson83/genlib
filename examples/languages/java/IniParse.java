// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * INI files (the common subset of git config, PHP and Python configparser). parseIni returns ordered sections of
 * ordered keys with section "" (keys before any header) always first. ';' and '#' start comment lines; a repeated
 * [section] continues the earlier one; a line splits at the first '=' or ':'; inline comments start at whitespace
 * followed by ';' or '#'; double-quoted values support \\ \" \n \t; a bare key has value ""; the last duplicate key
 * wins in its first position; CRLF is accepted. Errors throw IllegalArgumentException with a 1-based line number.
 */
public final class IniParse {
    private IniParse() {}

    private static boolean space(char c) { return Character.isWhitespace(c) || Character.isSpaceChar(c) || c == '\u0085'; }

    private static String strip(String s) {
        int a = 0;
        int b = s.length();
        while (a < b && space(s.charAt(a))) a++;
        while (b > a && space(s.charAt(b - 1))) b--;
        return s.substring(a, b);
    }

    private static String rstrip(String s) {
        int b = s.length();
        while (b > 0 && space(s.charAt(b - 1))) b--;
        return s.substring(0, b);
    }

    /** Parses INI text into section -> key -> value, preserving order; section "" is always present first. */
    public static LinkedHashMap<String, LinkedHashMap<String, String>> parseIni(String text) {
        LinkedHashMap<String, LinkedHashMap<String, String>> out = new LinkedHashMap<>();
        LinkedHashMap<String, String> cur = new LinkedHashMap<>();
        out.put("", cur);
        String[] lines = text.replace("\r\n", "\n").split("\n", -1);
        for (int no = 1; no <= lines.length; no++) {
            String s = strip(lines[no - 1]);
            if (s.isEmpty() || s.charAt(0) == ';' || s.charAt(0) == '#') continue;
            if (s.charAt(0) == '[') {
                if (!s.endsWith("]")) throw new IllegalArgumentException("line " + no + ": unterminated section header");
                String name = strip(s.substring(1, s.length() - 1));
                if (name.isEmpty() || name.contains("]")) throw new IllegalArgumentException("line " + no + ": bad section name");
                cur = out.computeIfAbsent(name, k -> new LinkedHashMap<>());
                continue;
            }
            int eq = s.indexOf('=');
            int colon = s.indexOf(':');
            int i = eq < 0 ? colon : colon < 0 ? eq : Math.min(eq, colon);
            String key;
            String val;
            if (i >= 0) { key = strip(s.substring(0, i)); val = strip(s.substring(i + 1)); }
            else { key = s; val = ""; }
            if (key.isEmpty()) throw new IllegalArgumentException("line " + no + ": empty key");
            if (val.startsWith("\"")) {
                StringBuilder buf = new StringBuilder();
                int j = 1;
                boolean closed = false;
                while (j < val.length()) {
                    char c = val.charAt(j);
                    if (c == '\\' && j + 1 < val.length()) {
                        char e = val.charAt(j + 1);
                        buf.append(e == 'n' ? '\n' : e == 't' ? '\t' : e);
                        j += 2;
                        continue;
                    }
                    if (c == '"') { closed = true; break; }
                    buf.append(c);
                    j++;
                }
                if (!closed) throw new IllegalArgumentException("line " + no + ": unterminated quote");
                val = buf.toString();
            } else {
                int cut = -1;
                for (String marker : new String[] {" ;", " #", "\t;", "\t#"}) {
                    int k = val.indexOf(marker);
                    if (k >= 0 && (cut < 0 || k < cut)) cut = k;
                }
                if (cut >= 0) val = rstrip(val.substring(0, cut));
            }
            cur.put(key, val);
        }
        return out;
    }

    private static String quote(String v) {
        boolean needs = v.isEmpty() || !v.equals(strip(v));
        for (int i = 0; i < v.length() && !needs; i++) needs = ";#\"\\\n\t".indexOf(v.charAt(i)) >= 0;
        if (!needs) return v;
        return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\t", "\\t") + "\"";
    }

    /** Writes section "" first (no header), then [name] blocks separated by blank lines, quoting values when needed. */
    public static String stringifyIni(Map<String, ? extends Map<String, String>> data) {
        List<String> blocks = new ArrayList<>();
        Map<String, String> top = data.get("");
        if (top != null && !top.isEmpty()) {
            List<String> lines = new ArrayList<>();
            for (Map.Entry<String, String> e : top.entrySet()) lines.add(e.getKey() + " = " + quote(e.getValue()));
            blocks.add(String.join("\n", lines));
        }
        for (Map.Entry<String, ? extends Map<String, String>> sec : data.entrySet()) {
            if (sec.getKey().isEmpty()) continue;
            List<String> lines = new ArrayList<>();
            lines.add("[" + sec.getKey() + "]");
            for (Map.Entry<String, String> e : sec.getValue().entrySet()) lines.add(e.getKey() + " = " + quote(e.getValue()));
            blocks.add(String.join("\n", lines));
        }
        return String.join("\n\n", blocks) + (blocks.isEmpty() ? "" : "\n");
    }
}
