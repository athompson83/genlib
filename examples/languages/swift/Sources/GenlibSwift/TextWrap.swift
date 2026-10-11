// SPDX-License-Identifier: Apache-2.0
// Plain-text wrapping and truncation counted in Unicode scalars (code points), not grapheme clusters. wrap keeps input
// line breaks (CRLF and CR become LF), splits words on runs of spaces/tabs, fills lines greedily and breaks words longer
// than the width. truncate shortens text to a maximum length including the ellipsis, preferring a word boundary in the
// second half.

public enum TextWrapError: Error, Equatable {
    case invalidWidth
    case invalidLength
}

public enum TextWrap {
    private typealias Scalars = [Unicode.Scalar]
    private static func text(_ s: Scalars) -> String { var v = String.UnicodeScalarView(); v.append(contentsOf: s); return String(v) }

    /// Greedily wraps text to lines of at most width code points.
    public static func wrap(_ input: String, width: Int) throws -> String {
        guard width >= 1 else { throw TextWrapError.invalidWidth }
        var normalized: Scalars = [], prevCR = false
        for c in input.unicodeScalars {
            if c == "\r" { normalized.append("\n"); prevCR = true; continue }
            if c == "\n" && prevCR { prevCR = false; continue }
            prevCR = false
            normalized.append(c)
        }
        var out: [String] = []
        for line in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            var cur: Scalars = []
            for word in line.split(whereSeparator: { $0 == " " || $0 == "\t" }) {
                var w = Scalars(word)
                while w.count > width {
                    if !cur.isEmpty { out.append(text(cur)); cur = [] }
                    out.append(text(Scalars(w[..<width])))
                    w = Scalars(w[width...])
                }
                if w.isEmpty { continue }
                if cur.isEmpty {
                    cur = w
                } else if cur.count + 1 + w.count <= width {
                    cur += [" "] + w
                } else {
                    out.append(text(cur))
                    cur = w
                }
            }
            out.append(text(cur))
        }
        return out.joined(separator: "\n")
    }

    /// Shortens text to at most maxLen code points, ending with the ellipsis when cut.
    public static func truncate(_ input: String, maxLen: Int, ellipsis: String = "…") throws -> String {
        let cps = Scalars(input.unicodeScalars)
        if cps.count <= maxLen { return input }
        let keep = maxLen - ellipsis.unicodeScalars.count
        guard maxLen >= 1, keep >= 0 else { throw TextWrapError.invalidLength }
        var cut = Scalars(cps[..<keep])
        if let sp = cut.lastIndex(of: " "), sp >= keep / 2, sp > 0 { cut = Scalars(cut[..<sp]) }
        while cut.last == " " { cut.removeLast() }
        return text(cut) + ellipsis
    }
}
