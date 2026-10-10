// SPDX-License-Identifier: Apache-2.0
// Shared URL checks, XML/HTML escaping and query helpers for the marketing capabilities (no Foundation required).

/// True for an absolute http(s) URL with a host and no whitespace or control characters.
func isAbsoluteHTTPURL(_ value: String?, httpsOnly: Bool = false) -> Bool {
    guard let value, !value.isEmpty else { return false }
    if value.utf8.contains(where: { $0 <= 0x20 || $0 == 0x7f }) { return false }
    let lower = value.lowercased()
    let rest: Substring
    if lower.hasPrefix("https://") { rest = value.dropFirst(8) }
    else if !httpsOnly && lower.hasPrefix("http://") { rest = value.dropFirst(7) }
    else { return false }
    guard let first = rest.first else { return false }
    return !"/?#".contains(first)
}

func hasNewline(_ value: String) -> Bool { value.unicodeScalars.contains { $0 == "\n" || $0 == "\r" } }

func trimmed(_ value: String) -> String {
    var s = Substring(value)
    while let f = s.first, f.isWhitespace { s.removeFirst() }
    while let l = s.last, l.isWhitespace { s.removeLast() }
    return String(s)
}

/// Escapes `& < > " '` for XML text and attribute values.
func xmlEscape(_ value: String) -> String {
    var out = ""
    for ch in value.unicodeScalars {
        switch ch {
        case "&": out += "&amp;"
        case "<": out += "&lt;"
        case ">": out += "&gt;"
        case "\"": out += "&quot;"
        case "'": out += "&apos;"
        default: out.unicodeScalars.append(ch)
        }
    }
    return out
}

/// Escapes `& < > "` for HTML text and double-quoted attribute values.
func htmlEscape(_ value: String) -> String {
    var out = ""
    for ch in value.unicodeScalars {
        switch ch {
        case "&": out += "&amp;"
        case "<": out += "&lt;"
        case ">": out += "&gt;"
        case "\"": out += "&quot;"
        default: out.unicodeScalars.append(ch)
        }
    }
    return out
}

/// Splits a URL into the part before `?`, the raw query and the fragment (nil when absent).
func splitURL(_ url: String) -> (head: String, query: String?, fragment: String?) {
    var rest = Substring(url)
    var fragment: String?
    if let hash = rest.firstIndex(of: "#") { fragment = String(rest[rest.index(after: hash)...]); rest = rest[..<hash] }
    guard let q = rest.firstIndex(of: "?") else { return (String(rest), nil, fragment) }
    return (String(rest[..<q]), String(rest[rest.index(after: q)...]), fragment)
}

func querySegments(_ query: String?) -> [String] {
    (query ?? "").split(separator: "&", omittingEmptySubsequences: true).map(String.init)
}

func paramName(_ segment: String) -> String {
    segment.firstIndex(of: "=").map { String(segment[..<$0]) } ?? segment
}

func joinURL(_ head: String, _ segments: [String], _ fragment: String?) -> String {
    var out = head
    if !segments.isEmpty { out += "?" + segments.joined(separator: "&") }
    if let fragment { out += "#" + fragment }
    return out
}
