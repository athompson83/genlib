// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: WCAG 2.x contrast ratio, level checks and readable text color. Original source; copy and adapt.
// Implements the WCAG 2.x relative-luminance formula for opaque sRGB colors. It is not APCA
// (the WCAG 3 draft method). Semi-transparent colors are composited over a background first.
// Automated ratios do not replace testing real states (hover, focus, disabled) and images.

export interface Rgb { r: number; g: number; b: number; a: number } // r/g/b 0-255, a 0-1

/** Parses #rgb, #rgba, #rrggbb and #rrggbbaa. */
export function parseHexColor(input: string): Rgb {
  const hex = input.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) throw new RangeError(`Invalid hex color: ${input}`);
  const full = hex.length <= 4 ? Array.from(hex, (c) => c + c).join("") : hex;
  const channel = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) / 255 : 1 };
}

const toRgb = (color: Rgb | string): Rgb => (typeof color === "string" ? parseHexColor(color) : color);

/** Alpha-composites a foreground over an opaque background. */
export function composite(fg: Rgb | string, bg: Rgb | string): Rgb {
  const f = toRgb(fg);
  const b = toRgb(bg);
  if (b.a < 1) throw new RangeError("Background must be opaque; composite it over its own backdrop first");
  const mix = (x: number, y: number) => Math.round(x * f.a + y * (1 - f.a));
  return { r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b), a: 1 };
}

/** WCAG relative luminance (0 black to 1 white). */
export function relativeLuminance(color: Rgb | string): number {
  const c = toRgb(color);
  if (c.a < 1) throw new RangeError("Composite translucent colors before measuring luminance");
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Contrast ratio from 1 to 21. A translucent foreground is composited over the background. */
export function contrastRatio(foreground: Rgb | string, background: Rgb | string): number {
  const bg = toRgb(background);
  const fg = toRgb(foreground);
  const l1 = relativeLuminance(fg.a < 1 ? composite(fg, bg) : fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export type WcagLevel = "AAA" | "AA" | "fail";
export type ContrastUse = "text" | "large-text" | "non-text";

/**
 * Level for a ratio. Large text is >= 24px regular or >= 18.66px (14pt) bold.
 * Non-text (icons, focus rings, input borders; SC 1.4.11) needs 3:1 and has no AAA level.
 * Ratios are compared unrounded, so 4.499 fails AA.
 */
export function wcagLevel(ratio: number, use: ContrastUse = "text"): WcagLevel {
  if (use === "non-text") return ratio >= 3 ? "AA" : "fail";
  const [aa, aaa] = use === "large-text" ? [3, 4.5] : [4.5, 7];
  return ratio >= aaa ? "AAA" : ratio >= aa ? "AA" : "fail";
}

export function meetsContrast(fg: Rgb | string, bg: Rgb | string, level: "AA" | "AAA" = "AA", use: ContrastUse = "text"): boolean {
  const result = wcagLevel(contrastRatio(fg, bg), use);
  return level === "AA" ? result !== "fail" : result === "AAA";
}

/** Picks the candidate with the highest contrast against `background` (default black/white). */
export function readableTextColor(background: Rgb | string, candidates: readonly string[] = ["#000000", "#ffffff"]): string {
  let best = candidates[0];
  let bestRatio = -1;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) { best = candidate; bestRatio = ratio; }
  }
  if (best === undefined) throw new RangeError("Provide at least one candidate color");
  return best;
}

export const formatRatio = (ratio: number): string => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
