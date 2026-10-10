// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: sanitize untrusted text (usernames, comments, filenames shown in UI, code review input):
// normalize newlines, strip control, bidirectional and invisible characters, and detect Trojan Source
// bidi controls (CVE-2021-42574). Original source; copy and adapt. U+200C/U+200D (ZWNJ/ZWJ) are KEPT
// because emoji sequences and Indic/Persian text need them. This is not HTML escaping. Lengths count
// Unicode code points.

export interface SanitizeOptions { allowNewlines?: boolean; maxLength?: number }

export const BIDI_CONTROLS: ReadonlySet<number> = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);
const INVISIBLE: ReadonlySet<number> = new Set([0x200b, 0x2060, 0xfeff]);

export function sanitizeText(text: string, options: SanitizeOptions = {}): string {
  const { allowNewlines = true, maxLength } = options;
  if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 0)) throw new RangeError("maxLength must be a non-negative integer");
  const out: string[] = [];
  for (const c of text.replace(/\r\n?/g, "\n")) {
    const cp = c.codePointAt(0) ?? 0;
    if (c === "\n") out.push(allowNewlines ? "\n" : " ");
    else if (c === "\t") out.push(c);
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || BIDI_CONTROLS.has(cp) || INVISIBLE.has(cp)) continue;
    else out.push(c);
  }
  return (maxLength === undefined ? out : out.slice(0, maxLength)).join("");
}

/** [[code point index, "XXXX" uppercase hex], ...] for every bidirectional control. */
export function findBidiControls(text: string): [number, string][] {
  const found: [number, string][] = [];
  Array.from(text).forEach((c, i) => {
    const cp = c.codePointAt(0) ?? 0;
    if (BIDI_CONTROLS.has(cp)) found.push([i, cp.toString(16).toUpperCase().padStart(4, "0")]);
  });
  return found;
}

/** Collapses runs of space, tab, LF, CR, FF and VT into one space and trims spaces. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t\n\r\f\v]+/g, " ").replace(/^ +| +$/g, "");
}
