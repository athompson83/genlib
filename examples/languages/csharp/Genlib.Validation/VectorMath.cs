// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Vector math for embeddings: dot product, norm, cosine similarity, normalization, brute-force top-k and maximal marginal
/// relevance (MMR) re-ranking. Sums run plain left to right. Throws <see cref="ArgumentException"/> for length mismatches or
/// empty vectors.
/// </summary>
public static class VectorMath {
    private static void CheckPair(IReadOnlyList<double> a, IReadOnlyList<double> b) {
        ArgumentNullException.ThrowIfNull(a);
        ArgumentNullException.ThrowIfNull(b);
        if (a.Count != b.Count) throw new ArgumentException("vectors must have the same length");
        if (a.Count == 0) throw new ArgumentException("vectors must not be empty");
    }

    private static void CheckK(int k) {
        if (k < 0) throw new ArgumentOutOfRangeException(nameof(k), "k must be >= 0");
    }

    /// <summary>Dot product of two equal-length, non-empty vectors.</summary>
    public static double Dot(IReadOnlyList<double> a, IReadOnlyList<double> b) {
        CheckPair(a, b);
        double sum = 0;
        for (int i = 0; i < a.Count; i++) sum += a[i] * b[i];
        return sum;
    }

    /// <summary>Euclidean length of a non-empty vector.</summary>
    public static double Norm(IReadOnlyList<double> a) {
        ArgumentNullException.ThrowIfNull(a);
        if (a.Count == 0) throw new ArgumentException("vectors must not be empty");
        double sum = 0;
        foreach (var x in a) sum += x * x;
        return Math.Sqrt(sum);
    }

    /// <summary>Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros.</summary>
    public static double Cosine(IReadOnlyList<double> a, IReadOnlyList<double> b) {
        CheckPair(a, b);
        double na = Norm(a), nb = Norm(b);
        if (na == 0 || nb == 0) return 0.0;
        return Math.Max(-1.0, Math.Min(1.0, Dot(a, b) / (na * nb)));
    }

    /// <summary>The vector scaled to length 1; throws <see cref="ArgumentException"/> for a zero vector.</summary>
    public static double[] Normalize(IReadOnlyList<double> a) {
        double n = Norm(a);
        if (n == 0) throw new ArgumentException("cannot normalize a zero vector");
        return a.Select(x => x / n).ToArray();
    }

    /// <summary>(index, score) of the k most cosine-similar vectors, best first; ties keep the lower index.</summary>
    public static IReadOnlyList<(int Index, double Score)> TopK(IReadOnlyList<double> query, IReadOnlyList<IReadOnlyList<double>> vectors, int k) {
        ArgumentNullException.ThrowIfNull(vectors);
        CheckK(k);
        var scored = vectors.Select((v, i) => (Index: i, Score: Cosine(query, v))).ToList();
        scored.Sort((x, y) => x.Score != y.Score ? y.Score.CompareTo(x.Score) : x.Index.CompareTo(y.Index));
        return scored.Take(k).ToList();
    }

    /// <summary>
    /// Maximal marginal relevance: indices picked one by one maximizing lambda * cos(query, v) - (1 - lambda) * max cos(v, picked);
    /// ties keep the lower index. Throws for k &lt; 0 or lambda outside [0, 1].
    /// </summary>
    public static IReadOnlyList<int> Mmr(IReadOnlyList<double> query, IReadOnlyList<IReadOnlyList<double>> vectors, int k, double lambda = 0.5) {
        ArgumentNullException.ThrowIfNull(vectors);
        CheckK(k);
        if (!(lambda >= 0 && lambda <= 1)) throw new ArgumentOutOfRangeException(nameof(lambda), "lambda must be in [0, 1]");
        var rel = vectors.Select(v => Cosine(query, v)).ToArray();
        var picked = new List<int>();
        int want = Math.Min(k, vectors.Count);
        while (picked.Count < want) {
            int best = -1;
            double bestScore = 0;
            for (int i = 0; i < vectors.Count; i++) {
                if (picked.Contains(i)) continue;
                double red = 0.0;
                bool any = false;
                foreach (int j in picked) {
                    double c = Cosine(vectors[i], vectors[j]);
                    if (!any || c > red) { red = c; any = true; }
                }
                double s = lambda * rel[i] - (1 - lambda) * red;
                if (best < 0 || s > bestScore) { best = i; bestScore = s; }
            }
            picked.Add(best);
        }
        return picked;
    }
}
