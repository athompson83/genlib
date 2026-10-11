// SPDX-License-Identifier: Apache-2.0
// INI files (the common subset of git config, PHP and configparser defaults). parse returns ordered sections of ordered
// key/value pairs; keys before any section go in section "" (always present and first). Lines are trimmed; blank lines
// and lines starting with ";" or "#" are skipped; [name] starts or continues a section; "key = value" or "key: value"
// splits at the first "=" or ":"; a bare "key" has value ""; a value wrapped in double quotes is unquoted with escapes
// \\ \" \n \t, otherwise an inline comment starts at whitespace + ";" or "#". Duplicate keys: the last value wins in
// the first position.

public enum IniParseError: Error, Equatable {
    /// 1-based line number and message.
    case invalidLine(Int, String)
}

public enum IniParse {
    /// Ordered sections, each with ordered (key, value) entries.
    public typealias Document = [(name: String, entries: [(key: String, value: String)])]

    // Python str.strip() whitespace.
    private static func isSpace(_ c: UInt32) -> Bool {
        switch c {
        case 9...13, 0x1C...0x20, 0x85, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000: return true
        default: return false
        }
    }

    private static func strip(_ s: ArraySlice<UInt32>) -> ArraySlice<UInt32> {
        var a = s.startIndex, b = s.endIndex
        while a < b && isSpace(s[a]) { a += 1 }
        while b > a && isSpace(s[b - 1]) { b -= 1 }
        return s[a..<b]
    }

    private static func text(_ cps: ArraySlice<UInt32>) -> String {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    private static func find(_ s: ArraySlice<UInt32>, _ pair: [UInt32]) -> Int? {
        var i = s.startIndex
        while i + pair.count <= s.endIndex {
            if Array(s[i..<(i + pair.count)]) == pair { return i }
            i += 1
        }
        return nil
    }

    private static func put(_ doc: inout Document, _ section: Int, _ key: String, _ value: String) {
        if let k = doc[section].entries.firstIndex(where: { $0.key.unicodeScalars.elementsEqual(key.unicodeScalars) }) {
            doc[section].entries[k].value = value
        } else {
            doc[section].entries.append((key, value))
        }
    }

    /// Parses INI text into ordered sections (section "" first) of ordered key/value pairs.
    public static func parse(_ text: String) throws -> Document {
        var doc: Document = [("", [])]
        var cur = 0
        var all = text.unicodeScalars.map(\.value), norm: [UInt32] = []
        norm.reserveCapacity(all.count)
        for (x, c) in all.enumerated() where !(c == 0x0D && x + 1 < all.count && all[x + 1] == 0x0A) { norm.append(c) }
        all = []
        for (offset, line) in norm.split(separator: 0x0A, omittingEmptySubsequences: false).enumerated() {
            let no = offset + 1
            let s = strip(line)
            guard let first = s.first, first != 0x3B, first != 0x23 else { continue }
            if first == 0x5B {
                guard s.last == 0x5D, s.count >= 2 else { throw IniParseError.invalidLine(no, "unterminated section header") }
                let name = strip(s.dropFirst().dropLast())
                guard !name.isEmpty, !name.contains(0x5D) else { throw IniParseError.invalidLine(no, "bad section name") }
                let n = self.text(name)
                if let i = doc.firstIndex(where: { $0.name.unicodeScalars.elementsEqual(n.unicodeScalars) }) {
                    cur = i
                } else {
                    doc.append((n, [])); cur = doc.count - 1
                }
                continue
            }
            var key: ArraySlice<UInt32>, val: ArraySlice<UInt32>
            if let i = s.firstIndex(where: { $0 == 0x3D || $0 == 0x3A }) {
                key = strip(s[s.startIndex..<i]); val = strip(s[(i + 1)...])
            } else {
                key = s; val = s[s.endIndex...]
            }
            if key.isEmpty { throw IniParseError.invalidLine(no, "empty key") }
            var value: [UInt32] = []
            if val.first == 0x22 {
                var j = val.startIndex + 1, closed = false
                while j < val.endIndex {
                    let c = val[j]
                    if c == 0x5C && j + 1 < val.endIndex {
                        let e = val[j + 1]
                        value.append(e == 0x6E ? 0x0A : (e == 0x74 ? 0x09 : e)); j += 2; continue
                    }
                    if c == 0x22 { closed = true; break }
                    value.append(c); j += 1
                }
                if !closed { throw IniParseError.invalidLine(no, "unterminated quote") }
            } else {
                let cuts = [[0x20, 0x3B], [0x20, 0x23], [0x09, 0x3B], [0x09, 0x23]].compactMap { find(val, $0) }
                if let cut = cuts.min() {
                    var v = val[val.startIndex..<cut]
                    while let l = v.last, isSpace(l) { v = v.dropLast() }
                    val = v
                }
                value = Array(val)
            }
            put(&doc, cur, self.text(key), self.text(value[...]))
        }
        return doc
    }

    private static func quote(_ v: String) -> String {
        let cps = v.unicodeScalars.map(\.value)
        let needs = cps.isEmpty || strip(cps[...]).count != cps.count || cps.contains { [0x3B, 0x23, 0x22, 0x5C, 0x0A, 0x09].contains($0) }
        guard needs else { return v }
        var out = "\""
        for ch in v.unicodeScalars {
            switch ch {
            case "\\": out += "\\\\"
            case "\"": out += "\\\""
            case "\n": out += "\\n"
            case "\t": out += "\\t"
            default: out.unicodeScalars.append(ch)
            }
        }
        return out + "\""
    }

    /// Writes sections as INI text: section "" first without a header, then [name] blocks separated by a blank line.
    public static func stringify(_ data: Document) -> String {
        var blocks: [String] = []
        if let top = data.first(where: { $0.name.isEmpty }), !top.entries.isEmpty {
            blocks.append(top.entries.map { "\($0.key) = \(quote($0.value))" }.joined(separator: "\n"))
        }
        for s in data where !s.name.isEmpty {
            blocks.append((["[\(s.name)]"] + s.entries.map { "\($0.key) = \(quote($0.value))" }).joined(separator: "\n"))
        }
        return blocks.joined(separator: "\n\n") + (blocks.isEmpty ? "" : "\n")
    }
}
