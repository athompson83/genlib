// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: edit distances and similarity scores over Unicode code points (not UTF-16 units),
// so "🙂" counts as one character. Original source; copy and adapt. Normalize first when it matters
// (s.normalize("NFC").toLowerCase()). levenshtein and damerauOsa are O(n*m); cap input lengths.

const points = (s: string): string[] => Array.from(s);

export function levenshtein(a: string, b: string): number {
  const x = points(a), y = points(b);
  let prev = Array.from({ length: y.length + 1 }, (_v, j) => j);
  x.forEach((ca, i) => {
    const cur = [i + 1];
    y.forEach((cb, j) => cur.push(Math.min((prev[j + 1] ?? 0) + 1, (cur[j] ?? 0) + 1, (prev[j] ?? 0) + (ca === cb ? 0 : 1))));
    prev = cur;
  });
  return prev[y.length] ?? 0;
}

/** Optimal string alignment: Levenshtein plus adjacent transposition at cost 1. */
export function damerauOsa(a: string, b: string): number {
  const x = points(a), y = points(b), n = x.length, m = y.length;
  const d = Array.from({ length: n + 1 }, (_r, i) => Array.from({ length: m + 1 }, (_c, j) => (i === 0 ? j : j === 0 ? i : 0)));
  const at = (i: number, j: number): number => d[i]?.[j] ?? 0;
  for (let i = 1; i <= n; i++) {
    const row = d[i] ?? [];
    for (let j = 1; j <= m; j++) {
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + (x[i - 1] === y[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) v = Math.min(v, at(i - 2, j - 2) + 1);
      row[j] = v;
    }
  }
  return at(n, m);
}

export function jaro(a: string, b: string): number {
  const x = points(a), y = points(b);
  if (x.length === 0 && y.length === 0) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const window = Math.max(Math.floor(Math.max(x.length, y.length) / 2) - 1, 0);
  const mx = new Array<boolean>(x.length).fill(false), my = new Array<boolean>(y.length).fill(false);
  let matches = 0;
  x.forEach((c, i) => {
    for (let j = Math.max(0, i - window); j < Math.min(y.length, i + window + 1); j++) {
      if (!my[j] && y[j] === c) { mx[i] = my[j] = true; matches++; break; }
    }
  });
  if (matches === 0) return 0;
  let t = 0, k = 0;
  x.forEach((c, i) => {
    if (!mx[i]) return;
    while (!my[k]) k++;
    if (c !== y[k]) t++;
    k++;
  });
  return (matches / x.length + matches / y.length + (matches - t / 2) / matches) / 3;
}

/** Jaro-Winkler with prefix scale 0.1 and a common prefix of at most 4 code points. */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b), x = points(a), y = points(b);
  let prefix = 0;
  while (prefix < 4 && prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix++;
  return j + prefix * prefixScale * (1 - j);
}

/** 1 - levenshtein / max length in code points (1 for two empty strings). */
export function similarityRatio(a: string, b: string): number {
  const n = Math.max(points(a).length, points(b).length);
  return n === 0 ? 1 : 1 - levenshtein(a, b) / n;
}
