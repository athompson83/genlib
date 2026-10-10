// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 9110 byte Range requests and Content-Range. Original source; copy and adapt.
// "none" -> serve 200 with the full body; "unsatisfiable" -> 416 with Content-Range: bytes */size;
// "ranges" -> 206 with inclusive [start, end] pairs in header order (not merged; send multipart for
// more than one, or serve only the first). Sizes are numbers up to Number.MAX_SAFE_INTEGER.

export type RangeResult =
  | { kind: "none" }
  | { kind: "unsatisfiable"; contentRange: string }
  | { kind: "ranges"; ranges: [number, number][] };

export const MAX_RANGE_SPECS = 100;
const HEAD = /^[ \t]*([A-Za-z]+)=([\s\S]*)$/;
const SPEC = /^(?:([0-9]+)-([0-9]*)|-([0-9]+))$/;
const trimSpTab = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, "");

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError("size must be a non-negative safe integer");
  if (header === null || header === undefined) return { kind: "none" };
  const m = HEAD.exec(header);
  if (!m || (m[1] ?? "").toLowerCase() !== "bytes") return { kind: "none" };
  const specs = (m[2] ?? "").split(",").map(trimSpTab);
  if (specs.some((p) => p === "") || specs.length > MAX_RANGE_SPECS) return { kind: "none" };
  const ranges: [number, number][] = [];
  for (const p of specs) {
    const s = SPEC.exec(p);
    if (!s) return { kind: "none" };
    if (s[3] !== undefined) {
      const n = Number(s[3]);
      if (n === 0 || size === 0) continue;
      ranges.push([Math.max(0, size - n), size - 1]);
      continue;
    }
    const a = Number(s[1]);
    const b = s[2] ? Number(s[2]) : null;
    if (b !== null && b < a) return { kind: "none" };
    if (a >= size) continue;
    ranges.push([a, b === null ? size - 1 : Math.min(b, size - 1)]);
  }
  return ranges.length ? { kind: "ranges", ranges } : { kind: "unsatisfiable", contentRange: `bytes */${size}` };
}

export function contentRange(start: number, end: number, size: number): string {
  if (![start, end, size].every(Number.isSafeInteger) || start < 0 || end < start || end >= size) {
    throw new RangeError("need integers with 0 <= start <= end < size");
  }
  return `bytes ${start}-${end}/${size}`;
}
