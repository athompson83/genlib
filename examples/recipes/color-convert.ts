// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: color conversions between CSS hex, sRGB, HSL and OKLCH. Original source; copy and adapt.
// OKLCH uses Björn Ottosson's Oklab (2020) matrices. Channels r, g, b and alpha are 0..1 numbers; HSL h is
// degrees in [0, 360) with s and l in 0..1; OKLCH L is 0..1, C >= 0 and h is degrees. Pair with
// examples/recipes/color-contrast.ts for WCAG contrast checks. Same results as the Genlib Python, Go, Rust,
// Java, Kotlin, C#, Swift and Dart color modules (shared vectors).

/** Three numbers: [r, g, b], [h, s, l] or [L, C, h] depending on the function. */
export type Triple = [number, number, number];

/** "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) to [r, g, b, a] in 0..1; RangeError otherwise. */
export function parseHex(text: string): [number, number, number, number] {
  const m = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text);
  if (!m) throw new RangeError("expected #rgb, #rgba, #rrggbb or #rrggbbaa");
  let h = m[1] as string;
  if (h.length <= 4) h = Array.from(h, (c) => c + c).join("");
  const v: number[] = [];
  for (let i = 0; i < h.length; i += 2) v.push(parseInt(h.slice(i, i + 2), 16) / 255);
  return [v[0] as number, v[1] as number, v[2] as number, v[3] ?? 1];
}

const byte = (v: number): number => Math.min(255, Math.max(0, Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5)));
const hex2 = (v: number): string => byte(v).toString(16).padStart(2, "0");

/** Lowercase "#rrggbb" ("#rrggbbaa" when a < 1); channels are clamped to 0..1 and rounded half up. */
export function toHex(r: number, g: number, b: number, a = 1): string {
  return "#" + hex2(r) + hex2(g) + hex2(b) + (a < 1 ? hex2(a) : "");
}

// Python-style modulo: the result has the sign of the divisor.
const mod = (x: number, n: number): number => ((x % n) + n) % n;

/** sRGB channels to [h degrees, s, l]. */
export function rgbToHsl(r: number, g: number, b: number): Triple {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? mod((g - b) / d, 6) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [mod(h * 60, 360), s, l];
}

/** [h degrees (wrapped modulo 360), s, l] to sRGB channels. */
export function hslToRgb(h: number, s: number, l: number): Triple {
  h = mod(h, 360);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(mod(h / 60, 2) - 1)), m = l - c / 2;
  const sextants: Triple[] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = sextants[mod(Math.floor(h / 60), 6)] as Triple;
  return [r + m, g + m, b + m];
}

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const cbrt = (x: number): number => Math.sign(x) * Math.abs(x) ** (1 / 3);

/** sRGB channels to [L, C, h degrees]; h is 0 for achromatic colors. */
export function rgbToOklch(r: number, g: number, b: number): Triple {
  const lr = linear(r), lg = linear(g), lb = linear(b);
  const l = cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  return [L, C, C > 1e-7 ? mod((Math.atan2(B, A) * 180) / Math.PI, 360) : 0];
}

/** [L, C, h degrees] to sRGB channels, not clamped (outside 0..1 means out of the sRGB gamut). */
export function oklchToRgb(L: number, C: number, H: number): Triple {
  const rad = (H * Math.PI) / 180, A = C * Math.cos(rad), B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** True when every channel lies within 0..1 (with a small tolerance eps). */
export function inGamut(r: number, g: number, b: number, eps = 1e-9): boolean {
  return [r, g, b].every((v) => v >= -eps && v <= 1 + eps);
}
