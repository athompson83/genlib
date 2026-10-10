// SPDX-License-Identifier: Apache-2.0
// Text chunking for retrieval (RAG): split at the largest natural boundary that fits (paragraph, line, sentence, word,
// code point), pack greedily, optionally overlap whole pieces. Lengths count Unicode scalars (code points); whitespace
// means ASCII space, tab, LF, CR, FF and VT only.

public enum TextChunkingError: Error, Equatable {
    case invalidArgument(String)
}

public enum TextChunking {
    private typealias Points = [Unicode.Scalar]

    private static func isWs(_ c: Unicode.Scalar) -> Bool {
        c == " " || c == "\t" || c == "\n" || c == "\r" || c == "\u{0C}" || c == "\u{0B}"
    }

    private static func startsWith(_ t: Points, _ sep: Points, at j: Int) -> Bool {
        j + sep.count <= t.count && Array(t[j..<(j + sep.count)]) == sep
    }

    /// Pieces at one boundary level; each keeps its trailing separator so the pieces concatenate back to the text.
    private static func splitKeep(_ t: Points, _ level: Int) -> [Points] {
        if level == 0 || level == 1 || level == 3 {
            let sep: Points = level == 0 ? ["\n", "\n"] : level == 1 ? ["\n"] : [" "]
            var out: [Points] = [], start = 0, search = 0
            while true {
                var i = -1, k = search
                while k + sep.count <= t.count { if startsWith(t, sep, at: k) { i = k; break }; k += 1 }
                if i < 0 { break }
                var j = i + sep.count
                while startsWith(t, sep, at: j) { j += sep.count } // a run of separators stays with the piece before it
                out.append(Array(t[start..<j])); start = j; search = j
            }
            if start < t.count { out.append(Array(t[start...])) }
            return out
        }
        if level == 2 { // sentences: after . ! ? followed by whitespace (the whitespace stays with the sentence)
            var out: [Points] = [], start = 0, i = 0
            while i < t.count {
                if (t[i] == "." || t[i] == "!" || t[i] == "?") && i + 1 < t.count && isWs(t[i + 1]) {
                    var j = i + 1
                    while j < t.count && isWs(t[j]) { j += 1 }
                    out.append(Array(t[start..<j])); start = j; i = j; continue
                }
                i += 1
            }
            if start < t.count { out.append(Array(t[start...])) }
            return out
        }
        return t.map { [$0] }
    }

    private static func pieces(_ t: Points, _ maxChars: Int, _ level: Int = 0) -> [Points] {
        if t.count <= maxChars { return [t] }
        var out: [Points] = []
        for p in splitKeep(t, level) {
            if p.count <= maxChars { out.append(p) } else { out += pieces(p, maxChars, level + 1) }
        }
        return out
    }

    /// Chunks of at most maxChars code points, trimmed of ASCII whitespace, never empty; overlap > 0 starts each chunk
    /// with the last whole pieces of the previous one totalling at most overlap. Throws for maxChars < 1 or overlap
    /// outside 0..maxChars-1.
    public static func chunk(_ text: String, maxChars: Int, overlap: Int = 0) throws -> [String] {
        guard maxChars >= 1 else { throw TextChunkingError.invalidArgument("maxChars must be >= 1") }
        guard overlap >= 0 && overlap < maxChars else { throw TextChunkingError.invalidArgument("overlap must be in 0..maxChars-1") }
        let ps = pieces(Array(text.unicodeScalars), maxChars)
        var chunks: [String] = [], cur: [Points] = [], size = 0
        func emit() {
            let joined = cur.flatMap { $0 }
            var a = 0, b = joined.count
            while a < b && isWs(joined[a]) { a += 1 }
            while b > a && isWs(joined[b - 1]) { b -= 1 }
            if a < b { chunks.append(String(String.UnicodeScalarView(joined[a..<b]))) }
        }
        for p in ps {
            if !cur.isEmpty && size + p.count > maxChars {
                emit()
                var keep: [Points] = [], total = 0
                if overlap > 0 {
                    for q in cur.dropFirst().reversed() { // never repeat the whole previous chunk
                        if total + q.count > overlap { break }
                        keep.insert(q, at: 0); total += q.count
                    }
                }
                while !keep.isEmpty && total + p.count > maxChars { total -= keep.removeFirst().count }
                cur = keep; size = total
            }
            cur.append(p); size += p.count
        }
        if !cur.isEmpty { emit() }
        return chunks
    }
}
