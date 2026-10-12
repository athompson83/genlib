// SPDX-License-Identifier: Apache-2.0
// Browser-safe upload preflight. Works on File and Blob objects or any File-like value ({name, size, type} plus an
// optional slice(start, end) whose result has arrayBuffer()). It refuses files that are empty, too large, badly
// named, outside the allowlist or whose leading bytes contradict the extension, before any byte is sent. It is a
// convenience for users, not a control: the server repeats every check on the bytes it actually receives.
import { checkType, normalizePolicy, sanitizeFilename, sniffType, typeForExtension, declaredTypeAgrees } from "./policy.js";
import type { UploadPolicy, UploadPolicyInput, UploadTypeId } from "./policy.js";

export interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  slice?(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export type PreflightReason = "empty" | "too-large" | "bad-name" | "type-not-allowed" | "type-mismatch";

export type PreflightResult =
  | { readonly ok: true; readonly type: UploadTypeId; readonly filename: string; readonly sniffed: boolean }
  | { readonly ok: false; readonly reason: PreflightReason; readonly message: string };

/** Bytes read from the head of the file for sniffing. Text files are judged on this head only in the browser. */
const HEAD_BYTES = 4096;

const MESSAGES: Record<PreflightReason, string> = {
  empty: "The file is empty.",
  "too-large": "The file is larger than the upload limit.",
  "bad-name": "The file name is not valid.",
  "type-not-allowed": "This type of file is not accepted.",
  "type-mismatch": "The file's contents do not match its extension or type.",
};
const fail = (reason: PreflightReason): PreflightResult => ({ ok: false, reason, message: MESSAGES[reason] });

/**
 * Checks a file against the same policy the server enforces. Size, name, extension and declared type are checked
 * from metadata; when the object supports slice(), the first 4 KiB are sniffed too (`sniffed: true`).
 */
export async function preflight(file: FileLike, policyInput: UploadPolicyInput | UploadPolicy): Promise<PreflightResult> {
  const policy = normalizePolicy(policyInput);
  if (!Number.isSafeInteger(file.size) || file.size < 0) return fail("bad-name");
  if (file.size === 0) return fail("empty");
  if (file.size > policy.maxBytes) return fail("too-large");
  if (typeof file.name !== "string" || file.name.trim() === "") return fail("bad-name");
  const filename = sanitizeFilename(file.name, { maxBytes: policy.maxFilenameBytes, filenameControls: policy.filenameControls, invalidFilenames: policy.invalidFilenames });
  if (filename === null) return fail("bad-name");
  const claimed = typeForExtension(filename, policy);
  if (!claimed) return fail("type-not-allowed");
  if (!declaredTypeAgrees(file.type, claimed, policy)) return fail("type-mismatch");
  if (typeof file.slice !== "function") return { ok: true, type: claimed, filename, sniffed: false };
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, Math.min(file.size, HEAD_BYTES)).arrayBuffer());
  } catch {
    return { ok: true, type: claimed, filename, sniffed: false };
  }
  // A text head can end mid-character when the file is longer than the slice; trim an incomplete UTF-8 tail.
  const sample = file.size > head.length ? trimPartialUtf8(head) : head;
  const verdict = checkType(sniffType(sample), filename, file.type, policy);
  return verdict.ok ? { ok: true, type: verdict.type, filename, sniffed: true } : fail(verdict.reason);
}

function trimPartialUtf8(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  // Walk back over at most 3 continuation bytes to the lead byte of the last character.
  let index = end - 1;
  while (index >= 0 && end - index <= 4 && ((bytes[index] ?? 0) & 0xc0) === 0x80) index--;
  if (index < 0) return bytes;
  const lead = bytes[index] ?? 0;
  const needed = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  if (end - index < needed) end = index;
  return bytes.subarray(0, end);
}
