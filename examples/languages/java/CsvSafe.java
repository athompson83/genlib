// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;

/** RFC 4180 CSV reading and writing with spreadsheet formula-injection neutralization. */
public final class CsvSafe {
    private CsvSafe() {}

    /** Writes rows with CRLF record ends, neutralizing formula-leading fields. */
    public static String writeCsv(List<List<String>> rows) { return writeCsv(rows, true); }

    /** Writes rows with CRLF record ends (including the last); neutralizeFormulas prefixes = + - @ TAB CR with '. */
    public static String writeCsv(List<List<String>> rows, boolean neutralizeFormulas) {
        if (rows == null) throw new IllegalArgumentException("rows is required");
        StringBuilder out = new StringBuilder();
        for (List<String> row : rows) {
            if (row == null) throw new IllegalArgumentException("row must not be null");
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) out.append(',');
                out.append(field(row.get(i), neutralizeFormulas));
            }
            out.append("\r\n");
        }
        return out.toString();
    }

    private static String field(String value, boolean neutralize) {
        if (value == null) throw new IllegalArgumentException("field must not be null");
        String v = value;
        if (neutralize && !v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) v = "'" + v;
        boolean quote = v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\r') >= 0 || v.indexOf('\n') >= 0
            || v.startsWith(" ") || v.endsWith(" ");
        return quote ? "\"" + v.replace("\"", "\"\"") + "\"" : v;
    }

    /** Parses CSV with CRLF or LF record ends; strips one leading BOM. Malformed quoting throws. */
    public static List<List<String>> parseCsv(String text) {
        if (text == null) throw new IllegalArgumentException("text is required");
        List<List<String>> rows = new ArrayList<>();
        int n = text.length();
        int i = !text.isEmpty() && text.charAt(0) == '﻿' ? 1 : 0;
        List<String> row = new ArrayList<>();
        while (i < n) {
            StringBuilder f = new StringBuilder();
            if (text.charAt(i) == '"') {
                i++;
                while (true) {
                    if (i >= n) throw new IllegalArgumentException("unterminated quoted field");
                    char c = text.charAt(i);
                    if (c == '"') {
                        if (i + 1 < n && text.charAt(i + 1) == '"') { f.append('"'); i += 2; }
                        else { i++; break; }
                    } else { f.append(c); i++; }
                }
                if (i < n && text.charAt(i) != ',' && text.charAt(i) != '\n' && !text.startsWith("\r\n", i))
                    throw new IllegalArgumentException("unexpected character after closing quote at offset " + i);
            } else {
                while (i < n && text.charAt(i) != ',' && text.charAt(i) != '\n' && !text.startsWith("\r\n", i)) {
                    if (text.charAt(i) == '"') throw new IllegalArgumentException("quote inside unquoted field at offset " + i);
                    f.append(text.charAt(i++));
                }
            }
            row.add(f.toString());
            if (i >= n) break;
            if (text.charAt(i) == ',') {
                i++;
                if (i >= n) row.add("");
                continue;
            }
            i += text.charAt(i) == '\r' ? 2 : 1;
            rows.add(row);
            row = new ArrayList<>();
        }
        if (!row.isEmpty()) rows.add(row);
        return rows;
    }
}
