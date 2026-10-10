// SPDX-License-Identifier: Apache-2.0
// RFC 4180 CSV writing and parsing with spreadsheet formula-injection neutralization (OWASP CSV injection guidance).
// Works on UTF-8 bytes because Swift treats "\r\n" as one Character.

public enum CsvError: Error, Equatable {
    case invalidInput(String)
}

public enum CsvSafe {
    private static let comma: UInt8 = 0x2C, quote: UInt8 = 0x22, cr: UInt8 = 0x0D, lf: UInt8 = 0x0A
    private static let formulaStarts: Set<UInt8> = [0x3D, 0x2B, 0x2D, 0x40, 0x09, 0x0D] // = + - @ TAB CR

    /// Writes rows as CSV; every record (including the last) ends with CRLF. With `neutralizeFormulas`,
    /// fields starting with `=`, `+`, `-`, `@`, TAB or CR get a leading `'` so spreadsheets do not evaluate them.
    public static func writeCsv(_ rows: [[String]], neutralizeFormulas: Bool = true) -> String {
        var out: [UInt8] = []
        for row in rows {
            for (i, value) in row.enumerated() {
                if i > 0 { out.append(comma) }
                var field = Array(value.utf8)
                if neutralizeFormulas, let first = field.first, formulaStarts.contains(first) { field.insert(0x27, at: 0) }
                let needsQuotes = field.contains { $0 == comma || $0 == quote || $0 == cr || $0 == lf }
                    || field.first == 0x20 || field.last == 0x20
                if needsQuotes {
                    out.append(quote)
                    for b in field { out.append(b); if b == quote { out.append(quote) } }
                    out.append(quote)
                } else {
                    out += field
                }
            }
            out += [cr, lf]
        }
        return String(decoding: out, as: UTF8.self)
    }

    /// Parses CSV text (CRLF or LF record ends, optional leading BOM). Fields are returned exactly as stored;
    /// neutralization is never added or removed.
    public static func parseCsv(_ text: String) throws -> [[String]] {
        var bytes = Array(text.utf8)
        if bytes.starts(with: [0xEF, 0xBB, 0xBF]) { bytes.removeFirst(3) }
        let n = bytes.count
        func isCRLF(_ i: Int) -> Bool { bytes[i] == cr && i + 1 < n && bytes[i + 1] == lf }
        var rows: [[String]] = []
        if n == 0 { return rows }
        var row: [String] = []
        var i = 0
        while true {
            var field: [UInt8] = []
            if i < n && bytes[i] == quote {
                i += 1
                while true {
                    guard i < n else { throw CsvError.invalidInput("unterminated quoted field") }
                    if bytes[i] == quote {
                        if i + 1 < n && bytes[i + 1] == quote { field.append(quote); i += 2 } else { i += 1; break }
                    } else {
                        field.append(bytes[i]); i += 1
                    }
                }
                if i < n && bytes[i] != comma && bytes[i] != lf && !isCRLF(i) {
                    throw CsvError.invalidInput("unexpected character after closing quote at byte \(i)")
                }
            } else {
                while i < n && bytes[i] != comma && bytes[i] != lf && !isCRLF(i) {
                    if bytes[i] == quote { throw CsvError.invalidInput("quote inside unquoted field at byte \(i)") }
                    field.append(bytes[i]); i += 1
                }
            }
            row.append(String(decoding: field, as: UTF8.self))
            if i >= n { rows.append(row); break }
            if bytes[i] == comma { i += 1; continue }
            i += bytes[i] == cr ? 2 : 1
            rows.append(row)
            row = []
            if i >= n { break }
        }
        return rows
    }
}
