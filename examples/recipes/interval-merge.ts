// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: set operations on integer half-open intervals [start, end). Original source; copy and adapt.
// An interval is a [start, end] pair of safe integers with start < end; anything else throws IntervalError (a
// RangeError). Every result is a sorted array of non-overlapping intervals with touching ones merged, so [1, 2]
// and [2, 3] become [1, 3]; overlaps() treats touching intervals as not overlapping. Inputs are never mutated.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart interval-merge modules.

export class IntervalError extends RangeError { override name = "IntervalError"; }

export type Interval = readonly [start: number, end: number];

function check(xs: readonly Interval[]): void {
  for (const x of xs) {
    if (!Array.isArray(x) || x.length !== 2 || !Number.isSafeInteger(x[0]) || !Number.isSafeInteger(x[1]) || x[0] >= x[1]) {
      throw new IntervalError("interval needs safe integers with start < end");
    }
  }
}

/** Sorts and merges overlapping or touching intervals. */
export function merge(xs: readonly Interval[]): Array<[number, number]> {
  check(xs);
  const out: Array<[number, number]> = [];
  for (const [s, e] of [...xs].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const top = out[out.length - 1];
    if (top && s <= top[1]) top[1] = Math.max(top[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The parts covered by both interval sets. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Array<[number, number]> {
  const x = merge(a), y = merge(b);
  const out: Array<[number, number]> = [];
  let i = 0, j = 0;
  for (let p = x[i], q = y[j]; p && q; p = x[i], q = y[j]) {
    const s = Math.max(p[0], q[0]), e = Math.min(p[1], q[1]);
    if (s < e) out.push([s, e]);
    if (p[1] < q[1]) i++; else j++;
  }
  return merge(out);
}

/** The parts of a not covered by b. */
export function subtract(a: readonly Interval[], b: readonly Interval[]): Array<[number, number]> {
  const y = merge(b);
  const out: Array<[number, number]> = [];
  for (const [s, e] of merge(a)) {
    let cur = s;
    for (const [bs, be] of y) {
      if (be <= cur || bs >= e) continue;
      if (bs > cur) out.push([cur, bs]);
      cur = Math.max(cur, be);
      if (cur >= e) break;
    }
    if (cur < e) out.push([cur, e]);
  }
  return out;
}

/** The parts of [lo, hi) not covered by xs (lo < hi). */
export function gaps(xs: readonly Interval[], lo: number, hi: number): Array<[number, number]> {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo >= hi) throw new IntervalError("gaps needs lo < hi");
  return subtract([[lo, hi]], xs);
}

/** Covered length after merging. */
export function total(xs: readonly Interval[]): number {
  return merge(xs).reduce((n, [s, e]) => n + (e - s), 0);
}

/** True when two intervals share at least one point (touching is not overlapping). */
export function overlaps(x: Interval, y: Interval): boolean {
  check([x, y]);
  return x[0] < y[1] && y[0] < x[1];
}

/** True when some interval has start <= p < end. */
export function contains(xs: readonly Interval[], p: number): boolean {
  return merge(xs).some(([s, e]) => s <= p && p < e);
}
