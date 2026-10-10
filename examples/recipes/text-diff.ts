// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: line diff (Myers O(ND)) with unified-diff output. Original source; copy and adapt.
// Memory grows with (edit distance x input size); `maxEdits` bounds the work for large or
// unrelated inputs. Lines are compared exactly (no whitespace or case folding).

export type DiffOp = { type: "equal" | "insert" | "delete"; line: string; oldLine?: number; newLine?: number };

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r\n|\n|\r/);
  if (lines[lines.length - 1] === "") lines.pop(); // a trailing newline does not add a line
  return lines;
}

/** Shortest edit script between two line arrays (or texts). Line numbers are 1-based. */
export function diffLines(a: string | readonly string[], b: string | readonly string[], options: { maxEdits?: number } = {}): DiffOp[] {
  const x = typeof a === "string" ? splitLines(a) : a;
  const y = typeof b === "string" ? splitLines(b) : b;
  const n = x.length;
  const m = y.length;
  const max = Math.min(n + m, options.maxEdits ?? 10_000);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = n === 0 && m === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let i = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0)) ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let j = i - k;
      while (i < n && j < m && x[i] === y[j]) { i++; j++; }
      v[offset + k] = i;
      if (i >= n && j >= m) { found = true; break; }
    }
  }
  if (!found) throw new RangeError("Inputs differ by more than maxEdits lines");
  // Backtrack through the saved V arrays to recover the path.
  const ops: DiffOp[] = [];
  let i = n;
  let j = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d] as Int32Array;
    const k = i - j;
    const prevK = k === -d || (k !== d && (vd[offset + k - 1] ?? 0) < (vd[offset + k + 1] ?? 0)) ? k + 1 : k - 1;
    const prevI = d === 0 ? 0 : (vd[offset + prevK] ?? 0);
    const prevJ = d === 0 ? 0 : prevI - prevK;
    while (i > prevI && j > prevJ) { ops.push({ type: "equal", line: x[i - 1] as string, oldLine: i, newLine: j }); i--; j--; }
    if (d === 0) break;
    if (i === prevI) ops.push({ type: "insert", line: y[j - 1] as string, newLine: j });
    else ops.push({ type: "delete", line: x[i - 1] as string, oldLine: i });
    i = prevI;
    j = prevJ;
  }
  return ops.reverse();
}

/** Renders `diff -u` style hunks. Returns "" when the inputs are equal. */
export function unifiedDiff(ops: readonly DiffOp[], options: { context?: number; fromFile?: string; toFile?: string } = {}): string {
  const context = options.context ?? 3;
  const changes = ops.map((op, index) => (op.type === "equal" ? -1 : index)).filter((index) => index >= 0);
  if (changes.length === 0) return "";
  const out = [`--- ${options.fromFile ?? "a"}`, `+++ ${options.toFile ?? "b"}`];
  let start = 0;
  while (start < changes.length) {
    let end = start;
    while (end + 1 < changes.length && (changes[end + 1] ?? 0) - (changes[end] ?? 0) <= context * 2 + 1) end++;
    const from = Math.max(0, (changes[start] ?? 0) - context);
    const to = Math.min(ops.length - 1, (changes[end] ?? 0) + context);
    const hunk = ops.slice(from, to + 1);
    let oldStart = 0, newStart = 0;
    for (let i = 0; i < from; i++) { if (ops[i]?.type !== "insert") oldStart++; if (ops[i]?.type !== "delete") newStart++; }
    const oldCount = hunk.filter((op) => op.type !== "insert").length;
    const newCount = hunk.filter((op) => op.type !== "delete").length;
    out.push(`@@ -${oldCount ? oldStart + 1 : oldStart},${oldCount} +${newCount ? newStart + 1 : newStart},${newCount} @@`);
    for (const op of hunk) out.push((op.type === "equal" ? " " : op.type === "insert" ? "+" : "-") + op.line);
    start = end + 1;
  }
  return out.join("\n") + "\n";
}
