// SPDX-License-Identifier: Apache-2.0
// POSIX shell quoting and splitting without any expansion. quote leaves [A-Za-z0-9@%+=:,./_-]+ unchanged and otherwise
// wraps in single quotes (each ' becomes '\''). split splits on unquoted space, tab or newline; single quotes are
// literal; inside double quotes a backslash escapes only $, backtick, ", \ and newline; outside quotes a backslash
// escapes the next character; backslash-newline is removed; # starts a comment only at the start of a word; $, * and ~
// stay literal. Works on Unicode scalars (so "\r\n" is two characters, as in the shell).

public enum ShellQuoteError: Error, Equatable {
    case unterminatedSingleQuote
    case unterminatedDoubleQuote
    case trailingBackslash
}

public enum ShellQuote {
    private static func isSafe(_ c: Unicode.Scalar) -> Bool {
        switch c {
        case "A"..."Z", "a"..."z", "0"..."9", "@", "%", "+", "=", ":", ",", ".", "/", "_", "-": return true
        default: return false
        }
    }

    /// Quotes an argument for a POSIX shell ('' for the empty string).
    public static func quote(_ arg: String) -> String {
        if arg.isEmpty { return "''" }
        if arg.unicodeScalars.allSatisfy(isSafe) { return arg }
        var out = String.UnicodeScalarView()
        out.append("'")
        for c in arg.unicodeScalars {
            if c == "'" { out.append(contentsOf: "'\\''".unicodeScalars) } else { out.append(c) }
        }
        out.append("'")
        return String(out)
    }

    /// Quotes each argument and joins them with single spaces.
    public static func join(_ args: [String]) -> String { args.map(quote).joined(separator: " ") }

    /// Splits a command line into words the way a POSIX shell would, without expansion.
    public static func split(_ line: String) throws -> [String] {
        let s = Array(line.unicodeScalars), n = s.count
        var words: [String] = [], cur: String.UnicodeScalarView? = nil, i = 0
        while i < n {
            let c = s[i]
            if c == " " || c == "\t" || c == "\n" {
                if let w = cur { words.append(String(w)); cur = nil }
                i += 1
                continue
            }
            if c == "#" && cur == nil {
                i = s[i...].firstIndex(of: "\n") ?? n
                continue
            }
            var w = cur ?? String.UnicodeScalarView()
            if c == "'" {
                guard let j = s[(i + 1)...].firstIndex(of: "'") else { throw ShellQuoteError.unterminatedSingleQuote }
                w.append(contentsOf: s[(i + 1)..<j])
                i = j + 1
                cur = w
            } else if c == "\"" {
                i += 1
                while true {
                    guard i < n else { throw ShellQuoteError.unterminatedDoubleQuote }
                    let d = s[i]
                    if d == "\"" { i += 1; break }
                    if d == "\\" && i + 1 < n && "$`\"\\\n".unicodeScalars.contains(s[i + 1]) {
                        if s[i + 1] != "\n" { w.append(s[i + 1]) }
                        i += 2
                        continue
                    }
                    w.append(d)
                    i += 1
                }
                cur = w
            } else if c == "\\" {
                guard i + 1 < n else { throw ShellQuoteError.trailingBackslash }
                if s[i + 1] != "\n" {
                    w.append(s[i + 1])
                    cur = w
                } else {
                    cur = w.isEmpty ? nil : w
                }
                i += 2
            } else {
                w.append(c)
                cur = w
                i += 1
            }
        }
        if let w = cur { words.append(String(w)) }
        return words
    }
}
