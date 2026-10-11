// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: text chunking for retrieval (RAG). Original source; copy and adapt.
// Splits at the largest natural boundary that fits (paragraphs, lines, sentence ends, spaces, then single
// code points), packs pieces greedily and optionally starts each chunk with the last whole pieces of the
// previous one. Lengths count Unicode code points; whitespace means ASCII space, \t, \n, \r, \f and \v only.
// Same output as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart text-chunking modules.

const WS = new Set([" ", "\t", "\n", "\r", "\f", "\v"]);
const SEPARATORS: Record<number, string> = { 0: "\n\n", 1: "\n", 3: " " };

// Pieces at one boundary level over code points; each keeps its trailing separator(s).
function splitKeep(cps: string[], level: number): string[][] {
  const out: string[][] = [];
  let start = 0;
  if (level === 2) {
    let i = 0;
    while (i < cps.length) {
      const c = cps[i] as string, next = cps[i + 1];
      if ((c === "." || c === "!" || c === "?") && next !== undefined && WS.has(next)) {
        let j = i + 1;
        while (j < cps.length && WS.has(cps[j] as string)) j++;
        out.push(cps.slice(start, j));
        start = i = j;
        continue;
      }
      i++;
    }
  } else if (level in SEPARATORS) {
    const sep = Array.from(SEPARATORS[level] as string);
    const at = (j: number): boolean => sep.every((s, k) => cps[j + k] === s);
    let i = 0;
    while (i <= cps.length - sep.length) {
      if (!at(i)) { i++; continue; }
      let j = i + sep.length;
      while (j <= cps.length - sep.length && at(j)) j += sep.length; // a run stays with the piece before it
      out.push(cps.slice(start, j));
      start = i = j;
    }
  } else {
    return cps.map((c) => [c]);
  }
  if (start < cps.length) out.push(cps.slice(start));
  return out;
}

function pieces(cps: string[], maxChars: number, level = 0): string[][] {
  if (cps.length <= maxChars) return [cps];
  const out: string[][] = [];
  for (const p of splitKeep(cps, level)) {
    if (p.length <= maxChars) out.push(p);
    else out.push(...pieces(p, maxChars, level + 1));
  }
  return out;
}

function trimWs(cps: string[]): string {
  let a = 0, b = cps.length;
  while (a < b && WS.has(cps[a] as string)) a++;
  while (b > a && WS.has(cps[b - 1] as string)) b--;
  return cps.slice(a, b).join("");
}

/** Chunks of at most maxChars code points, trimmed and never empty; overlap repeats whole trailing pieces. */
export function chunkText(text: string, maxChars: number, overlap = 0): string[] {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) throw new RangeError("maxChars must be >= 1");
  if (!Number.isSafeInteger(overlap) || overlap < 0 || overlap >= maxChars) throw new RangeError("overlap must be in 0..maxChars-1");
  const chunks: string[] = [];
  let cur: string[][] = [], size = 0;
  const emit = (): void => {
    const s = trimWs(cur.flat());
    if (s) chunks.push(s);
  };
  for (const p of pieces(Array.from(text), maxChars)) {
    if (cur.length > 0 && size + p.length > maxChars) {
      emit();
      const keep: string[][] = [];
      let total = 0;
      if (overlap > 0) {
        for (let i = cur.length - 1; i >= 1; i--) { // never repeat the whole previous chunk
          const q = cur[i] as string[];
          if (total + q.length > overlap) break;
          keep.unshift(q);
          total += q.length;
        }
      }
      while (keep.length > 0 && total + p.length > maxChars) total -= (keep.shift() as string[]).length;
      cur = keep;
      size = total;
    }
    cur.push(p);
    size += p.length;
  }
  if (cur.length > 0) emit();
  return chunks;
}
