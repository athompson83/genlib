// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: GitHub-flavored Markdown tables with escaping, alignment and padded columns. Original source; copy
// and adapt. Cells escape "\" as "\\" and "|" as "\|" and turn CRLF, CR and LF into "<br>". Each column is as wide as
// its longest escaped cell in code points (at least 3). Alignment per column is "left", "right", "center" or null
// (no colon); center puts the extra space on the right. Lines look like "| a | b |" joined with "\n", no trailing
// newline. Other Markdown or HTML inside a cell still renders, so escape untrusted content first. Empty headers,
// ragged rows and unknown alignments throw RangeError.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart markdown-table modules.

export type ColumnAlign = "left" | "right" | "center" | null;

const escapeCell = (c: string): string => c.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, "<br>");
const len = (s: string): number => Array.from(s).length;

function pad(s: string, w: number, a: ColumnAlign): string {
  const gap = w - len(s);
  if (a === "right") return " ".repeat(gap) + s;
  if (a === "center") return " ".repeat(gap >> 1) + s + " ".repeat(gap - (gap >> 1));
  return s + " ".repeat(gap);
}

function separator(w: number, a: ColumnAlign): string {
  const d = Array<string>(w).fill("-");
  if (a === "left" || a === "center") d[0] = ":";
  if (a === "right" || a === "center") d[w - 1] = ":";
  return d.join("");
}

const line = (cells: readonly string[]): string => "| " + cells.join(" | ") + " |";

/** Renders headers and rows as a GitHub-flavored Markdown table. */
export function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[], align?: readonly ColumnAlign[] | null): string {
  if (headers.length === 0) throw new RangeError("headers must not be empty");
  const n = headers.length;
  const al: readonly ColumnAlign[] = align && align.length ? align : Array<ColumnAlign>(n).fill(null);
  if (al.length !== n || al.some((a) => a !== null && a !== "left" && a !== "right" && a !== "center")) {
    throw new RangeError("align needs one of left/right/center/null per column");
  }
  if (rows.some((r) => r.length !== n)) throw new RangeError("every row needs one cell per header");
  const cells = [headers, ...rows].map((r) => r.map(escapeCell));
  const widths = headers.map((_, i) => Math.max(3, ...cells.map((r) => len(r[i] ?? ""))));
  const render = (r: readonly string[]): string => line(r.map((c, i) => pad(c, widths[i] ?? 3, al[i] ?? null)));
  return [render(cells[0] ?? []), line(widths.map((w, i) => separator(w, al[i] ?? null))), ...cells.slice(1).map(render)].join("\n");
}
