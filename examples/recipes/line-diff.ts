// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: deterministic LCS line diff and unified output. The result is a valid unified diff (patch
// reproduces the new text); same format as GNU diff -u, which may pick a different alignment of equal size.
// Original source; copy and adapt. Lines split on "\n"; a final "\n" ends the last line and its absence is
// reported with "\ No newline at end of file". A last line without "\n" only matches another last line
// without "\n". The LCS table is O(n*m): inputs above 4,000,000 line pairs throw RangeError. Escape lines
// before rendering them as HTML.

export type DiffOp = ["=" | "-" | "+", string];
type Line = { text: string; noEol: boolean };
type Row = { op: "=" | "-" | "+"; line: Line };
export const MAX_DIFF_CELLS = 4_000_000;

function split(text: string): Line[] {
  if (text === "") return [];
  const parts = text.split("\n"), newline = text.endsWith("\n");
  if (newline) parts.pop();
  return parts.map((t, k) => ({ text: t, noEol: !newline && k === parts.length - 1 }));
}

const same = (x: Line | undefined, y: Line | undefined): boolean =>
  x !== undefined && y !== undefined && x.text === y.text && x.noEol === y.noEol;

function ops(a: Line[], b: Line[]): Row[] {
  const n = a.length, m = b.length;
  if (n * m > MAX_DIFF_CELLS) throw new RangeError("diff input too large (lines(a) * lines(b) > 4,000,000)");
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  const at = (i: number, j: number): number => L[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i] ?? new Uint32Array(0);
    for (let j = m - 1; j >= 0; j--) row[j] = same(a[i], b[j]) ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const out: Row[] = [];
  const none: Line = { text: "", noEol: false };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && same(a[i], b[j])) { out.push({ op: "=", line: a[i] ?? none }); i++; j++; }
    else if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) { out.push({ op: "-", line: a[i] ?? none }); i++; }
    else { out.push({ op: "+", line: b[j] ?? none }); j++; }
  }
  return out;
}

/** List of ["=" | "-" | "+", line] turning a into b. */
export function diffLines(a: string, b: string): DiffOp[] {
  return ops(split(a), split(b)).map((r): DiffOp => [r.op, r.line.text]);
}

function range(count: number, before: number): string {
  if (count === 0) return `${before},0`;
  return count === 1 ? `${before + 1}` : `${before + 1},${count}`;
}

/** Unified diff (valid for patch; GNU diff -u format); "" when the texts are identical. */
export function unifiedDiff(a: string, b: string, fromName = "a", toName = "b", context = 3): string {
  if (!Number.isInteger(context) || context < 0) throw new RangeError("context must be a non-negative integer");
  const rows = ops(split(a), split(b));
  const changes = rows.flatMap((r, k) => (r.op === "=" ? [] : [k]));
  if (changes.length === 0) return "";
  const hunks: [number, number][] = [];
  let start = changes[0] ?? 0, end = start;
  for (const k of changes.slice(1)) {
    if (k - end - 1 <= 2 * context) end = k;
    else { hunks.push([start, end]); start = end = k; }
  }
  hunks.push([start, end]);
  let out = `--- ${fromName}\n+++ ${toName}\n`;
  for (const [hs, he] of hunks) {
    const s = Math.max(0, hs - context), e = Math.min(rows.length - 1, he + context);
    const seg = rows.slice(s, e + 1), before = rows.slice(0, s);
    const count = (rs: Row[], other: "+" | "-"): number => rs.filter((r) => r.op !== other).length;
    out += `@@ -${range(count(seg, "+"), count(before, "+"))} +${range(count(seg, "-"), count(before, "-"))} @@\n`;
    for (const r of seg) {
      out += (r.op === "=" ? " " : r.op) + r.line.text + "\n";
      if (r.line.noEol) out += "\\ No newline at end of file\n";
    }
  }
  return out;
}
