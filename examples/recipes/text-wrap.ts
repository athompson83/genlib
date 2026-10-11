// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: plain-text word wrap and word-boundary truncation, counted in code points. Original source; copy
// and adapt. wrapText() keeps input line breaks (CRLF and CR become LF) and empty lines, splits each line on runs of
// spaces and tabs, fills lines greedily with single spaces, breaks words longer than the width into width-sized
// chunks and leaves no trailing spaces. truncateText() returns text unchanged when it fits; otherwise it keeps
// maxLen - length(ellipsis) code points, backs up to the last space when it is at or after half of that, strips
// trailing spaces and appends the ellipsis. Code points are not grapheme clusters or display columns. Failures throw
// RangeError. For Markdown input use the markdown-excerpt recipe, which strips syntax first.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart text-wrap modules.

/** Greedy word wrap to at most `width` code points per line. */
export function wrapText(text: string, width: number): string {
  if (!Number.isSafeInteger(width) || width < 1) throw new RangeError("width must be >= 1");
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    let cur: string[] = [];
    for (const word of line.split(/[ \t]+/)) {
      let w = Array.from(word);
      if (!w.length) continue;
      while (w.length > width) {
        if (cur.length) { out.push(cur.join("")); cur = []; }
        out.push(w.slice(0, width).join(""));
        w = w.slice(width);
      }
      if (!w.length) continue;
      if (!cur.length) cur = w;
      else if (cur.length + 1 + w.length <= width) cur.push(" ", ...w);
      else { out.push(cur.join("")); cur = w; }
    }
    out.push(cur.join(""));
  }
  return out.join("\n");
}

/** Shortens text to at most maxLen code points, preferring a word boundary, and appends the ellipsis. */
export function truncateText(text: string, maxLen: number, ellipsis = "…"): string {
  const cps = Array.from(text);
  if (cps.length <= maxLen) return text;
  const keep = maxLen - Array.from(ellipsis).length;
  if (maxLen < 1 || keep < 0) throw new RangeError("maxLen must be >= 1 and fit the ellipsis");
  let cut = cps.slice(0, keep);
  const sp = cut.lastIndexOf(" ");
  if (sp >= Math.floor(keep / 2) && sp > 0) cut = cut.slice(0, sp);
  return cut.join("").replace(/ +$/, "") + ellipsis;
}
