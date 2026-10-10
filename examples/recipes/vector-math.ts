// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: vector math for embeddings. Original source; copy and adapt.
// dot, norm, cosine, normalize, brute-force top-k and maximal marginal relevance (MMR) re-ranking for small
// in-memory collections (use a vector index for large ones). Sums run plain left to right so results match
// the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart vector-math modules (shared vectors).

/** A dense vector (array or typed array). */
export type Vec = ArrayLike<number>;

function check(a: Vec, b: Vec): void {
  if (a.length !== b.length) throw new RangeError("vectors must have the same length");
  if (a.length === 0) throw new RangeError("vectors must not be empty");
}
function checkK(k: number): void {
  if (!Number.isSafeInteger(k) || k < 0) throw new RangeError("k must be an integer >= 0");
}

/** Dot product of two equal-length, non-empty vectors. */
export function dot(a: Vec, b: Vec): number {
  check(a, b);
  let total = 0;
  for (let i = 0; i < a.length; i++) total += (a[i] as number) * (b[i] as number);
  return total;
}

/** Euclidean length of a non-empty vector. */
export function norm(a: Vec): number {
  if (a.length === 0) throw new RangeError("vectors must not be empty");
  let total = 0;
  for (let i = 0; i < a.length; i++) total += (a[i] as number) * (a[i] as number);
  return Math.sqrt(total);
}

/** Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros. */
export function cosine(a: Vec, b: Vec): number {
  check(a, b);
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return Math.max(-1, Math.min(1, dot(a, b) / (na * nb)));
}

/** Unit-length copy of a; throws RangeError for a zero vector. */
export function normalize(a: Vec): number[] {
  const n = norm(a);
  if (n === 0) throw new RangeError("cannot normalize a zero vector");
  return Array.from(a, (x) => x / n);
}

/** [index, cosine score] of the k most similar vectors, best first; ties keep the lower index. */
export function topK(query: Vec, vectors: readonly Vec[], k: number): [number, number][] {
  checkK(k);
  const scored = vectors.map((v, i): [number, number] => [i, cosine(query, v)]);
  scored.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  return scored.slice(0, k);
}

/** MMR: indices picked one by one maximizing lambda*cos(query, v) - (1-lambda)*max cos(v, picked). */
export function mmr(query: Vec, vectors: readonly Vec[], k: number, lambda = 0.5): number[] {
  checkK(k);
  if (!(lambda >= 0 && lambda <= 1)) throw new RangeError("lambda must be in [0, 1]");
  const rel = vectors.map((v) => cosine(query, v));
  const picked: number[] = [];
  const taken = new Set<number>();
  while (picked.length < Math.min(k, vectors.length)) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < vectors.length; i++) {
      if (taken.has(i)) continue;
      let red = 0;
      for (let j = 0; j < picked.length; j++) {
        const c = cosine(vectors[i] as Vec, vectors[picked[j] as number] as Vec);
        if (j === 0 || c > red) red = c;
      }
      const score = lambda * (rel[i] as number) - (1 - lambda) * red;
      if (best < 0 || score > bestScore) { best = i; bestScore = score; }
    }
    picked.push(best);
    taken.add(best);
  }
  return picked;
}
