// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.List;

/** Vector math for embeddings: dot, norm, cosine, normalize, brute-force top-k and MMR re-ranking. */
public final class VectorMath {
    private VectorMath() {}

    /** A vector index with its cosine score. */
    public record Scored(int index, double score) {}

    private static void check(double[] a, double[] b) {
        if (a.length != b.length) throw new IllegalArgumentException("vectors must have the same length");
        if (a.length == 0) throw new IllegalArgumentException("vectors must not be empty");
    }

    /** Dot product (plain left-to-right sum). */
    public static double dot(double[] a, double[] b) {
        check(a, b);
        double s = 0;
        for (int i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }

    /** Euclidean length. */
    public static double norm(double[] a) {
        if (a.length == 0) throw new IllegalArgumentException("vectors must not be empty");
        double s = 0;
        for (double x : a) s += x * x;
        return Math.sqrt(s);
    }

    /** Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros. */
    public static double cosine(double[] a, double[] b) {
        check(a, b);
        double na = norm(a);
        double nb = norm(b);
        if (na == 0 || nb == 0) return 0.0;
        return Math.max(-1.0, Math.min(1.0, dot(a, b) / (na * nb)));
    }

    /** Unit vector in the same direction; error on a zero vector. */
    public static double[] normalize(double[] a) {
        double n = norm(a);
        if (n == 0) throw new IllegalArgumentException("cannot normalize a zero vector");
        double[] out = new double[a.length];
        for (int i = 0; i < a.length; i++) out[i] = a[i] / n;
        return out;
    }

    /** The k most cosine-similar vectors, best first; ties keep the lower index. */
    public static List<Scored> topK(double[] query, double[][] vectors, int k) {
        if (k < 0) throw new IllegalArgumentException("k must be >= 0");
        List<Scored> scored = new ArrayList<>();
        for (int i = 0; i < vectors.length; i++) scored.add(new Scored(i, cosine(query, vectors[i])));
        scored.sort((x, y) -> x.score() > y.score() ? -1 : x.score() < y.score() ? 1 : Integer.compare(x.index(), y.index()));
        return new ArrayList<>(scored.subList(0, Math.min(k, scored.size())));
    }

    /** Maximal marginal relevance: indices maximizing lambda*cos(query, v) - (1-lambda)*max cos(v, picked); ties keep the lower index. */
    public static List<Integer> mmr(double[] query, double[][] vectors, int k, double lambda) {
        if (k < 0) throw new IllegalArgumentException("k must be >= 0");
        if (!(lambda >= 0 && lambda <= 1)) throw new IllegalArgumentException("lambda must be in [0, 1]");
        double[] rel = new double[vectors.length];
        for (int i = 0; i < vectors.length; i++) rel[i] = cosine(query, vectors[i]);
        List<Integer> picked = new ArrayList<>();
        boolean[] used = new boolean[vectors.length];
        int want = Math.min(k, vectors.length);
        while (picked.size() < want) {
            int best = -1;
            double bestScore = 0;
            for (int i = 0; i < vectors.length; i++) {
                if (used[i]) continue;
                double red = 0.0;
                boolean any = false;
                for (int j : picked) {
                    double c = cosine(vectors[i], vectors[j]);
                    if (!any || c > red) { red = c; any = true; }
                }
                double s = lambda * rel[i] - (1 - lambda) * red;
                if (best < 0 || s > bestScore) { best = i; bestScore = s; }
            }
            picked.add(best);
            used[best] = true;
        }
        return picked;
    }

    /** MMR with lambda 0.5. */
    public static List<Integer> mmr(double[] query, double[][] vectors, int k) { return mmr(query, vectors, k, 0.5); }
}
