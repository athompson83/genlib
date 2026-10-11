// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * POSIX shell quoting and splitting without any expansion ($, *, ~ stay literal). quote leaves safe words unchanged
 * and otherwise single-quotes, writing ' as '\''. split handles single quotes, double quotes (backslash escapes only
 * $ ` " \ and newline), backslash escapes and '#' comments at the start of a word. An unterminated quote or a
 * trailing backslash throws IllegalArgumentException.
 */
public final class ShellQuote {
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9@%+=:,./_-]+");

    private ShellQuote() {}

    /** Quotes one argument for a POSIX shell ('' for the empty string). */
    public static String shellQuote(String arg) {
        if (arg.isEmpty()) return "''";
        if (SAFE.matcher(arg).matches()) return arg;
        return "'" + arg.replace("'", "'\\''") + "'";
    }

    /** Quotes each argument and joins them with single spaces. */
    public static String shellJoin(List<String> args) {
        List<String> out = new ArrayList<>();
        for (String a : args) out.add(shellQuote(a));
        return String.join(" ", out);
    }

    /** Splits a command line into words like a POSIX shell, without expansion. */
    public static List<String> shellSplit(String line) {
        List<String> words = new ArrayList<>();
        StringBuilder cur = null;
        int i = 0;
        int n = line.length();
        while (i < n) {
            char c = line.charAt(i);
            if (c == ' ' || c == '\t' || c == '\n') {
                if (cur != null) { words.add(cur.toString()); cur = null; }
                i++;
                continue;
            }
            if (c == '#' && cur == null) {
                int j = line.indexOf('\n', i);
                i = j < 0 ? n : j;
                continue;
            }
            if (cur == null) cur = new StringBuilder();
            if (c == '\'') {
                int j = line.indexOf('\'', i + 1);
                if (j < 0) throw new IllegalArgumentException("unterminated single quote");
                cur.append(line, i + 1, j);
                i = j + 1;
            } else if (c == '"') {
                i++;
                while (true) {
                    if (i >= n) throw new IllegalArgumentException("unterminated double quote");
                    char d = line.charAt(i);
                    if (d == '"') { i++; break; }
                    if (d == '\\' && i + 1 < n && "$`\"\\\n".indexOf(line.charAt(i + 1)) >= 0) {
                        if (line.charAt(i + 1) != '\n') cur.append(line.charAt(i + 1));
                        i += 2;
                        continue;
                    }
                    cur.append(d);
                    i++;
                }
            } else if (c == '\\') {
                if (i + 1 >= n) throw new IllegalArgumentException("trailing backslash");
                if (line.charAt(i + 1) != '\n') cur.append(line.charAt(i + 1));
                else if (cur.length() == 0) cur = null;
                i += 2;
            } else {
                cur.append(c);
                i++;
            }
        }
        if (cur != null) words.add(cur.toString());
        return words;
    }
}
