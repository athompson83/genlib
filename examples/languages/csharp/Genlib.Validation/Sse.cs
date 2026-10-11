// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;

namespace Genlib.Validation;

/// <summary>One dispatched server-sent event: type (default "message"), data lines joined with "\n" and the last event id.</summary>
public sealed record SseEvent(string Event, string Data, string Id);

/// <summary>
/// Incremental WHATWG HTML event-stream parser. Text may arrive in arbitrary chunks (also splitting a CRLF); the last event id
/// persists across events and <see cref="Retry"/> holds the latest valid retry value in milliseconds.
/// </summary>
public sealed class SseParser {
    private readonly StringBuilder _buf = new();
    private readonly List<string> _data = new();
    private string _event = "";
    private string _lastId = "";
    private bool _pendingCr;
    private bool _first = true;

    /// <summary>Latest valid retry (reconnection delay) in milliseconds, null until one arrives.</summary>
    public long? Retry { get; private set; }

    /// <summary>Feeds a chunk of stream text and returns the events completed by it.</summary>
    public IReadOnlyList<SseEvent> Feed(string text) {
        ArgumentNullException.ThrowIfNull(text);
        var output = new List<SseEvent>();
        if (_first && text.Length > 0) {
            if (text[0] == '﻿') text = text[1..];
            _first = false;
        }
        foreach (char ch in text) {
            if (_pendingCr) {
                _pendingCr = false;
                if (ch == '\n') continue;
            }
            if (ch == '\r') { _pendingCr = true; Line(_buf.ToString(), output); _buf.Clear(); }
            else if (ch == '\n') { Line(_buf.ToString(), output); _buf.Clear(); }
            else _buf.Append(ch);
        }
        return output;
    }

    private void Line(string line, List<SseEvent> output) {
        if (line.Length == 0) {
            if (_data.Count > 0) output.Add(new SseEvent(_event.Length == 0 ? "message" : _event, string.Join("\n", _data), _lastId));
            _data.Clear();
            _event = "";
            return;
        }
        if (line[0] == ':') return;
        int colon = line.IndexOf(':');
        string field = colon < 0 ? line : line[..colon];
        string value = colon < 0 ? "" : line[(colon + 1)..];
        if (colon >= 0 && value.StartsWith(' ')) value = value[1..];
        switch (field) {
            case "data": _data.Add(value); break;
            case "event": _event = value; break;
            case "id": if (!value.Contains('\0')) _lastId = value; break;
            case "retry":
                if (value.Length > 0 && value.All(c => c is >= '0' and <= '9')
                    && long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out long ms)) Retry = ms;
                break;
        }
    }
}

/// <summary>Server-sent events helpers: one-shot parsing and formatting of events and keep-alive comments.</summary>
public static class Sse {
    /// <summary>All complete events in <paramref name="text"/>; an unterminated final event is dropped, as the spec requires.</summary>
    public static IReadOnlyList<SseEvent> Parse(string text) => new SseParser().Feed(text);

    /// <summary>
    /// One event as stream text ("event:", "id:", "retry:" when given, then one "data:" line per data line, then a blank line).
    /// Throws <see cref="ArgumentException"/> for line breaks in event or id, NUL in id or a negative retry.
    /// </summary>
    public static string Format(string data, string? eventType = null, string? id = null, long? retry = null) {
        ArgumentNullException.ThrowIfNull(data);
        if (eventType is not null && (eventType.Contains('\r') || eventType.Contains('\n'))) throw new ArgumentException("event must not contain line breaks", nameof(eventType));
        if (id is not null && (id.Contains('\r') || id.Contains('\n'))) throw new ArgumentException("id must not contain line breaks", nameof(id));
        if (id is not null && id.Contains('\0')) throw new ArgumentException("id must not contain NUL", nameof(id));
        if (retry is < 0) throw new ArgumentOutOfRangeException(nameof(retry), "retry must not be negative");
        var sb = new StringBuilder();
        if (eventType is not null) sb.Append("event: ").Append(eventType).Append('\n');
        if (id is not null) sb.Append("id: ").Append(id).Append('\n');
        if (retry is long r) sb.Append("retry: ").Append(r.ToString(CultureInfo.InvariantCulture)).Append('\n');
        foreach (var line in data.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n')) sb.Append("data: ").Append(line).Append('\n');
        return sb.Append('\n').ToString();
    }

    /// <summary>A comment (keep-alive ping): ":\n\n" or ": text\n\n". Throws <see cref="ArgumentException"/> for line breaks.</summary>
    public static string FormatComment(string text = "") {
        ArgumentNullException.ThrowIfNull(text);
        if (text.Contains('\r') || text.Contains('\n')) throw new ArgumentException("comment must be one line", nameof(text));
        return ":" + (text.Length > 0 ? " " + text : "") + "\n\n";
    }
}
