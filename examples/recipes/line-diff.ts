// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: minimal line diff (Myers' linear-space algorithm) and unified output. Original source; copy and
// adapt. Output is a valid unified diff (patch reproduces the new text) and minimal (a shortest edit script); it
// usually equals GNU diff -u (about 95% of small random inputs) but that is not guaranteed. Lines split on "\n";
// a missing final "\n" is reported with "\ No newline at end of file" and such a line only matches another one.
// O((N+M)*D) time, linear memory; more than 1,000,000 lines in total throw RangeError. Escape lines for HTML.
// Steps: lines found nowhere in the other file are changed; Myers' middle-snake recursion runs on the rest; runs
// of changes slide down; a run then moves up beside changes of the other file to show a replacement.

export type DiffOp = ["=" | "-" | "+", string];
type Line = { text: string; noEol: boolean };
type Row = { op: "=" | "-" | "+"; line: Line };
export const MAX_DIFF_LINES = 1_000_000;

function split(text: string): Line[] {
  if (text === "") return [];
  const parts = text.split("\n"), newline = text.endsWith("\n");
  if (newline) parts.pop();
  return parts.map((t, k) => ({ text: t, noEol: !newline && k === parts.length - 1 }));
}

function middleSnake(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number): number[] {
  const n = a1 - a0, m = b1 - b0, delta = n - m, odd = (delta & 1) === 1, off = n + m + 1;
  const vf = new Int32Array(2 * off + 1), vb = new Int32Array(2 * off + 1); // furthest x on diagonal k = x - y
  for (let d = 0; d <= (n + m + 1) >> 1; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vf[off + k - 1]! < vf[off + k + 1]!) ? vf[off + k + 1]! : vf[off + k - 1]! + 1;
      let y = x - k; const sx = x, sy = y;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) { x++; y++; }
      vf[off + k] = x;
      if (odd && delta - (d - 1) <= k && k <= delta + (d - 1) && x + vb[off + delta - k]! >= n) return [a0 + sx, b0 + sy, a0 + x, b0 + y];
    }
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vb[off + k - 1]! < vb[off + k + 1]!) ? vb[off + k + 1]! : vb[off + k - 1]! + 1;
      let y = x - k; const sx = x, sy = y;
      while (x < n && y < m && a[a1 - 1 - x] === b[b1 - 1 - y]) { x++; y++; }
      vb[off + k] = x;
      if (!odd && -d <= delta - k && delta - k <= d && x + vf[off + delta - k]! >= n) return [a1 - x, b1 - y, a1 - sx, b1 - sy];
    }
  }
  throw new Error("no middle snake");
}

function compare(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number, ca: boolean[], cb: boolean[]): void {
  for (;;) { // recursive on the first half, iterative on the second
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) { a0++; b0++; }
    while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) { a1--; b1--; }
    if (a0 === a1) { for (let j = b0; j < b1; j++) cb[j] = true; return; }
    if (b0 === b1) { for (let i = a0; i < a1; i++) ca[i] = true; return; }
    const [x = 0, y = 0, u = 0, v = 0] = middleSnake(a, b, a0, a1, b0, b1);
    compare(a, b, a0, x, b0, y, ca, cb);
    a0 = u; b0 = v;
  }
}

function slide(lines: Int32Array, changed: boolean[]): void {
  const n = lines.length; let i = 0;
  while (i < n) {
    if (!changed[i]) { i++; continue; }
    let j = i; while (j < n && changed[j]) j++;
    while (j < n && lines[i] === lines[j]) {
      changed[i] = false; changed[j] = true; i++; j++;
      while (j < n && changed[j]) j++;
    }
    i = j;
  }
}

function pairs(ca: boolean[], cb: boolean[]): [number, number][] {
  const out: [number, number][] = []; let i = 0, j = 0;
  while (i < ca.length || j < cb.length) {
    if (i < ca.length && ca[i]) i++;
    else if (j < cb.length && cb[j]) j++;
    else out.push([i++, j++]);
  }
  return out;
}

// One bottom-up pass: move a run of changed x lines up through equal lines into the nearest gap that holds
// changes of the other file, so the hunk shows a replacement instead of a deletion and an insertion apart.
function align(x: Int32Array, cx: boolean[], cy: boolean[], swap: boolean): void {
  const e = swap ? pairs(cy, cx).map(([p, q]): [number, number] => [q, p]) : pairs(cx, cy), xb = [-1, ...e.map((p) => p[0])], yb = [-1, ...e.map((p) => p[1]), cy.length], xe = [...e.map((p) => p[0]), cx.length];
  for (let g = e.length; g >= 1; g--) {
    const x0 = xb[g]! + 1, x1 = xe[g]!;
    if (x1 <= x0 || yb[g + 1]! - yb[g]! !== 1) continue;
    let h = g, top = x0, last = x1 - 1;
    while (h >= 1 && xb[h] === top - 1 && x[top - 1] === x[last]) {
      h--; top--; last--;
      if (yb[h + 1]! - yb[h]! > 1) {
        for (let k = top; k < x0; k++) cx[k] = true;
        for (let k = last + 1; k < x1; k++) cx[k] = false;
        g = h;
        break;
      }
      if (h >= 1 && xe[h]! - xb[h]! > 1) break;
    }
  }
}

function ops(a: Line[], b: Line[]): Row[] {
  if (a.length + b.length > MAX_DIFF_LINES) throw new RangeError("diff input too large (more than 1,000,000 lines)");
  const ids = new Map<string, number>();
  const intern = (lines: Line[]): Int32Array => Int32Array.from(lines, (l) => {
    const key = (l.noEol ? "\n" : "") + l.text; // "\n" never occurs in a line, so the keys stay distinct
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key) ?? 0;
  });
  const ia = intern(a), ib = intern(b), inA = new Set(ia), inB = new Set(ib);
  const ca = Array.from(ia, (id) => !inB.has(id)), cb = Array.from(ib, (id) => !inA.has(id));
  const ka = [...ia.keys()].filter((i) => !ca[i]), kb = [...ib.keys()].filter((j) => !cb[j]);
  const fa = Int32Array.from(ka, (i) => ia[i]!), fb = Int32Array.from(kb, (j) => ib[j]!);
  const sa = new Array<boolean>(fa.length).fill(false), sb = new Array<boolean>(fb.length).fill(false);
  compare(fa, fb, 0, fa.length, 0, fb.length, sa, sb);
  ka.forEach((i, k) => { ca[i] = sa[k] === true; });
  kb.forEach((j, k) => { cb[j] = sb[k] === true; });
  slide(ia, ca); slide(ib, cb); align(ia, ca, cb, false); align(ib, cb, ca, true);
  const out: Row[] = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && ca[i]) out.push({ op: "-", line: a[i++]! });
    else if (j < b.length && cb[j]) out.push({ op: "+", line: b[j++]! });
    else { out.push({ op: "=", line: a[i++]! }); j++; }
  }
  return out;
}

/** List of ["=" | "-" | "+", line] turning a into b. */
export function diffLines(a: string, b: string): DiffOp[] {
  return ops(split(a), split(b)).map((r): DiffOp => [r.op, r.line.text]);
}

const range = (count: number, before: number): string =>
  count === 0 ? `${before},0` : count === 1 ? `${before + 1}` : `${before + 1},${count}`;

/** Unified diff (valid for patch; GNU diff -u format); "" when the texts are identical. */
export function unifiedDiff(a: string, b: string, fromName = "a", toName = "b", context = 3): string {
  if (!Number.isInteger(context) || context < 0) throw new RangeError("context must be a non-negative integer");
  const rows = ops(split(a), split(b));
  const changes = rows.flatMap((r, k) => (r.op === "=" ? [] : [k]));
  if (changes.length === 0) return "";
  const hunks: [number, number][] = [];
  let start = changes[0] ?? 0, end = start;
  for (const k of changes.slice(1)) if (k - end - 1 <= 2 * context) end = k; else { hunks.push([start, end]); start = end = k; }
  hunks.push([start, end]);
  let out = `--- ${fromName}\n+++ ${toName}\n`, p = 0, oldLine = 0, newLine = 0;
  for (const [hs, he] of hunks) {
    const s = Math.max(0, hs - context), e = Math.min(rows.length - 1, he + context);
    for (; p < s; p++) { const op = rows[p]?.op; if (op !== "+") oldLine++; if (op !== "-") newLine++; }
    const seg = rows.slice(s, e + 1);
    const count = (other: "+" | "-"): number => seg.filter((r) => r.op !== other).length;
    out += `@@ -${range(count("+"), oldLine)} +${range(count("-"), newLine)} @@\n`;
    for (const r of seg) {
      out += (r.op === "=" ? " " : r.op) + r.line.text + "\n";
      if (r.line.noEol) out += "\\ No newline at end of file\n";
    }
  }
  return out;
}
