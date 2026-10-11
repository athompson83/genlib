// SPDX-License-Identifier: Apache-2.0
// Upload policy, content sniffing and filename sanitizing shared by the browser preflight (client.ts) and the server
// (core.ts). Pure functions over bytes and strings: no Node APIs, no network, no globals beyond TextEncoder and
// TextDecoder, so the same rules run on both sides. The server must still enforce everything; the client check
// only saves a wasted upload.

/** Types this module can recognize from bytes. `svg` and `html` are recognized so they can be refused. */
export type UploadTypeId = "png" | "jpeg" | "gif" | "webp" | "pdf" | "text" | "zip" | "svg" | "html";

export interface UploadTypeInfo {
  readonly id: UploadTypeId;
  /** The media type the file is stored and served with. */
  readonly mime: string;
  /** Lowercase extensions (no dot) that may carry this type. The first is canonical. */
  readonly extensions: readonly string[];
  /** Active content that can run script in a browser when rendered inline. */
  readonly active: boolean;
}

export const UPLOAD_TYPES: Readonly<Record<UploadTypeId, UploadTypeInfo>> = {
  png: { id: "png", mime: "image/png", extensions: ["png"], active: false },
  jpeg: { id: "jpeg", mime: "image/jpeg", extensions: ["jpg", "jpeg", "jpe"], active: false },
  gif: { id: "gif", mime: "image/gif", extensions: ["gif"], active: false },
  webp: { id: "webp", mime: "image/webp", extensions: ["webp"], active: false },
  pdf: { id: "pdf", mime: "application/pdf", extensions: ["pdf"], active: false },
  text: { id: "text", mime: "text/plain", extensions: ["txt", "text", "log"], active: false },
  zip: { id: "zip", mime: "application/zip", extensions: ["zip"], active: false },
  svg: { id: "svg", mime: "image/svg+xml", extensions: ["svg"], active: true },
  html: { id: "html", mime: "text/html", extensions: ["html", "htm", "xhtml"], active: true },
};

export interface UploadPolicyInput {
  /** Largest accepted file in bytes (required). */
  readonly maxBytes: number;
  /** Allowlisted types. Default: png, jpeg, gif, webp, pdf. */
  readonly allow?: readonly UploadTypeId[];
  /** Must be true to allowlist svg or html. Serve such files only from a separate, cookieless origin. */
  readonly allowActiveContent?: boolean;
  /** Accept an empty or application/octet-stream declared type (browsers send "" for unknown files). Default true. */
  readonly allowGenericDeclaredType?: boolean;
  /** Cap for sanitized filenames in UTF-8 bytes. Default 200; 16 to 255. */
  readonly maxFilenameBytes?: number;
}

export interface UploadPolicy {
  readonly maxBytes: number;
  readonly allow: readonly UploadTypeId[];
  readonly allowActiveContent: boolean;
  readonly allowGenericDeclaredType: boolean;
  readonly maxFilenameBytes: number;
}

export const DEFAULT_ALLOW: readonly UploadTypeId[] = ["png", "jpeg", "gif", "webp", "pdf"];

/** Validates a policy once; throws RangeError on unsafe or malformed settings. */
export function normalizePolicy(input: UploadPolicyInput): UploadPolicy {
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1) throw new RangeError("maxBytes must be a positive integer");
  const allow = [...new Set(input.allow ?? DEFAULT_ALLOW)];
  if (allow.length === 0) throw new RangeError("allow must list at least one type");
  for (const id of allow) {
    if (!Object.hasOwn(UPLOAD_TYPES, id)) throw new RangeError(`Unknown upload type: ${String(id)}`);
    if (UPLOAD_TYPES[id].active && input.allowActiveContent !== true) {
      throw new RangeError(`${id} can run script in a browser; set allowActiveContent to allowlist it`);
    }
  }
  const maxFilenameBytes = input.maxFilenameBytes ?? 200;
  if (!Number.isInteger(maxFilenameBytes) || maxFilenameBytes < 16 || maxFilenameBytes > 255) throw new RangeError("maxFilenameBytes must be 16 to 255");
  return { maxBytes: input.maxBytes, allow, allowActiveContent: input.allowActiveContent === true, allowGenericDeclaredType: input.allowGenericDeclaredType ?? true, maxFilenameBytes };
}

function at(b: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (b.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) if (b[offset + i] !== signature[i]) return false;
  return true;
}
const ascii = (text: string): number[] => Array.from(text, (ch) => ch.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = ascii("GIF87a");
const GIF89 = ascii("GIF89a");
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const PDF = ascii("%PDF-");
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const MARKUP_HEAD = 1024;

/**
 * Plain-text heuristic: valid UTF-8 (an optional BOM), no NUL and no control characters other than tab, line feed,
 * form feed and carriage return. Pass the whole buffered file so a binary tail cannot hide behind a text head.
 */
function isPlainText(bytes: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c && code !== 0x0d) || code === 0x7f) return false;
  }
  return true;
}

function markupType(bytes: Uint8Array): UploadTypeId | null {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, MARKUP_HEAD)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (!head.startsWith("<")) return null;
  // An XML prolog, comment or doctype may precede the root element; look for an <svg root within the head.
  if (/<svg[\s>/]/.test(head)) return "svg";
  return "html";
}

/**
 * Detects the type from the bytes themselves (magic numbers, then a text heuristic). Text that starts with markup is
 * reported as `svg` or `html` so the allowlist can refuse it. Returns null for anything else, including empty input.
 */
export function sniffType(bytes: Uint8Array): UploadTypeId | null {
  if (bytes.length === 0) return null;
  if (at(bytes, 0, PNG)) return "png";
  if (at(bytes, 0, JPEG)) return "jpeg";
  if (at(bytes, 0, GIF87) || at(bytes, 0, GIF89)) return "gif";
  if (at(bytes, 0, RIFF) && at(bytes, 8, WEBP)) return "webp";
  if (at(bytes, 0, PDF)) return "pdf";
  if (at(bytes, 0, ZIP) || at(bytes, 0, ZIP_EMPTY)) return "zip";
  if (!isPlainText(bytes)) return null;
  return markupType(bytes) ?? "text";
}

/** Lowercase extension of a file name without the dot, or "" when it has none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** Media type without parameters, lowercased: "Text/Plain; charset=utf-8" -> "text/plain". */
export function baseMediaType(declared: string | null | undefined): string {
  return (declared ?? "").split(";")[0]!.trim().toLowerCase();
}

/** The allowlisted type a file name's extension claims, or null when the extension is not allowlisted. */
export function typeForExtension(filename: string, policy: UploadPolicy): UploadTypeId | null {
  const extension = extensionOf(filename);
  if (!extension) return null;
  for (const id of policy.allow) if (UPLOAD_TYPES[id].extensions.includes(extension)) return id;
  return null;
}

export type TypeCheck =
  | { readonly ok: true; readonly type: UploadTypeId }
  | { readonly ok: false; readonly reason: "type-not-allowed" | "type-mismatch" };

/** True when the declared media type is acceptable for `type` under the policy. */
export function declaredTypeAgrees(declared: string | null | undefined, type: UploadTypeId, policy: UploadPolicy): boolean {
  const base = baseMediaType(declared);
  if (base === "" || base === "application/octet-stream") return policy.allowGenericDeclaredType;
  if (type === "jpeg" && base === "image/jpg") return true;
  return base === UPLOAD_TYPES[type].mime;
}

/**
 * The allowlist decision. `detected` is the sniffed type (null when unknown). The detected type must be allowlisted,
 * and the extension and declared type must both name that same type.
 */
export function checkType(detected: UploadTypeId | null, filename: string, declared: string | null | undefined, policy: UploadPolicy): TypeCheck {
  const claimed = typeForExtension(filename, policy);
  if (!claimed || !detected || !policy.allow.includes(detected)) return { ok: false, reason: "type-not-allowed" };
  if (claimed !== detected || !declaredTypeAgrees(declared, detected, policy)) return { ok: false, reason: "type-mismatch" };
  return { ok: true, type: detected };
}

const RESERVED = /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// C0/C1 controls, DEL and characters Windows forbids become "_".
const UNSAFE = /[\u0000-\u001f\u007f-\u009f<>:"|?*]/g;
// Removed outright: every format character (\p{Cf}: bidi controls such as U+202E and U+061C, zero-width characters,
// soft hyphen, BOM, U+180E) and invisible fillers that render as blank (Hangul fillers, halfwidth filler, braille blank).
const INVISIBLE = /[\p{Cf}\u115f\u1160\u3164\uffa0\u2800]/gu;
const encoder = new TextEncoder();
const byteLength = (text: string): number => encoder.encode(text).length;

function truncateBytes(text: string, max: number): string {
  let out = "";
  let size = 0;
  for (const ch of text) {
    const next = byteLength(ch);
    if (size + next > max) break;
    out += ch;
    size += next;
  }
  return out;
}

/**
 * A display name that is safe to store and to echo in headers: only the last path segment survives (so "../../x"
 * becomes "x"), unsafe characters become "_", leading and trailing dots and spaces are trimmed, Windows device names
 * get a "_" prefix, and the result is capped at `maxBytes` UTF-8 bytes keeping the extension. Never use it as a
 * storage path: store bytes under a random key.
 */
export function sanitizeFilename(name: string, maxBytes = 200): string {
  if (!Number.isInteger(maxBytes) || maxBytes < 16 || maxBytes > 255) throw new RangeError("maxBytes must be 16 to 255");
  const segments = String(name).normalize("NFC").split(/[\\/]/);
  const segment = segments[segments.length - 1] ?? "";
  const visible = segment.replace(INVISIBLE, "");
  let clean = visible.replace(UNSAFE, "_");
  // A stem made only of invisible characters ("\u3164.png") falls back to the default stem, keeping the extension.
  if (visible.startsWith(".") && !segment.startsWith(".")) clean = `file${clean}`;
  clean = clean.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "").replace(/\s+/g, " ");
  if (!clean || /^_+$/.test(clean)) return "file";
  if (RESERVED.test(clean)) clean = `_${clean}`;
  if (byteLength(clean) <= maxBytes) return clean;
  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 && clean.length - dot <= 11 ? clean.slice(dot) : "";
  const stem = truncateBytes(clean.slice(0, clean.length - extension.length), maxBytes - byteLength(extension)).replace(/[\s.]+$/, "");
  return stem ? stem + extension : truncateBytes(clean, maxBytes);
}
