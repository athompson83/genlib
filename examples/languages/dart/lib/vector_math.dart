// SPDX-License-Identifier: Apache-2.0
/// Vector math for embeddings: dot product, norm, cosine similarity, normalization, brute-force top-k and maximal marginal
/// relevance (MMR) re-ranking. Sums run plain left to right. Throws [ArgumentError] for length mismatches or empty vectors.
library;

import 'dart:math' as math;

void _checkPair(List<num> a, List<num> b) {
  if (a.length != b.length) throw ArgumentError('vectors must have the same length');
  if (a.isEmpty) throw ArgumentError('vectors must not be empty');
}

void _checkK(int k) {
  if (k < 0) throw RangeError.value(k, 'k', 'must be >= 0');
}

/// Dot product of two equal-length, non-empty vectors.
double dot(List<num> a, List<num> b) {
  _checkPair(a, b);
  var sum = 0.0;
  for (var i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/// Euclidean length of a non-empty vector.
double norm(List<num> a) {
  if (a.isEmpty) throw ArgumentError('vectors must not be empty');
  var sum = 0.0;
  for (final x in a) {
    sum += x * x;
  }
  return math.sqrt(sum);
}

/// Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros.
double cosine(List<num> a, List<num> b) {
  _checkPair(a, b);
  final na = norm(a), nb = norm(b);
  if (na == 0 || nb == 0) return 0.0;
  return math.max(-1.0, math.min(1.0, dot(a, b) / (na * nb)));
}

/// The vector scaled to length 1; throws [ArgumentError] for a zero vector.
List<double> normalize(List<num> a) {
  final n = norm(a);
  if (n == 0) throw ArgumentError('cannot normalize a zero vector');
  return [for (final x in a) x / n];
}

/// (index, score) of the [k] most cosine-similar vectors, best first; ties keep the lower index.
List<(int, double)> topK(List<num> query, List<List<num>> vectors, int k) {
  _checkK(k);
  final scored = [for (var i = 0; i < vectors.length; i++) (i, cosine(query, vectors[i]))];
  scored.sort((x, y) => x.$2 != y.$2 ? y.$2.compareTo(x.$2) : x.$1.compareTo(y.$1));
  return scored.take(k).toList();
}

/// Maximal marginal relevance: indices picked one by one maximizing lambda * cos(query, v) - (1 - lambda) * max cos(v, picked);
/// ties keep the lower index. Throws for k < 0 or [lambda] outside [0, 1].
List<int> mmr(List<num> query, List<List<num>> vectors, int k, {double lambda = 0.5}) {
  _checkK(k);
  if (!(lambda >= 0 && lambda <= 1)) throw RangeError.value(lambda, 'lambda', 'must be in [0, 1]');
  final rel = [for (final v in vectors) cosine(query, v)];
  final picked = <int>[];
  final want = math.min(k, vectors.length);
  while (picked.length < want) {
    var best = -1;
    var bestScore = 0.0;
    for (var i = 0; i < vectors.length; i++) {
      if (picked.contains(i)) continue;
      double? red;
      for (final j in picked) {
        final c = cosine(vectors[i], vectors[j]);
        if (red == null || c > red) red = c;
      }
      final s = lambda * rel[i] - (1 - lambda) * (red ?? 0.0);
      if (best < 0 || s > bestScore) {
        best = i;
        bestScore = s;
      }
    }
    picked.add(best);
  }
  return picked;
}
