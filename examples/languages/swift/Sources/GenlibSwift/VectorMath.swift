// SPDX-License-Identifier: Apache-2.0
// Vector math for embeddings: dot, norm, cosine, normalize, brute-force top-k and maximal marginal relevance (MMR)
// re-ranking. Sums run plain left to right so results match the other language ports bit for bit.

public enum VectorMathError: Error, Equatable {
    case invalidArgument(String)
}

/// A vector index with its cosine score.
public struct ScoredIndex: Equatable, Sendable {
    public let index: Int
    public let score: Double
    public init(index: Int, score: Double) { self.index = index; self.score = score }
}

public enum VectorMath {
    private static func check(_ a: [Double], _ b: [Double]) throws {
        guard a.count == b.count else { throw VectorMathError.invalidArgument("vectors must have the same length") }
        guard !a.isEmpty else { throw VectorMathError.invalidArgument("vectors must not be empty") }
    }

    /// Sum of element-wise products; throws on length mismatch or empty vectors.
    public static func dot(_ a: [Double], _ b: [Double]) throws -> Double {
        try check(a, b)
        var s = 0.0
        for i in 0..<a.count { s += a[i] * b[i] }
        return s
    }

    /// Euclidean length; throws on an empty vector.
    public static func norm(_ a: [Double]) throws -> Double {
        guard !a.isEmpty else { throw VectorMathError.invalidArgument("vectors must not be empty") }
        var s = 0.0
        for x in a { s += x * x }
        return s.squareRoot()
    }

    /// Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros.
    public static func cosine(_ a: [Double], _ b: [Double]) throws -> Double {
        try check(a, b)
        let na = try norm(a), nb = try norm(b)
        if na == 0 || nb == 0 { return 0 }
        return max(-1.0, min(1.0, try dot(a, b) / (na * nb)))
    }

    /// Unit vector in the same direction; throws on a zero or empty vector.
    public static func normalize(_ a: [Double]) throws -> [Double] {
        let n = try norm(a)
        guard n != 0 else { throw VectorMathError.invalidArgument("cannot normalize a zero vector") }
        return a.map { $0 / n }
    }

    /// The k most cosine-similar vectors, best first; ties keep the lower index. Throws for k < 0.
    public static func topK(_ query: [Double], _ vectors: [[Double]], k: Int) throws -> [ScoredIndex] {
        guard k >= 0 else { throw VectorMathError.invalidArgument("k must be >= 0") }
        var scored: [ScoredIndex] = []
        for (i, v) in vectors.enumerated() { scored.append(ScoredIndex(index: i, score: try cosine(query, v))) }
        scored.sort { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
        return Array(scored.prefix(k))
    }

    /// Maximal marginal relevance: indices picked one by one maximizing
    /// lambda * cos(query, v) - (1 - lambda) * max cos(v, picked); ties keep the lower index.
    public static func mmr(_ query: [Double], _ vectors: [[Double]], k: Int, lambda: Double = 0.5) throws -> [Int] {
        guard k >= 0 else { throw VectorMathError.invalidArgument("k must be >= 0") }
        guard lambda >= 0 && lambda <= 1 else { throw VectorMathError.invalidArgument("lambda must be in [0, 1]") }
        let rel = try vectors.map { try cosine(query, $0) }
        var picked: [Int] = []
        while picked.count < min(k, vectors.count) {
            var best: Int? = nil, bestScore = 0.0
            for i in 0..<vectors.count where !picked.contains(i) {
                var red: Double? = nil
                for j in picked {
                    let c = try cosine(vectors[i], vectors[j])
                    if red == nil || c > red! { red = c }
                }
                let s = lambda * rel[i] - (1 - lambda) * (red ?? 0)
                if best == nil || s > bestScore { best = i; bestScore = s }
            }
            picked.append(best!)
        }
        return picked
    }
}
