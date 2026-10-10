# SPDX-License-Identifier: Apache-2.0
"""Vector math for embeddings: dot, norm, cosine, normalize, brute-force top-k and MMR re-ranking.

Sums run plain left to right so every Genlib language returns the same floats.
"""
import math
from collections.abc import Sequence

Vector = Sequence[float]


def _check(a: Vector, b: Vector) -> None:
    if len(a) != len(b):
        raise ValueError("vectors must have the same length")
    if len(a) == 0:
        raise ValueError("vectors must not be empty")


def _check_k(k: int) -> None:
    if isinstance(k, bool) or not isinstance(k, int) or k < 0:
        raise ValueError("k must be >= 0")


def dot(a: Vector, b: Vector) -> float:
    """Dot product of two equal-length, non-empty vectors."""
    _check(a, b)
    total = 0.0
    for x, y in zip(a, b):
        total += x * y
    return total


def norm(a: Vector) -> float:
    """Euclidean length of a non-empty vector."""
    if len(a) == 0:
        raise ValueError("vectors must not be empty")
    total = 0.0
    for x in a:
        total += x * x
    return math.sqrt(total)


def cosine(a: Vector, b: Vector) -> float:
    """Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros."""
    _check(a, b)
    na, nb = norm(a), norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return max(-1.0, min(1.0, dot(a, b) / (na * nb)))


def normalize(a: Vector) -> list[float]:
    """Unit-length copy of a; raises ValueError for a zero vector."""
    n = norm(a)
    if n == 0:
        raise ValueError("cannot normalize a zero vector")
    return [x / n for x in a]


def top_k(query: Vector, vectors: Sequence[Vector], k: int) -> list[tuple[int, float]]:
    """(index, cosine score) of the k most similar vectors, best first; ties keep the lower index."""
    _check_k(k)
    scored = [(i, cosine(query, v)) for i, v in enumerate(vectors)]
    scored.sort(key=lambda p: (-p[1], p[0]))
    return scored[:k]


def mmr(query: Vector, vectors: Sequence[Vector], k: int, lambda_: float = 0.5) -> list[int]:
    """Maximal marginal relevance: indices maximizing lambda*cos(query, v) - (1-lambda)*max cos(v, picked)."""
    _check_k(k)
    if not 0 <= lambda_ <= 1:
        raise ValueError("lambda must be in [0, 1]")
    rel = [cosine(query, v) for v in vectors]
    picked: list[int] = []
    while len(picked) < min(k, len(vectors)):
        best, best_score = -1, 0.0
        for i in range(len(vectors)):
            if i in picked:
                continue
            red = max((cosine(vectors[i], vectors[j]) for j in picked), default=0.0)
            score = lambda_ * rel[i] - (1 - lambda_) * red
            if best < 0 or score > best_score:
                best, best_score = i, score
        picked.append(best)
    return picked
