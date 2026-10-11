// SPDX-License-Identifier: Apache-2.0
// GitHub-flavoured Markdown table rendering. Cells escape \ and | and turn CRLF/CR/LF into <br>; each column is as wide
// as its longest escaped cell in Unicode scalars (at least 3); alignment is "left", "right", "center" or nil (also
// accepted as "none") for no colon. Lines are "| a | b |", joined by "\n" with no trailing newline.

public enum MarkdownTableError: Error, Equatable {
    case invalidTable(String)
}

public enum MarkdownTable {
    private static func escape(_ cell: String) -> [Unicode.Scalar] {
        let s = Array(cell.unicodeScalars)
        var out: [Unicode.Scalar] = [], i = 0
        while i < s.count {
            switch s[i] {
            case "\\": out += ["\\", "\\"]
            case "|": out += ["\\", "|"]
            case "\r":
                out += Array("<br>".unicodeScalars)
                if i + 1 < s.count && s[i + 1] == "\n" { i += 1 }
            case "\n": out += Array("<br>".unicodeScalars)
            default: out.append(s[i])
            }
            i += 1
        }
        return out
    }

    /// Renders headers and rows as a Markdown table with optional per-column alignment.
    public static func render(headers: [String], rows: [[String]], align: [String?]? = nil) throws -> String {
        guard !headers.isEmpty else { throw MarkdownTableError.invalidTable("headers") }
        let n = headers.count
        let a = (align ?? Array(repeating: nil, count: n)).map { $0 == "none" ? nil : $0 }
        guard a.count == n, a.allSatisfy({ $0 == nil || $0 == "left" || $0 == "right" || $0 == "center" }) else {
            throw MarkdownTableError.invalidTable("align")
        }
        guard rows.allSatisfy({ $0.count == n }) else { throw MarkdownTableError.invalidTable("row width") }
        let cells = ([headers] + rows).map { $0.map(escape) }
        let widths = (0..<n).map { i in cells.reduce(3) { max($0, $1[i].count) } }
        func pad(_ s: [Unicode.Scalar], _ w: Int, _ al: String?) -> String {
            let gap = w - s.count
            var v = String.UnicodeScalarView()
            v.append(contentsOf: s)
            let body = String(v)
            switch al {
            case "right": return String(repeating: " ", count: gap) + body
            case "center": return String(repeating: " ", count: gap / 2) + body + String(repeating: " ", count: gap - gap / 2)
            default: return body + String(repeating: " ", count: gap)
            }
        }
        func sep(_ w: Int, _ al: String?) -> String {
            var d = Array(repeating: "-", count: w)
            if al == "left" || al == "center" { d[0] = ":" }
            if al == "right" || al == "center" { d[w - 1] = ":" }
            return d.joined()
        }
        func line(_ cs: [String]) -> String { "| " + cs.joined(separator: " | ") + " |" }
        func row(_ r: [[Unicode.Scalar]]) -> String { line((0..<n).map { pad(r[$0], widths[$0], a[$0]) }) }
        return ([row(cells[0]), line((0..<n).map { sep(widths[$0], a[$0]) })] + cells.dropFirst().map(row)).joined(separator: "\n")
    }
}
