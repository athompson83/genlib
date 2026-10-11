// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: natural sort ("file2" before "file10"). Original source; copy and adapt.
// Runs of ASCII digits compare by numeric value (any length, no Number overflow), other runs by ASCII
// case-folded code points; a digit run sorts before a text run. Ties: fewer runs first, then fewer leading
// zeros, then plain code point order of the whole strings, so the order is total and deterministic.
// Locale-independent on purpose; use Intl.Collator({ numeric: true }) for language-aware UI sorting.
// Same order as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart natural-sort modules.

type Run = [digit: boolean, cps: number[]];

const isDigit = (cp: number): boolean => cp >= 48 && cp <= 57;

function runs(s: string): Run[] {
  const out: Run[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number, last = out[out.length - 1];
    if (last && last[0] === isDigit(cp)) last[1].push(cp);
    else out.push([isDigit(cp), [cp]]);
  }
  return out;
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

function compareCps(a: readonly number[], b: readonly number[], fold: boolean): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a[i] as number, y = b[i] as number;
    if (fold) {
      if (x >= 65 && x <= 90) x += 32;
      if (y >= 65 && y <= 90) y += 32;
    }
    if (x !== y) return sign(x - y);
  }
  return sign(a.length - b.length);
}

function stripZeros(cps: number[]): number[] {
  let i = 0;
  while (i < cps.length - 1 && cps[i] === 48) i++;
  return cps.slice(i);
}

/** -1, 0 or 1 comparing a and b in natural order. */
export function naturalCompare(a: string, b: string): number {
  const ra = runs(a), rb = runs(b), n = Math.min(ra.length, rb.length);
  for (let i = 0; i < n; i++) {
    const [da, xa] = ra[i] as Run, [db, xb] = rb[i] as Run;
    let c: number;
    if (da && db) {
      const na = stripZeros(xa), nb = stripZeros(xb);
      c = sign(na.length - nb.length) || compareCps(na, nb, false);
    } else if (da !== db) c = da ? -1 : 1;
    else c = compareCps(xa, xb, true);
    if (c) return c;
  }
  if (ra.length !== rb.length) return sign(ra.length - rb.length);
  for (let i = 0; i < n; i++) {
    const [da, xa] = ra[i] as Run, [db, xb] = rb[i] as Run;
    if (da && db && xa.length !== xb.length) return sign(xa.length - xb.length);
  }
  return compareCps(ra.flatMap((r) => r[1]), rb.flatMap((r) => r[1]), false);
}

/** A new array sorted in natural order (the input is not modified). */
export function naturalSort(items: readonly string[]): string[] {
  return [...items].sort(naturalCompare);
}
