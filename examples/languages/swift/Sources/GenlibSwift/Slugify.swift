// SPDX-License-Identifier: Apache-2.0
// URL slugs: lowercase ASCII words joined by a separator. Letters U+00C0..U+017F transliterate through a fixed table
// (no Unicode database, so every Genlib language gives identical results); other non-ASCII characters end a word.
// Apostrophes (U+0027, U+2019) and combining marks (U+0300..U+036F) are dropped without breaking the word.
// Iterates Unicode scalars, so the result never depends on Swift's grapheme or canonical-equivalence rules.

public enum SlugifyError: Error, Equatable {
    case invalidArgument(String)
}

public enum Slugify {
    /// Transliterations for U+00C0..U+017F, comma-separated in code point order (empty = no mapping).
    private static let table: [String] = "A,A,A,A,A,A,AE,C,E,E,E,E,I,I,I,I,D,N,O,O,O,O,O,,O,U,U,U,U,Y,TH,ss,a,a,a,a,a,a,ae,c,e,e,e,e,i,i,i,i,d,n,o,o,o,o,o,,o,u,u,u,u,y,th,y,A,a,A,a,A,a,C,c,C,c,C,c,C,c,D,d,D,d,E,e,E,e,E,e,E,e,E,e,G,g,G,g,G,g,G,g,H,h,H,h,I,i,I,i,I,i,I,i,I,i,IJ,ij,J,j,K,k,q,L,l,L,l,L,l,L,l,L,l,N,n,N,n,N,n,n,N,n,O,o,O,o,O,o,OE,oe,R,r,R,r,R,r,S,s,S,s,S,s,S,s,T,t,T,t,T,t,U,u,U,u,U,u,U,u,U,u,U,u,W,w,Y,y,Y,Z,z,Z,z,Z,z,s"
        .split(separator: ",", omittingEmptySubsequences: false).map(String.init)

    private static let separators: Set<String> = ["-", "_", "."]

    /// Slug of text. separator must be "-", "_" or "."; maxLength >= 0 (0 = no limit). A slug longer than maxLength is
    /// cut back to the last whole word that fits when possible, and never ends with a separator.
    public static func slugify(_ text: String, separator: String = "-", maxLength: Int = 0) throws -> String {
        guard separators.contains(separator), separator.unicodeScalars.count == 1 else {
            throw SlugifyError.invalidArgument("separator must be \"-\", \"_\" or \".\"")
        }
        guard maxLength >= 0 else { throw SlugifyError.invalidArgument("maxLength must be >= 0") }
        let sep = separator.utf8.first!
        var words: [[UInt8]] = [], cur: [UInt8] = []
        func feed(_ v: UInt32) {
            if v >= 0x41 && v <= 0x5A { cur.append(UInt8(v + 0x20)) }
            else if (v >= 0x61 && v <= 0x7A) || (v >= 0x30 && v <= 0x39) { cur.append(UInt8(v)) }
            else if v == 0x27 || v == 0x2019 || (v >= 0x300 && v <= 0x36F) { return }
            else if !cur.isEmpty { words.append(cur); cur = [] }
        }
        for scalar in text.unicodeScalars {
            let v = scalar.value
            if v >= 0xC0 && v <= 0x17F && !table[Int(v - 0xC0)].isEmpty {
                for ch in table[Int(v - 0xC0)].utf8 { feed(UInt32(ch)) }
            } else {
                feed(v)
            }
        }
        if !cur.isEmpty { words.append(cur) }
        var slug: [UInt8] = []
        for (i, w) in words.enumerated() {
            if i > 0 { slug.append(sep) }
            slug += w
        }
        if maxLength > 0 && slug.count > maxLength {
            var cut = Array(slug[..<maxLength])
            if slug[maxLength] != sep, let last = cut.lastIndex(of: sep) { cut = Array(cut[..<last]) }
            while cut.last == sep { cut.removeLast() }
            slug = cut
        }
        return String(decoding: slug, as: UTF8.self)
    }

    /// base if isTaken(base) is false, else base-2, base-3, ... (the first free one, joined with separator).
    public static func uniqueSlug(_ base: String, separator: String = "-", isTaken: (String) throws -> Bool) throws -> String {
        guard !base.isEmpty else { throw SlugifyError.invalidArgument("empty base") }
        if try !isTaken(base) { return base }
        var n = 2
        while try isTaken("\(base)\(separator)\(n)") { n += 1 }
        return "\(base)\(separator)\(n)"
    }

    /// base, or base-2, base-3, ...: the first not in taken (a set of existing slugs).
    public static func uniqueSlug(_ base: String, taken: Set<String>, separator: String = "-") throws -> String {
        try uniqueSlug(base, separator: separator, isTaken: { taken.contains($0) })
    }
}
