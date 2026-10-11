// SPDX-License-Identifier: Apache-2.0
// Server-side file uploads with size, type, quota and scan checks, framework-neutral. The receiving application
// supplies the metadata store, the byte store (BlobStore), authorization and, optionally, a malware scanner through
// the interfaces below. This module includes NO antivirus engine: without a scanner every upload stays quarantined
// and is never served.
//
// Upload order: authorize -> declared Content-Length against the limit -> extension and declared type against the
// allowlist -> reserve quota atomically -> read the stream counting bytes (cancel at the limit) -> sniff the bytes
// -> store under a random key -> insert metadata as quarantined -> settle the quota to the real size. Any failure
// after the reservation releases it, and any early rejection cancels the request stream unread.
import { checkType, normalizePolicy, sanitizeFilename, sniffType, typeForExtension, declaredTypeAgrees, UPLOAD_TYPES } from "./policy.js";
import type { UploadPolicy, UploadPolicyInput, UploadTypeId } from "./policy.js";

export type UploadStatus = "quarantined" | "clean" | "infected";

export interface UploadRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerId: string;
  /** Random key in the BlobStore; never derived from the user's file name. */
  readonly storageKey: string;
  /** Sanitized display name, used only in Content-Disposition. */
  readonly filename: string;
  /** Media type detected from the bytes (and agreed with the extension and declared type). */
  readonly contentType: string;
  readonly size: number;
  readonly status: UploadStatus;
  readonly createdAt: number;
  readonly scannedAt?: number;
}

export interface UploadMetadataStore {
  insert(record: UploadRecord): Promise<void>;
  get(id: string): Promise<UploadRecord | null>;
  /** Changes the status only when it is currently `from`; returns the updated record or null. One conditional statement. */
  setStatus(id: string, from: UploadStatus, to: UploadStatus, at: number): Promise<UploadRecord | null>;
  /** Deletes the record and returns it as it was, or null when absent. Exactly one concurrent caller gets the record. */
  delete(id: string): Promise<UploadRecord | null>;
  /**
   * Atomically adds `bytes` to the tenant's usage when the result stays within `limit`; returns whether it did. Must be
   * ONE conditional statement (or an equivalent lock) so concurrent uploads cannot together exceed the quota.
   */
  reserve(tenantId: string, bytes: number, limit: number): Promise<boolean>;
  /** Subtracts `bytes` from the tenant's usage (never below zero). */
  release(tenantId: string, bytes: number): Promise<void>;
  usage(tenantId: string): Promise<number>;
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array, info: { readonly contentType: string }): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export type UploadAction = "upload" | "read" | "delete";
export type ScanVerdict = "clean" | "infected";

export interface FileUploadsOptions<User> {
  readonly metadata: UploadMetadataStore;
  readonly blobs: BlobStore;
  readonly policy: UploadPolicyInput;
  /** Return true when `user` may perform `action` in `tenantId`. Checked before any byte is read. */
  readonly authorize: (user: User, tenantId: string, action: UploadAction) => boolean | Promise<boolean>;
  /** Stored bytes allowed per tenant. */
  readonly quotaBytes: number | ((tenantId: string) => number | Promise<number>);
  /**
   * Your malware scanner (for example a ClamAV daemon or a scanning service). Return "clean" or "infected"; throw when
   * the scan could not complete. Not included: without it, use recordScanResult from your own pipeline.
   */
  readonly scanner?: (bytes: Uint8Array, record: UploadRecord) => Promise<ScanVerdict>;
  /** Owner id recorded on each upload. Default: `user.id` when present, else String(user). */
  readonly userId?: (user: User) => string;
  readonly now?: () => number;
  /** Random identifier source for record ids and storage keys. Default crypto.randomUUID. */
  readonly newId?: () => string;
}

export type FileUploadErrorCode =
  | "forbidden" | "not-found" | "too-large" | "quota-exceeded" | "unsupported-type" | "type-mismatch"
  | "bad-request" | "quarantined" | "infected" | "scan-failed";

export class FileUploadError extends Error {
  readonly code: FileUploadErrorCode;
  constructor(code: FileUploadErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "FileUploadError";
  }
}

export interface UploadInput<User> {
  readonly user: User;
  readonly tenantId: string;
  /** The client's file name; only a sanitized copy is kept. */
  readonly filename: string;
  /** The client's declared Content-Type. */
  readonly declaredType?: string | null;
  /** The request's Content-Length when present. */
  readonly contentLength?: number | null;
  readonly body: ReadableStream<Uint8Array> | Uint8Array | null;
}

export interface Download {
  readonly record: UploadRecord;
  readonly bytes: Uint8Array;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;

async function cancelQuietly(body: ReadableStream<Uint8Array> | Uint8Array | null, reader?: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    if (reader) await reader.cancel();
    else if (body && !(body instanceof Uint8Array) && !body.locked) await body.cancel();
  } catch {
    // The stream is already closed or errored; nothing more to stop.
  }
}

export function createFileUploads<User>(options: FileUploadsOptions<User>) {
  const policy: UploadPolicy = normalizePolicy(options.policy);
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { metadata, blobs } = options;

  async function quotaFor(tenantId: string): Promise<number> {
    const limit = typeof options.quotaBytes === "function" ? await options.quotaBytes(tenantId) : options.quotaBytes;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("quotaBytes must be a non-negative integer");
    return limit;
  }

  async function allowed(user: User, tenantId: string, action: UploadAction): Promise<boolean> {
    return (await options.authorize(user, tenantId, action)) === true;
  }

  /** Reads at most `limit` bytes; cancels the stream and throws too-large as soon as one more byte arrives. */
  async function readLimited(body: ReadableStream<Uint8Array> | Uint8Array, limit: number, declared: number | null): Promise<Uint8Array> {
    if (body instanceof Uint8Array) {
      if (body.byteLength > limit) throw new FileUploadError(declared !== null && body.byteLength > declared ? "bad-request" : "too-large", "Body too large");
      return body.slice();
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) throw new FileUploadError("bad-request", "Body chunks must be bytes");
        size += value.byteLength;
        if (size > limit) {
          // Over the declared length is a lying client (400); over the policy limit is too large (413).
          throw new FileUploadError(declared !== null && size > declared && declared < policy.maxBytes ? "bad-request" : "too-large", "Body too large");
        }
        chunks.push(value);
      }
    } catch (error) {
      await cancelQuietly(body, reader);
      if (error instanceof FileUploadError) throw error;
      throw new FileUploadError("bad-request", "Could not read the upload body");
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }

  async function upload(input: UploadInput<User>): Promise<UploadRecord> {
    const { body } = input;
    let reserved = 0;
    let consumed = false;
    try {
      if (typeof input.tenantId !== "string" || !ID.test(input.tenantId)) throw new FileUploadError("bad-request", "Invalid tenant");
      if (!(await allowed(input.user, input.tenantId, "upload"))) throw new FileUploadError("forbidden", "Not allowed to upload here");
      const declared = input.contentLength ?? null;
      if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0)) throw new FileUploadError("bad-request", "Invalid Content-Length");
      if (declared !== null && declared > policy.maxBytes) throw new FileUploadError("too-large", "File too large");
      if (declared === 0 || body === null) throw new FileUploadError("bad-request", "Empty file");
      if (typeof input.filename !== "string" || input.filename.trim() === "" || input.filename.length > 1024) throw new FileUploadError("bad-request", "Invalid file name");
      const filename = sanitizeFilename(input.filename, policy.maxFilenameBytes);
      const claimed = typeForExtension(filename, policy);
      if (!claimed) throw new FileUploadError("unsupported-type", "File type not accepted");
      if (!declaredTypeAgrees(input.declaredType, claimed, policy)) throw new FileUploadError("type-mismatch", "Declared type does not match the extension");

      const want = declared ?? policy.maxBytes;
      if (!(await metadata.reserve(input.tenantId, want, await quotaFor(input.tenantId)))) throw new FileUploadError("quota-exceeded", "Storage quota exceeded");
      reserved = want;

      consumed = true;
      const bytes = await readLimited(body, want, declared);
      if (bytes.byteLength === 0) throw new FileUploadError("bad-request", "Empty file");
      if (declared !== null && bytes.byteLength !== declared) throw new FileUploadError("bad-request", "Body length does not match Content-Length");

      const verdict = checkType(sniffType(bytes), filename, input.declaredType, policy);
      if (!verdict.ok) throw new FileUploadError(verdict.reason === "type-mismatch" ? "type-mismatch" : "unsupported-type", "File contents not accepted");
      const type: UploadTypeId = verdict.type;

      const record: UploadRecord = {
        id: newId(), tenantId: input.tenantId, ownerId: String(ownerOf(input.user)), storageKey: newId(), filename,
        contentType: UPLOAD_TYPES[type].mime, size: bytes.byteLength, status: "quarantined", createdAt: now(),
      };
      if (!ID.test(record.id) || !ID.test(record.storageKey) || record.id === record.storageKey) throw new RangeError("newId must return distinct ids of [A-Za-z0-9_-]");
      await blobs.put(record.storageKey, bytes, { contentType: record.contentType });
      try {
        await metadata.insert(record);
      } catch (error) {
        await blobs.delete(record.storageKey).catch(() => undefined);
        throw error;
      }
      // Settle the reservation to the real size; the record now owns `size` bytes of quota.
      const excess = reserved - record.size;
      reserved = 0;
      if (excess > 0) await metadata.release(record.tenantId, excess).catch(() => undefined);
      return record;
    } catch (error) {
      if (!consumed) await cancelQuietly(body);
      if (reserved > 0) await metadata.release(input.tenantId, reserved).catch(() => undefined);
      throw error;
    }
  }

  function ownerOf(user: User): string {
    if (options.userId) return options.userId(user);
    if (user && typeof user === "object" && "id" in user) return String((user as { id: unknown }).id);
    return String(user);
  }

  async function findAuthorized(user: User, id: string, action: UploadAction): Promise<UploadRecord> {
    if (typeof id !== "string" || !ID.test(id)) throw new FileUploadError("not-found", "File not found");
    const record = await metadata.get(id);
    // Another tenant's file looks exactly like a missing one.
    if (!record || !(await allowed(user, record.tenantId, action))) throw new FileUploadError("not-found", "File not found");
    return record;
  }

  /** Returns a clean file's bytes for an authorized reader. Quarantined and infected files are never returned. */
  async function download(user: User, id: string): Promise<Download> {
    const record = await findAuthorized(user, id, "read");
    if (record.status === "quarantined") throw new FileUploadError("quarantined", "File is waiting for its malware scan");
    if (record.status !== "clean") throw new FileUploadError("infected", "File failed its malware scan");
    const bytes = await blobs.get(record.storageKey);
    if (!bytes) throw new FileUploadError("not-found", "File not found");
    return { record, bytes };
  }

  async function remove(user: User, id: string): Promise<void> {
    await findAuthorized(user, id, "delete");
    const removed = await metadata.delete(id);
    if (!removed) throw new FileUploadError("not-found", "File not found");
    // Infected files released their quota when they were marked.
    if (removed.status !== "infected") await metadata.release(removed.tenantId, removed.size);
    await blobs.delete(removed.storageKey);
  }

  /** Applies a verdict from your own scanning pipeline. Infected bytes are deleted and their quota released. */
  async function recordScanResult(id: string, verdict: ScanVerdict): Promise<UploadRecord | null> {
    if (verdict !== "clean" && verdict !== "infected") throw new FileUploadError("scan-failed", "Unknown scan verdict");
    const updated = await metadata.setStatus(id, "quarantined", verdict, now());
    if (updated && verdict === "infected") {
      await metadata.release(updated.tenantId, updated.size);
      await blobs.delete(updated.storageKey);
    }
    return updated;
  }

  /** Runs the injected scanner on a quarantined file. A failed or unrecognized scan leaves it quarantined. */
  async function scan(id: string): Promise<UploadRecord | null> {
    if (!options.scanner) throw new FileUploadError("scan-failed", "No scanner configured; files stay quarantined");
    const record = await metadata.get(id);
    if (!record || record.status !== "quarantined") return record;
    const bytes = await blobs.get(record.storageKey);
    if (!bytes) throw new FileUploadError("scan-failed", "Stored bytes are missing");
    let verdict: unknown;
    try {
      verdict = await options.scanner(bytes, record);
    } catch {
      throw new FileUploadError("scan-failed", "Scanner failed; the file stays quarantined");
    }
    if (verdict !== "clean" && verdict !== "infected") throw new FileUploadError("scan-failed", "Scanner returned no verdict; the file stays quarantined");
    return recordScanResult(id, verdict);
  }

  return { upload, download, remove, scan, recordScanResult, usage: (tenantId: string) => metadata.usage(tenantId), policy };
}

export type FileUploads<User> = ReturnType<typeof createFileUploads<User>>;
