// SPDX-License-Identifier: Apache-2.0
// RFC 5545 iCalendar (VCALENDAR/VEVENT) writer with TEXT escaping and UTF-8-safe 75-octet line folding.

public enum IcsError: Error, Equatable {
    case invalidArgument(String)
}

/// One event. Times are UTC `YYYY-MM-DDTHH:MM:SSZ` or dates `YYYY-MM-DD`.
public struct IcsEvent: Equatable, Sendable {
    public var uid: String, dtstamp: String, start: String, end: String, summary: String
    public var description: String?, location: String?, url: String?
    public init(uid: String, dtstamp: String, start: String, end: String, summary: String,
                description: String? = nil, location: String? = nil, url: String? = nil) {
        self.uid = uid; self.dtstamp = dtstamp; self.start = start; self.end = end; self.summary = summary
        self.description = description; self.location = location; self.url = url
    }
}

public enum IcsEvents {
    private enum Kind { case utc, date }

    private static func number(_ b: [UInt8], _ from: Int, _ to: Int) -> Int? {
        var n = 0
        for i in from..<to {
            guard b[i] >= 0x30 && b[i] <= 0x39 else { return nil }
            n = n * 10 + Int(b[i] - 0x30)
        }
        return n
    }

    private static func validDate(_ b: [UInt8]) -> Bool {
        b.count >= 10 && b[4] == 0x2D && b[7] == 0x2D && number(b, 0, 4) != nil
            && (1...12).contains(number(b, 5, 7) ?? 0) && (1...31).contains(number(b, 8, 10) ?? 0)
    }

    /// Returns the value kind and its compact iCalendar form.
    private static func parseTime(_ s: String, _ field: String) throws -> (Kind, String) {
        let b = Array(s.utf8)
        if b.count == 10 && validDate(b) { return (.date, String(decoding: b.filter { $0 != 0x2D }, as: UTF8.self)) }
        if b.count == 20 && validDate(b) && b[10] == 0x54 && b[13] == 0x3A && b[16] == 0x3A && b[19] == 0x5A
            && (0...23).contains(number(b, 11, 13) ?? -1) && (0...59).contains(number(b, 14, 16) ?? -1)
            && (0...59).contains(number(b, 17, 19) ?? -1) {
            return (.utc, String(decoding: b.filter { $0 != 0x2D && $0 != 0x3A }, as: UTF8.self))
        }
        throw IcsError.invalidArgument("\(field) must be YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DD: \(s)")
    }

    /// RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks (CRLF, LF or CR become `\n`).
    public static func escapeText(_ value: String) -> String {
        var out = String.UnicodeScalarView()
        var previousCR = false
        for s in value.unicodeScalars {
            defer { previousCR = s == "\r" }
            switch s {
            case "\\": out.append(contentsOf: "\\\\".unicodeScalars)
            case ";": out.append(contentsOf: "\\;".unicodeScalars)
            case ",": out.append(contentsOf: "\\,".unicodeScalars)
            case "\r": out.append(contentsOf: "\\n".unicodeScalars)
            case "\n": if !previousCR { out.append(contentsOf: "\\n".unicodeScalars) }
            default: out.append(s)
            }
        }
        return String(out)
    }

    /// Appends `line` folded at 75 octets (74 after the leading space), never splitting a UTF-8 sequence.
    private static func appendFolded(_ out: inout [UInt8], _ line: String) {
        var used = 0, limit = 75
        for s in line.unicodeScalars {
            let bytes = Array(String(s).utf8)
            if used + bytes.count > limit { out += [0x0D, 0x0A, 0x20]; used = 0; limit = 74 }
            out += bytes
            used += bytes.count
        }
        out += [0x0D, 0x0A]
    }

    private static func checkText(_ value: String, _ field: String) throws {
        if value.unicodeScalars.contains(where: { ($0.value < 0x20 && !"\r\n\t".unicodeScalars.contains($0)) || $0.value == 0x7F }) {
            throw IcsError.invalidArgument("\(field) contains a control character")
        }
    }

    /// Builds a VCALENDAR document with CRLF line ends.
    public static func icsCalendar(_ events: [IcsEvent], prodId: String) throws -> String {
        guard !prodId.isEmpty else { throw IcsError.invalidArgument("prodId must not be empty") }
        try checkText(prodId, "prodId")
        var out: [UInt8] = []
        for line in ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:\(escapeText(prodId))", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"] {
            appendFolded(&out, line)
        }
        for (i, e) in events.enumerated() {
            guard !e.uid.isEmpty else { throw IcsError.invalidArgument("event \(i): uid must not be empty") }
            guard !e.summary.isEmpty else { throw IcsError.invalidArgument("event \(i): summary must not be empty") }
            for (name, value) in [("uid", e.uid), ("summary", e.summary), ("description", e.description), ("location", e.location)] {
                if let value { try checkText(value, name) }
            }
            let (stampKind, stamp) = try parseTime(e.dtstamp, "dtstamp")
            guard stampKind == .utc else { throw IcsError.invalidArgument("event \(i): dtstamp must be a UTC date-time") }
            let (startKind, start) = try parseTime(e.start, "start")
            let (endKind, end) = try parseTime(e.end, "end")
            guard startKind == endKind else {
                throw IcsError.invalidArgument("event \(i): start and end must both be dates or both be UTC date-times")
            }
            guard end > start else { throw IcsError.invalidArgument("event \(i): end must be after start") }
            if let url = e.url, !isAbsoluteHTTPURL(url) {
                throw IcsError.invalidArgument("event \(i): url must be an absolute http(s) URL")
            }
            let param = startKind == .date ? ";VALUE=DATE" : ""
            var lines = ["BEGIN:VEVENT", "UID:\(escapeText(e.uid))", "DTSTAMP:\(stamp)", "DTSTART\(param):\(start)",
                         "DTEND\(param):\(end)", "SUMMARY:\(escapeText(e.summary))"]
            if let d = e.description { lines.append("DESCRIPTION:\(escapeText(d))") }
            if let l = e.location { lines.append("LOCATION:\(escapeText(l))") }
            if let u = e.url { lines.append("URL:\(u)") }
            lines.append("END:VEVENT")
            for line in lines { appendFolded(&out, line) }
        }
        appendFolded(&out, "END:VCALENDAR")
        return String(decoding: out, as: UTF8.self)
    }
}
