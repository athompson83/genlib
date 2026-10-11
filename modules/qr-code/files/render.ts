// SPDX-License-Identifier: Apache-2.0
// Renderers for a QrCode from encode.ts: a compact SVG (one path of merged horizontal runs),
// half-block terminal text, and a 0/1 matrix string for tests and debugging.

import { QrError, type QrCode } from "./encode.js";

export interface SvgOptions {
  /** Quiet-zone width in modules. Default 4, the minimum the standard requires. */
  readonly margin?: number;
  /** Pixels per module for the width/height attributes. Default 1 (the viewBox keeps it scalable). */
  readonly scale?: number;
  /** Dark module color: a hex color or an allow-listed color name. Default "#000". */
  readonly dark?: string;
  /** Background color, or "none"/"transparent" for no background. Default "#fff". */
  readonly light?: string;
  /** Accessible name, for example "QR code for https://example.com". Escaped. Default "QR code". */
  readonly title?: string;
}

export interface TerminalOptions {
  /** Quiet-zone width in modules. Default 2. */
  readonly margin?: number;
  /** Draw light modules as blocks instead of dark ones, for terminals with a dark background. Default false. */
  readonly invert?: boolean;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const NAMED_COLORS = new Set([
  "black", "white", "transparent", "none", "currentcolor", "red", "green", "blue", "navy", "maroon", "purple",
  "teal", "olive", "gray", "grey", "silver", "darkblue", "darkgreen", "darkred", "darkslategray", "midnightblue",
]);

function color(value: string, name: string): string {
  if (typeof value === "string" && (HEX_COLOR.test(value) || NAMED_COLORS.has(value.toLowerCase()))) return value;
  throw new QrError("invalid-option", `${name} must be a hex color such as #1a1a1a or a basic color name.`);
}

function intOption(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new QrError("invalid-option", `${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** SVG markup for the symbol. Colors are validated against an allow-list so they cannot inject markup. */
export function toSvg(qr: QrCode, options: SvgOptions = {}): string {
  const margin = intOption(options.margin ?? 4, "margin", 0, 64);
  const scale = intOption(options.scale ?? 1, "scale", 1, 100);
  const dark = color(options.dark ?? "#000", "dark");
  const light = color(options.light ?? "#fff", "light");
  const title = options.title ?? "QR code";
  if (typeof title !== "string" || title.length > 500) {
    throw new QrError("invalid-option", "title must be a string of at most 500 characters.");
  }
  const dim = qr.size + margin * 2;
  let path = "";
  for (let row = 0; row < qr.size; row += 1) {
    const line = qr.modules[row]!;
    let col = 0;
    while (col < qr.size) {
      if (!line[col]) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < qr.size && line[col]) col += 1;
      path += `M${start + margin} ${row + margin}h${col - start}v1h-${col - start}z`;
    }
  }
  const px = dim * scale;
  const background = light === "none" || light.toLowerCase() === "transparent"
    ? "" : `<rect width="${dim}" height="${dim}" fill="${light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" ` +
    `role="img" shape-rendering="crispEdges"><title>${escapeXml(title)}</title>${background}` +
    `<path fill="${dark}" d="${path}"/></svg>`;
}

/** Text using half-block characters: each line holds two module rows. */
export function toTerminal(qr: QrCode, options: TerminalOptions = {}): string {
  const margin = intOption(options.margin ?? 2, "margin", 0, 16);
  const invert = options.invert === true;
  const dim = qr.size + margin * 2;
  const filled = (row: number, col: number): boolean => {
    const r = row - margin, c = col - margin;
    const dark = r >= 0 && r < qr.size && c >= 0 && c < qr.size && qr.modules[r]![c] === true;
    return dark !== invert;
  };
  const lines: string[] = [];
  for (let row = 0; row < dim; row += 2) {
    let line = "";
    for (let col = 0; col < dim; col += 1) {
      const top = filled(row, col);
      const bottom = row + 1 < dim ? filled(row + 1, col) : invert;
      line += top ? (bottom ? "█" : "▀") : (bottom ? "▄" : " ");
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Rows of "1" (dark) and "0" (light) joined by newlines, without a quiet zone. */
export function toMatrixString(qr: QrCode): string {
  return qr.modules.map(row => row.map(dark => (dark ? "1" : "0")).join("")).join("\n");
}
