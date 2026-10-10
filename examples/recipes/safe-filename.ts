// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: safe download/upload filenames and traversal-proof relative paths. Original source; copy and adapt.
// Pure string functions (no node:path) so they run in browsers and servers. On a server, also
// resolve the final path with realpath and confirm it stays inside the base to defeat symlinks.

export interface FilenameOptions {
  /** Maximum encoded length in UTF-8 bytes (most filesystems allow 255). */
  maxBytes?: number;
  replacement?: string;
  fallback?: string;
}

const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i; // Windows device names
const ILLEGAL_CHARS = "\\u0000-\\u001f\\u007f<>:\"/\\\\|?*";
const ILLEGAL = new RegExp(`[${ILLEGAL_CHARS}]`, "g");
const HAS_ILLEGAL = new RegExp(`[${ILLEGAL_CHARS}]`);
const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

function truncateBytes(text: string, max: number): string {
  let out = "";
  for (const ch of text) {
    if (bytes(out + ch) > max) break;
    out += ch;
  }
  return out;
}

/** Produces a single path segment that is safe on Windows, macOS and Linux. */
export function sanitizeFilename(name: string, options: FilenameOptions = {}): string {
  const maxBytes = options.maxBytes ?? 255;
  const replacement = options.replacement ?? "_";
  const fallback = options.fallback ?? "file";
  if (HAS_ILLEGAL.test(replacement) || replacement.includes(".")) throw new RangeError("Unsafe replacement character");
  if (!Number.isInteger(maxBytes) || maxBytes < 8) throw new RangeError("maxBytes must be an integer >= 8");
  let clean = name.normalize("NFC").replace(ILLEGAL, replacement).replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  clean = clean.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "").replace(/\s+/g, " ");
  if (!clean) return fallback;
  if (RESERVED.test(clean)) clean = `${replacement}${clean}`;
  if (bytes(clean) <= maxBytes) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : "";
  const stem = truncateBytes(clean.slice(0, clean.length - ext.length), maxBytes - bytes(ext)).replace(/[\s.]+$/, "");
  return stem ? stem + ext : truncateBytes(clean, maxBytes);
}

/**
 * Normalizes untrusted relative segments (from URLs, archives or form input) into a POSIX
 * relative path. Throws on absolute paths, drive letters, backslashes, NUL, empty results
 * and any ".." that would climb above the root.
 */
export function safeRelativePath(...segments: string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.includes("\0") || segment.includes("\\")) throw new Error("Unsafe path segment");
    if (segment.startsWith("/") || /^[a-zA-Z]:/.test(segment)) throw new Error("Absolute paths are not allowed");
    for (const part of segment.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (parts.length === 0) throw new Error("Path escapes the base directory");
        parts.pop();
      } else {
        parts.push(part);
      }
    }
  }
  if (parts.length === 0) throw new Error("Empty path");
  return parts.join("/");
}

/** Joins an absolute POSIX base with untrusted segments; the result always stays under base. */
export function safeJoin(base: string, ...segments: string[]): string {
  if (!base.startsWith("/")) throw new Error("Base must be an absolute POSIX path");
  return `${base.replace(/\/+$/, "")}/${safeRelativePath(...segments)}`;
}
