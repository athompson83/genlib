// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// One calendar event. Start/End are both UTC "YYYY-MM-DDTHH:MM:SSZ" or both dates "YYYY-MM-DD"; Dtstamp is UTC.
/// Url, when present, must be an absolute http(s) URL.
/// </summary>
public sealed record IcsEvent(string Uid, string Dtstamp, string Start, string End, string Summary,
    string? Description = null, string? Location = null, string? Url = null);

/// <summary>RFC 5545 VCALENDAR writer with TEXT escaping and 75-octet line folding.</summary>
public static class IcsEvents {
    /// <summary>Builds a PUBLISH calendar; every line ends with CRLF.</summary>
    public static string IcsCalendar(IEnumerable<IcsEvent> events, string prodId) {
        ArgumentNullException.ThrowIfNull(events);
        if (string.IsNullOrEmpty(prodId)) throw new ArgumentException("prodId is required", nameof(prodId));
        var sb = new StringBuilder();
        void Line(string content) => Fold(sb, content);
        Line("BEGIN:VCALENDAR");
        Line("VERSION:2.0");
        Line("PRODID:" + EscapeText(prodId));
        Line("CALSCALE:GREGORIAN");
        Line("METHOD:PUBLISH");
        foreach (var e in events) {
            if (e is null) throw new ArgumentException("events must not contain null", nameof(events));
            if (string.IsNullOrEmpty(e.Uid)) throw new ArgumentException("uid is required", nameof(events));
            if (string.IsNullOrEmpty(e.Summary)) throw new ArgumentException("summary is required", nameof(events));
            if (Kind(e.Dtstamp) != 'T') throw new ArgumentException($"dtstamp must be UTC YYYY-MM-DDTHH:MM:SSZ: '{e.Dtstamp}'", nameof(events));
            char startKind = Kind(e.Start), endKind = Kind(e.End);
            if (startKind == '?' || endKind == '?') throw new ArgumentException("start and end must be UTC date-times or dates", nameof(events));
            if (startKind != endKind) throw new ArgumentException("start and end must be the same kind", nameof(events));
            if (string.CompareOrdinal(e.End, e.Start) <= 0) throw new ArgumentException("end must be after start", nameof(events));
            if (e.Url is not null && !WebText.IsAbsoluteHttpUrl(e.Url)) throw new ArgumentException($"url must be an absolute http(s) URL: '{e.Url}'", nameof(events));
            Line("BEGIN:VEVENT");
            Line("UID:" + EscapeText(e.Uid));
            Line("DTSTAMP:" + Compact(e.Dtstamp));
            Line((startKind == 'D' ? "DTSTART;VALUE=DATE:" : "DTSTART:") + Compact(e.Start));
            Line((endKind == 'D' ? "DTEND;VALUE=DATE:" : "DTEND:") + Compact(e.End));
            Line("SUMMARY:" + EscapeText(e.Summary));
            if (e.Description is not null) Line("DESCRIPTION:" + EscapeText(e.Description));
            if (e.Location is not null) Line("LOCATION:" + EscapeText(e.Location));
            if (e.Url is not null) Line("URL:" + e.Url);
            Line("END:VEVENT");
        }
        Line("END:VCALENDAR");
        return sb.ToString();
    }

    /// <summary>Escapes backslash, semicolon and comma; CRLF, LF (and a lone CR) become "\n".</summary>
    public static string EscapeText(string value) {
        var sb = new StringBuilder(value.Length);
        for (int i = 0; i < value.Length; i++) {
            char c = value[i];
            switch (c) {
                case '\\': sb.Append("\\\\"); break;
                case ';': sb.Append(@"\;"); break;
                case ',': sb.Append("\\,"); break;
                case '\r': if (i + 1 < value.Length && value[i + 1] == '\n') i++; sb.Append("\\n"); break;
                case '\n': sb.Append("\\n"); break;
                default: sb.Append(c); break;
            }
        }
        return sb.ToString();
    }

    // 'T' for a valid UTC date-time, 'D' for a valid date, '?' otherwise.
    private static char Kind(string? value) {
        if (value is null) return '?';
        if (value.Length == 20 && DateTime.TryParseExact(value, "yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return 'T';
        if (value.Length == 10 && DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return 'D';
        return '?';
    }

    private static string Compact(string value) => value.Replace("-", "").Replace(":", "");

    private static void Fold(StringBuilder sb, string line) {
        int limit = 75, used = 0;
        for (int i = 0; i < line.Length;) {
            int len = char.IsSurrogatePair(line, i) ? 2 : 1;
            int octets = Encoding.UTF8.GetByteCount(line.AsSpan(i, len));
            if (used + octets > limit) { sb.Append("\r\n "); used = 0; limit = 74; }
            sb.Append(line, i, len);
            used += octets;
            i += len;
        }
        sb.Append("\r\n");
    }
}
