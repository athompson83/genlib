# SPDX-License-Identifier: Apache-2.0
"""Edit distances and similarity scores over Unicode code points (Python str indexing is per code point).

Normalize (for example unicodedata.normalize("NFC", s) and casefold) before comparing when that matters.
"""


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def damerau_osa(a: str, b: str) -> int:
    """Optimal string alignment distance: Levenshtein plus adjacent transposition (cost 1)."""
    n, m = len(a), len(b)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[n][m]


def jaro(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    window = max(max(len(a), len(b)) // 2 - 1, 0)
    ma, mb = [False] * len(a), [False] * len(b)
    matches = 0
    for i, c in enumerate(a):
        for j in range(max(0, i - window), min(len(b), i + window + 1)):
            if not mb[j] and b[j] == c:
                ma[i] = mb[j] = True
                matches += 1
                break
    if matches == 0:
        return 0.0
    transpositions, k = 0, 0
    for i in range(len(a)):
        if ma[i]:
            while not mb[k]:
                k += 1
            if a[i] != b[k]:
                transpositions += 1
            k += 1
    return (matches / len(a) + matches / len(b) + (matches - transpositions / 2) / matches) / 3


def jaro_winkler(a: str, b: str, prefix_scale: float = 0.1) -> float:
    j = jaro(a, b)
    prefix = 0
    for x, y in zip(a, b):
        if x != y or prefix == 4:
            break
        prefix += 1
    return j + prefix * prefix_scale * (1 - j)


def similarity_ratio(a: str, b: str) -> float:
    """1 - levenshtein / max length (1.0 for two empty strings)."""
    n = max(len(a), len(b))
    return 1.0 if n == 0 else 1 - levenshtein(a, b) / n
