// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: file type detection from leading bytes (magic numbers). Original source; copy and adapt.
// Detection is a first check, not a malware scan: still re-encode or sandbox untrusted files and enforce size
// limits. Checks run in a fixed order, the first match wins and at most the first 64 bytes are read, so pass
// only the head of a large upload. Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and
// Dart file-signature modules (shared vectors).

/** A detected format: IANA media type and canonical extension (no dot). */
export interface FileType { mime: string; extension: string }

const FTYP: Record<string, [string, string]> = {
  avif: ["image/avif", "avif"], avis: ["image/avif", "avif"], heic: ["image/heic", "heic"], heix: ["image/heic", "heic"],
  mif1: ["image/heif", "heif"], msf1: ["image/heif", "heif"], "qt  ": ["video/quicktime", "mov"], "M4A ": ["audio/mp4", "m4a"],
  "3gp4": ["video/3gpp", "3gp"], "3gp5": ["video/3gpp", "3gp"],
};
const ZIP_EXTENSIONS = new Set(["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub"]);
const ALIASES: Record<string, string> = { jpeg: "jpg", jpe: "jpg", tiff: "tif" };

function at(b: Uint8Array, offset: number, sig: string): boolean {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig.charCodeAt(i)) return false;
  return true;
}
const t = (mime: string, extension: string): FileType => ({ mime, extension });

/** The detected format of the leading bytes, or null. Not a malware scan; re-encode or sandbox untrusted files. */
export function detectFileType(data: Uint8Array | ArrayLike<number>): FileType | null {
  const b = Uint8Array.from(Array.prototype.slice.call(data, 0, 64) as number[]);
  if (at(b, 0, "\x89PNG\r\n\x1a\n")) return t("image/png", "png");
  if (at(b, 0, "\xff\xd8\xff")) return t("image/jpeg", "jpg");
  if (at(b, 0, "GIF87a") || at(b, 0, "GIF89a")) return t("image/gif", "gif");
  const riff = at(b, 0, "RIFF");
  if (riff && at(b, 8, "WEBP")) return t("image/webp", "webp");
  if (riff && at(b, 8, "WAVE")) return t("audio/wav", "wav");
  if (riff && at(b, 8, "AVI ")) return t("video/x-msvideo", "avi");
  if (at(b, 0, "BM") && b.length >= 14) return t("image/bmp", "bmp");
  if (at(b, 0, "\x00\x00\x01\x00")) return t("image/x-icon", "ico");
  if (at(b, 0, "II*\x00") || at(b, 0, "MM\x00*")) return t("image/tiff", "tif");
  if (at(b, 0, "%PDF-")) return t("application/pdf", "pdf");
  if (at(b, 0, "PK\x03\x04") || at(b, 0, "PK\x05\x06")) return t("application/zip", "zip");
  if (at(b, 0, "\x1f\x8b")) return t("application/gzip", "gz");
  if (at(b, 0, "7z\xbc\xaf\x27\x1c")) return t("application/x-7z-compressed", "7z");
  if (at(b, 0, "Rar!\x1a\x07")) return t("application/vnd.rar", "rar");
  if (at(b, 0, "SQLite format 3\x00")) return t("application/vnd.sqlite3", "sqlite");
  if (at(b, 0, "\x00asm")) return t("application/wasm", "wasm");
  if (at(b, 0, "OggS")) return t("audio/ogg", "ogg");
  if (at(b, 0, "fLaC")) return t("audio/flac", "flac");
  const b0 = b[0] ?? 0, b1 = b[1] ?? 0;
  if (at(b, 0, "ID3") || (b.length >= 2 && b0 === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0)) return t("audio/mpeg", "mp3");
  if (at(b, 0, "\x1aE\xdf\xa3")) return t("video/webm", "webm");
  if (at(b, 4, "ftyp") && b.length >= 12) {
    const brand = String.fromCharCode(...b.subarray(8, 12)), known = Object.hasOwn(FTYP, brand) ? FTYP[brand] : undefined;
    return known ? t(known[0], known[1]) : t("video/mp4", "mp4");
  }
  if (at(b, 0, "wOFF")) return t("font/woff", "woff");
  if (at(b, 0, "wOF2")) return t("font/woff2", "woff2");
  return null;
}

/** True when the detected type agrees with the file name's extension (case-insensitive; zip covers docx etc.). */
export function matchesExtension(data: Uint8Array | ArrayLike<number>, filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return false;
  let ext = filename.slice(dot + 1).toLowerCase();
  ext = Object.hasOwn(ALIASES, ext) ? (ALIASES[ext] as string) : ext;
  const found = detectFileType(data);
  if (!found) return false;
  if (found.extension === "zip") return ZIP_EXTENSIONS.has(ext);
  if (found.extension === "heic") return ext === "heic" || ext === "heif";
  return ext === found.extension;
}
