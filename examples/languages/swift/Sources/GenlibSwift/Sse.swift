// SPDX-License-Identifier: Apache-2.0
// Server-sent events (WHATWG HTML "event stream" interpretation): an incremental parser that accepts arbitrary chunks
// (also a CRLF split across chunks) and a formatter for event and comment frames. Works on Unicode scalars, so a
// CRLF pair is two line-ending characters rather than one Swift Character.

public enum SseError: Error, Equatable {
    case invalidArgument(String)
}

/// One dispatched event: type (default "message"), data lines joined with "\n" and the last event id seen.
public struct SseEvent: Equatable, Sendable {
    public let event: String
    public let data: String
    public let id: String
    public init(event: String, data: String, id: String) { self.event = event; self.data = data; self.id = id }
}

/// Incremental event-stream parser; keep one per connection and feed it text as it arrives.
public struct SseParser: Sendable {
    private var buf = String.UnicodeScalarView()
    private var data: [String] = []
    private var event = ""
    private var pendingCr = false
    private var first = true
    /// The last event id seen; it persists across events (and is sent back as Last-Event-ID on reconnect).
    public private(set) var lastEventId = ""
    /// Latest valid retry value in milliseconds (nil until one arrives); a value too large for Int is ignored.
    public private(set) var retry: Int? = nil

    /// A parser with empty state.
    public init() {}

    /// Feeds one chunk of stream text and returns the events it completed (an unterminated event stays buffered).
    public mutating func feed(_ text: String) -> [SseEvent] {
        var out: [SseEvent] = []
        var scalars = Array(text.unicodeScalars)
        if first && !scalars.isEmpty {
            if scalars[0] == "\u{FEFF}" { scalars.removeFirst() }
            first = false
        }
        for ch in scalars {
            if pendingCr {
                pendingCr = false
                if ch == "\n" { continue }
            }
            if ch == "\r" {
                pendingCr = true; line(String(buf), &out); buf = String.UnicodeScalarView()
            } else if ch == "\n" {
                line(String(buf), &out); buf = String.UnicodeScalarView()
            } else {
                buf.append(ch)
            }
        }
        return out
    }

    private mutating func line(_ line: String, _ out: inout [SseEvent]) {
        let s = Array(line.unicodeScalars)
        if s.isEmpty {
            if !data.isEmpty {
                out.append(SseEvent(event: event.isEmpty ? "message" : event, data: data.joined(separator: "\n"), id: lastEventId))
            }
            data = []; event = ""
            return
        }
        if s[0] == ":" { return }
        var field = s[...], value = s[s.endIndex...]
        if let colon = s.firstIndex(of: ":") {
            field = s[..<colon]
            value = s[(colon + 1)...]
            if value.first == " " { value = value.dropFirst() }
        }
        let name = String(String.UnicodeScalarView(field)), v = String(String.UnicodeScalarView(value))
        switch name {
        case "data": data.append(v)
        case "event": event = v
        case "id": if !value.contains("\u{0}") { lastEventId = v }
        case "retry":
            if !value.isEmpty && value.allSatisfy({ $0.value >= 0x30 && $0.value <= 0x39 }), let n = Int(v) { retry = n }
        default: break
        }
    }
}

public enum Sse {
    /// All complete events in text (an unterminated final event is dropped, as the spec requires).
    public static func parse(_ text: String) -> [SseEvent] {
        var p = SseParser()
        return p.feed(text)
    }

    /// One event as stream text ("event:", "id:", "retry:", then one "data:" line per line of data, blank line last).
    public static func format(_ data: String, event: String? = nil, id: String? = nil, retry: Int? = nil) throws -> String {
        let breaks: (String) -> Bool = { $0.unicodeScalars.contains { $0 == "\r" || $0 == "\n" } }
        if let event, breaks(event) { throw SseError.invalidArgument("event must not contain line breaks") }
        if let id, breaks(id) { throw SseError.invalidArgument("id must not contain line breaks") }
        if let id, id.unicodeScalars.contains("\u{0}") { throw SseError.invalidArgument("id must not contain NUL") }
        if let retry, retry < 0 { throw SseError.invalidArgument("retry must be >= 0") }
        var out: [String] = []
        if let event { out.append("event: " + event) }
        if let id { out.append("id: " + id) }
        if let retry { out.append("retry: \(retry)") }
        var lineBuf = String.UnicodeScalarView()
        var lines: [String] = []
        let s = Array(data.unicodeScalars)
        var i = 0
        while i < s.count {
            if s[i] == "\r" || s[i] == "\n" {
                lines.append(String(lineBuf)); lineBuf = String.UnicodeScalarView()
                if s[i] == "\r" && i + 1 < s.count && s[i + 1] == "\n" { i += 1 }
            } else {
                lineBuf.append(s[i])
            }
            i += 1
        }
        lines.append(String(lineBuf))
        for l in lines { out.append("data: " + l) }
        return out.joined(separator: "\n") + "\n\n"
    }

    /// A comment frame (keep-alive ping): ":\n\n" or ": text\n\n"; never dispatches an event.
    public static func formatComment(_ text: String = "") throws -> String {
        if text.unicodeScalars.contains(where: { $0 == "\r" || $0 == "\n" }) { throw SseError.invalidArgument("comment must be one line") }
        return ":" + (text.isEmpty ? "" : " " + text) + "\n\n"
    }
}
