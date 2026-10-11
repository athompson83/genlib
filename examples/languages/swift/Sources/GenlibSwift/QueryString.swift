// SPDX-License-Identifier: Apache-2.0
// application/x-www-form-urlencoded per the WHATWG URL standard: ordered (name, value) pairs, "+" as space, byte-wise
// percent-decoding (invalid "%" stays literal) with U+FFFD for invalid UTF-8; stringify keeps A-Z a-z 0-9 * - . _ only.

public enum QueryString {
    private static func decode(_ s: [UInt32]) -> String {
        let spaced = fromCodePoints(s.map { $0 == 0x2B ? 0x20 : $0 })
        return String(decoding: percentDecodeBytes(spaced), as: UTF8.self)
    }

    /// Parses a query string (one leading "?" optional) into ordered pairs; empty pieces are skipped.
    public static func parse(_ query: String) -> [(name: String, value: String)] {
        var c = codePoints(query)
        if c.first == 0x3F { c.removeFirst() }
        var out: [(name: String, value: String)] = []
        for piece in c.split(separator: 0x26, omittingEmptySubsequences: true) {
            if let eq = piece.firstIndex(of: 0x3D) {
                out.append((name: decode(Array(piece[..<eq])), value: decode(Array(piece[(eq + 1)...]))))
            } else {
                out.append((name: decode(Array(piece)), value: ""))
            }
        }
        return out
    }

    private static func encode(_ s: String) -> String {
        var out = ""
        for b in s.utf8 {
            let safe = (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || (b >= 0x30 && b <= 0x39) || b == 0x2A || b == 0x2D || b == 0x2E || b == 0x5F
            if safe { out.unicodeScalars.append(Unicode.Scalar(b)) } else if b == 0x20 { out += "+" } else { out += pctByte(b) }
        }
        return out
    }

    /// Serializes pairs as name=value joined with "&" (space as "+", other bytes %XX uppercase).
    public static func stringify(_ pairs: [(name: String, value: String)]) -> String {
        pairs.map { encode($0.name) + "=" + encode($0.value) }.joined(separator: "&")
    }

    /// Every value for name, in order (names compared by Unicode scalars).
    public static func getAll(_ pairs: [(name: String, value: String)], _ name: String) -> [String] {
        let want = codePoints(name)
        return pairs.filter { codePoints($0.name) == want }.map(\.value)
    }
}
