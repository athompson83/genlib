// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>RFC 4180 CSV writing and parsing with OWASP formula-injection neutralization on write.</summary>
public static class CsvSafe {
    /// <summary>
    /// Writes rows as CSV with CRLF after every record. When <paramref name="neutralizeFormulas"/> is set, a field starting with
    /// '=', '+', '-', '@', TAB or CR gets a leading apostrophe. Fields containing ',', '"', CR or LF, or starting or ending with
    /// a space, are quoted with '"' doubled.
    /// </summary>
    public static string WriteCsv(IEnumerable<IEnumerable<string>> rows, bool neutralizeFormulas = true) {
        ArgumentNullException.ThrowIfNull(rows);
        var sb = new StringBuilder();
        foreach (var row in rows) {
            if (row is null) throw new ArgumentException("rows must not contain null rows", nameof(rows));
            bool first = true;
            foreach (var raw in row) {
                if (raw is null) throw new ArgumentException("fields must not be null", nameof(rows));
                if (!first) sb.Append(',');
                first = false;
                string field = raw;
                if (neutralizeFormulas && field.Length > 0 && field[0] is '=' or '+' or '-' or '@' or '\t' or '\r') field = "'" + field;
                bool quote = field.IndexOfAny(new[] { ',', '"', '\r', '\n' }) >= 0
                    || (field.Length > 0 && (field[0] == ' ' || field[^1] == ' '));
                if (quote) sb.Append('"').Append(field.Replace("\"", "\"\"")).Append('"');
                else sb.Append(field);
            }
            sb.Append("\r\n");
        }
        return sb.ToString();
    }

    /// <summary>
    /// Parses RFC 4180 CSV (CRLF or LF record ends, one leading BOM stripped). A final record end adds no empty row.
    /// Throws <see cref="FormatException"/> for an unterminated quoted field, a quote inside an unquoted field, or text after a closing quote.
    /// </summary>
    public static List<List<string>> ParseCsv(string text) {
        ArgumentNullException.ThrowIfNull(text);
        var rows = new List<List<string>>();
        int i = text.Length > 0 && text[0] == '﻿' ? 1 : 0;
        if (i >= text.Length) return rows;
        var row = new List<string>();
        var field = new StringBuilder();
        while (true) {
            // Start of a field.
            if (i < text.Length && text[i] == '"') {
                i++;
                while (true) {
                    if (i >= text.Length) throw new FormatException("unterminated quoted field");
                    char c = text[i++];
                    if (c != '"') { field.Append(c); continue; }
                    if (i < text.Length && text[i] == '"') { field.Append('"'); i++; continue; }
                    break;
                }
                if (i < text.Length && !(text[i] is ',' or '\n' || (text[i] == '\r' && i + 1 < text.Length && text[i + 1] == '\n')))
                    throw new FormatException($"unexpected character after closing quote at offset {i}");
            } else {
                while (i < text.Length && text[i] != ',' && text[i] != '\n' && !(text[i] == '\r' && i + 1 < text.Length && text[i + 1] == '\n')) {
                    if (text[i] == '"') throw new FormatException($"quote inside unquoted field at offset {i}");
                    field.Append(text[i++]);
                }
            }
            row.Add(field.ToString());
            field.Clear();
            if (i >= text.Length) { rows.Add(row); return rows; }
            if (text[i] == ',') { i++; continue; }
            i += text[i] == '\r' ? 2 : 1;
            rows.Add(row);
            row = new List<string>();
            if (i >= text.Length) return rows;
        }
    }
}
