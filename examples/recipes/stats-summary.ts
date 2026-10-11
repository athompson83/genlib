// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: descriptive statistics for a non-empty array of finite numbers. Original source; copy and adapt.
// summary() returns count, sum, min, max, mean, median, sample variance (n - 1; 0 for one value), stddev and the
// 25th/75th/90th/95th/99th percentiles; mean and variance use the two-pass algorithm. percentile() interpolates
// linearly between closest ranks (numpy's default, R type 7): h = (n-1) q / 100, x[floor h] + (h - floor h) *
// (x[floor h + 1] - x[floor h]). histogram() counts edges[i] <= x < edges[i+1], the last bucket also takes
// x == edges[last], and values outside go to below/above. Empty input, NaN/Infinity, q outside 0..100 and
// non-increasing edges throw StatsError (a RangeError). Results agree with the other Genlib languages to 1e-9
// relative (Python 3.12 sums floats with compensation; this sums left to right).

export class StatsError extends RangeError { override name = "StatsError"; }

export interface Summary {
  count: number; sum: number; min: number; max: number; mean: number; median: number; variance: number; stddev: number;
  p25: number; p75: number; p90: number; p95: number; p99: number;
}
export interface Histogram { counts: number[]; below: number; above: number }

function check(xs: readonly number[]): void {
  if (xs.length === 0) throw new StatsError("empty input");
  if (!xs.every((x) => typeof x === "number" && Number.isFinite(x))) throw new StatsError("values must be finite numbers");
}

function pct(sorted: readonly number[], q: number): number {
  const h = ((sorted.length - 1) * q) / 100;
  const lo = Math.floor(h);
  const a = sorted[lo] ?? 0;
  if (lo + 1 >= sorted.length) return sorted[sorted.length - 1] ?? 0;
  return a + (h - lo) * ((sorted[lo + 1] ?? a) - a);
}

const ascending = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

/** The q-th percentile (0..100) by linear interpolation between closest ranks (R type 7). */
export function percentile(xs: readonly number[], q: number): number {
  check(xs);
  if (typeof q !== "number" || !(q >= 0 && q <= 100)) throw new StatsError("q must be between 0 and 100");
  return pct(ascending(xs), q);
}

/** Count, sum, extremes, mean, median, sample variance, stddev and common percentiles. */
export function summary(xs: readonly number[]): Summary {
  check(xs);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = n > 1 ? xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1) : 0;
  const s = ascending(xs);
  return {
    count: n, sum, min: s[0] ?? 0, max: s[n - 1] ?? 0, mean, median: pct(s, 50), variance, stddev: Math.sqrt(variance),
    p25: pct(s, 25), p75: pct(s, 75), p90: pct(s, 90), p95: pct(s, 95), p99: pct(s, 99),
  };
}

/** Counts per [edges[i], edges[i+1]) bucket (the last one closed) plus values below and above the edges. */
export function histogram(xs: readonly number[], edges: readonly number[]): Histogram {
  check(xs);
  if (edges.length < 2 || !edges.every((e, i) => Number.isFinite(e) && (i === 0 || e > (edges[i - 1] ?? e)))) {
    throw new StatsError("edges must be finite, strictly increasing and at least two");
  }
  const counts = new Array<number>(edges.length - 1).fill(0);
  const first = edges[0] ?? 0, last = edges[edges.length - 1] ?? 0;
  let below = 0, above = 0;
  for (const x of xs) {
    if (x < first) below++;
    else if (x > last) above++;
    else if (x === last) counts[counts.length - 1]! += 1;
    else {
      let lo = 0, hi = edges.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if ((edges[mid] ?? 0) <= x) lo = mid; else hi = mid;
      }
      counts[lo]! += 1;
    }
  }
  return { counts, below, above };
}
