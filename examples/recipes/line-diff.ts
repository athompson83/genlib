// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: deterministic LCS line diff and GNU `diff -u` compatible unified output (byte-for-byte
// for the shared vectors). Original source; copy and adapt. Lines split on "\n"; a final "\n" ends the
// last line and its absence is reported with "\ No newline at end of file". The LCS table is O(n*m):
// inputs above 4,000,000 line pairs throw RangeError. Escape lines before rendering them as HTML.

export type DiffOp = ["=" | "-" | "+", string];
type Row = { op: "=" | "-" | "+"; line: string; a: number | null; b: number | null };
export const MAX_DIFF_CELLS = 4_000_000;

function split(text: string): { lines: string[]; newline: boolean } {
  if (text === "") return { lines: [], newline: true };
  const lines = text.split("\n"), newline = text.endsWith("\n");
  if (newline) lines.pop();
  return { lines, newline };
}

function ops(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  if (n * m > MAX_DIFF_CELLS) throw new RangeError("diff input too large (lines(a) * lines(b) > 4,000,000)");
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  const at = (i: number, j: number): number => L[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i] ?? new Uint32Array(0);
    for (let j = m - 1; j >= 0; j--) row[j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const out: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push(["=", a[i] ?? ""]); i++; j++; }
    else if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) { out.push(["-", a[i] ?? ""]); i++; }
    else { out.push(["+", b[j] ?? ""]); j++; }
  }
  return out;
}

/** List of ["=" | "-" | "+", line] turning a into b. */
export function diffLines(a: string, b: string): DiffOp[] {
  return ops(split(a).lines, split(b).lines);
}

function range(seg: Row[], before: Row[], other: "+" | "-", side: "a" | "b"): string {
  const lines = seg.filter((r) => r.op !== other);
  const first = lines[0];
  if (!first) return `${before.filter((r) => r.op !== other).length},0`;
  const start = (first[side] ?? 0) + 1;
  return lines.length === 1 ? `${start}` : `${start},${lines.length}`;
}

/** GNU-style unified diff; "" when the texts are identical. */
export function unifiedDiff(a: string, b: string, fromName = "a", toName = "b", context = 3): string {
  if (!Number.isInteger(context) || context < 0) throw new RangeError("context must be a non-negative integer");
  const A = split(a), B = split(b);
  const rows: Row[] = [];
  let ai = 0, bi = 0;
  for (const [op, line] of ops(A.lines, B.lines)) {
    if (op === "=") rows.push({ op, line, a: ai++, b: bi++ });
    else if (op === "-") rows.push({ op, line, a: ai++, b: null });
    else rows.push({ op, line, a: null, b: bi++ });
  }
  // final lines that differ only by the trailing newline are shown as removed and re-added
  const last = rows[rows.length - 1];
  if (A.newline !== B.newline && last && last.op === "=" && last.a === A.lines.length - 1 && last.b === B.lines.length - 1) {
    rows.pop();
    rows.push({ op: "-", line: last.line, a: last.a, b: null }, { op: "+", line: last.line, a: null, b: last.b });
  }
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
    out += `@@ -${range(seg, before, "+", "a")} +${range(seg, before, "-", "b")} @@\n`;
    for (const r of seg) {
      out += (r.op === "=" ? " " : r.op) + r.line + "\n";
      if (r.op !== "+" && r.a === A.lines.length - 1 && !A.newline && (r.op === "-" || B.newline === A.newline)) out += "\\ No newline at end of file\n";
      else if (r.op === "+" && r.b === B.lines.length - 1 && !B.newline) out += "\\ No newline at end of file\n";
    }
  }
  return out;
}
