// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// POSIX shell quoting and word splitting with no expansion ($, *, ~ stay literal). Quoting leaves [A-Za-z0-9@%+=:,./_-]+ alone
/// and otherwise single-quotes, writing ' as '\''. Splitting follows sh quoting rules for '...', "..." and backslashes; '#'
/// starts a comment only at the start of a word. An unterminated quote or trailing backslash throws <see cref="FormatException"/>.
/// </summary>
public static class ShellQuote {
    private static bool IsSafe(char c) => c is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9'
        or '@' or '%' or '+' or '=' or ':' or ',' or '.' or '/' or '_' or '-';

    /// <summary>Quotes one argument for a POSIX shell ('' for the empty string).</summary>
    public static string Quote(string arg) {
        ArgumentNullException.ThrowIfNull(arg);
        if (arg.Length == 0) return "''";
        if (arg.All(IsSafe)) return arg;
        return "'" + arg.Replace("'", "'\\''") + "'";
    }

    /// <summary>Quotes each argument and joins them with single spaces.</summary>
    public static string Join(IEnumerable<string> args) => string.Join(" ", args.Select(Quote));

    /// <summary>Splits a command line into words; throws FormatException for an unterminated quote or a trailing backslash.</summary>
    public static List<string> Split(string line) {
        ArgumentNullException.ThrowIfNull(line);
        var words = new List<string>();
        StringBuilder? cur = null;
        int i = 0, n = line.Length;
        while (i < n) {
            char c = line[i];
            if (c is ' ' or '\t' or '\n') {
                if (cur is not null) { words.Add(cur.ToString()); cur = null; }
                i++; continue;
            }
            if (c == '#' && cur is null) {
                int nl = line.IndexOf('\n', i);
                i = nl < 0 ? n : nl;
                continue;
            }
            cur ??= new StringBuilder();
            if (c == '\'') {
                int j = line.IndexOf('\'', i + 1);
                if (j < 0) throw new FormatException("unterminated single quote");
                cur.Append(line, i + 1, j - i - 1);
                i = j + 1;
            } else if (c == '"') {
                i++;
                while (true) {
                    if (i >= n) throw new FormatException("unterminated double quote");
                    char d = line[i];
                    if (d == '"') { i++; break; }
                    if (d == '\\' && i + 1 < n && line[i + 1] is '$' or '`' or '"' or '\\' or '\n') {
                        if (line[i + 1] != '\n') cur.Append(line[i + 1]);
                        i += 2; continue;
                    }
                    cur.Append(d); i++;
                }
            } else if (c == '\\') {
                if (i + 1 >= n) throw new FormatException("trailing backslash");
                if (line[i + 1] != '\n') cur.Append(line[i + 1]);
                else if (cur.Length == 0) cur = null;
                i += 2;
            } else {
                cur.Append(c); i++;
            }
        }
        if (cur is not null) words.Add(cur.ToString());
        return words;
    }
}
