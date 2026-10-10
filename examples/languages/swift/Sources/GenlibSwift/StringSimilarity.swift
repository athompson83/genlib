// SPDX-License-Identifier: Apache-2.0
// String similarity over Unicode code points (not UTF-16 units, bytes or grapheme clusters): Levenshtein distance,
// optimal string alignment (Damerau OSA), Jaro, Jaro-Winkler (prefix scale 0.1, prefix of at most 4) and a 0-1 ratio.

public enum StringSimilarity {
    private static func points(_ s: String) -> [Unicode.Scalar] { Array(s.unicodeScalars) }

    /// Minimum number of insertions, deletions and substitutions.
    public static func levenshtein(_ a: String, _ b: String) -> Int {
        let x = points(a), y = points(b)
        if x.isEmpty || y.isEmpty { return max(x.count, y.count) }
        var prev = Array(0...y.count)
        for i in 1...x.count {
            var cur = [i]
            for j in 1...y.count {
                cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] == y[j - 1] ? 0 : 1)))
            }
            prev = cur
        }
        return prev[y.count]
    }

    /// Optimal string alignment distance: Levenshtein plus adjacent transposition at cost 1.
    public static func damerauOsa(_ a: String, _ b: String) -> Int {
        let x = points(a), y = points(b), n = x.count, m = y.count
        var d = Array(repeating: Array(repeating: 0, count: m + 1), count: n + 1)
        for i in 0...n { d[i][0] = i }
        for j in 0...m { d[0][j] = j }
        if n > 0 && m > 0 {
            for i in 1...n {
                for j in 1...m {
                    let cost = x[i - 1] == y[j - 1] ? 0 : 1
                    d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
                    if i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1] { d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1) }
                }
            }
        }
        return d[n][m]
    }

    /// Jaro similarity in [0, 1]; 1 for two empty strings, 0 when exactly one is empty.
    public static func jaro(_ a: String, _ b: String) -> Double {
        let x = points(a), y = points(b)
        if x.isEmpty && y.isEmpty { return 1 }
        if x.isEmpty || y.isEmpty { return 0 }
        let w = max(max(x.count, y.count) / 2 - 1, 0)
        var mx = Array(repeating: false, count: x.count), my = Array(repeating: false, count: y.count), m = 0
        for (i, c) in x.enumerated() {
            let lo = max(0, i - w), hi = min(y.count, i + w + 1)
            if lo >= hi { continue }
            for j in lo..<hi where !my[j] && y[j] == c { mx[i] = true; my[j] = true; m += 1; break }
        }
        if m == 0 { return 0 }
        var t = 0, k = 0
        for i in 0..<x.count where mx[i] {
            while !my[k] { k += 1 }
            if x[i] != y[k] { t += 1 }
            k += 1
        }
        let md = Double(m)
        return (md / Double(x.count) + md / Double(y.count) + (md - Double(t) / 2) / md) / 3
    }

    /// Jaro-Winkler similarity with prefix scale 0.1 and a common prefix of at most 4 code points.
    public static func jaroWinkler(_ a: String, _ b: String) -> Double {
        let j = jaro(a, b)
        var l = 0
        for (p, q) in zip(points(a), points(b)) {
            if p != q || l == 4 { break }
            l += 1
        }
        return j + Double(l) * 0.1 * (1 - j)
    }

    /// 1 - levenshtein / max(length); 1 for two empty strings.
    public static func similarityRatio(_ a: String, _ b: String) -> Double {
        let n = max(points(a).count, points(b).count)
        return n == 0 ? 1 : 1 - Double(levenshtein(a, b)) / Double(n)
    }
}
