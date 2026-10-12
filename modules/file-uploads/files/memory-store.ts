// SPDX-License-Identifier: Apache-2.0
// Per-process reference stores for tests and prototypes. Every method finishes its check-and-change synchronously,
// so concurrent calls in one process cannot interleave inside a reservation or status change. Use a shared database
// and object storage in production.
import type { BlobStore, UploadMetadataStore, UploadRecord, UploadStatus } from "./core.js";

export class MemoryUploadMetadataStore implements UploadMetadataStore {
  #records = new Map<string, UploadRecord>();
  #usage = new Map<string, number>();

  async insert(record: UploadRecord): Promise<void> {
    if (this.#records.has(record.id)) throw new Error("Duplicate upload id");
    for (const existing of this.#records.values()) if (existing.storageKey === record.storageKey) throw new Error("Duplicate storage key");
    this.#records.set(record.id, { ...record });
  }

  async get(id: string): Promise<UploadRecord | null> {
    const record = this.#records.get(id);
    return record ? { ...record } : null;
  }

  async setStatus(id: string, from: UploadStatus, to: UploadStatus, at: number): Promise<UploadRecord | null> {
    const record = this.#records.get(id);
    if (!record || record.status !== from) return null;
    const { scanClaimedUntil: _claim, ...rest } = record;
    const updated: UploadRecord = { ...rest, status: to, scannedAt: at };
    this.#records.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<UploadRecord | null> {
    const record = this.#records.get(id);
    if (!record) return null;
    this.#records.delete(id);
    return { ...record };
  }

  async reserve(tenantId: string, bytes: number, limit: number): Promise<boolean> {
    const used = this.#usage.get(tenantId) ?? 0;
    if (used + bytes > limit) return false;
    this.#usage.set(tenantId, used + bytes);
    return true;
  }

  async release(tenantId: string, bytes: number): Promise<void> {
    this.#usage.set(tenantId, Math.max(0, (this.#usage.get(tenantId) ?? 0) - bytes));
  }

  async usage(tenantId: string): Promise<number> {
    return this.#usage.get(tenantId) ?? 0;
  }

  async claimScan(id: string, now: number, until: number): Promise<UploadRecord | null> {
    const record = this.#records.get(id);
    if (!record || record.status !== "quarantined" || (record.scanClaimedUntil !== undefined && record.scanClaimedUntil > now)) return null;
    const claimed: UploadRecord = { ...record, scanClaimedUntil: until };
    this.#records.set(id, claimed);
    return { ...claimed };
  }

  async releaseScanClaim(id: string, until: number): Promise<void> {
    const record = this.#records.get(id);
    if (!record || record.scanClaimedUntil !== until) return;
    const { scanClaimedUntil: _claim, ...rest } = record;
    this.#records.set(id, rest);
  }

  async listQuarantined(now: number, limit: number): Promise<UploadRecord[]> {
    return [...this.#records.values()]
      .filter((record) => record.status === "quarantined" && (record.scanClaimedUntil === undefined || record.scanClaimedUntil <= now))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit)
      .map((record) => ({ ...record }));
  }

  /** Test helper: a snapshot of every record. */
  dump(): UploadRecord[] {
    return [...this.#records.values()].map((record) => ({ ...record }));
  }
}

/** In-memory BlobStore. Copies bytes on the way in and out so callers cannot mutate stored content. */
export class MemoryBlobStore implements BlobStore {
  #blobs = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(key: string, bytes: Uint8Array, info: { readonly contentType: string }): Promise<void> {
    if (this.#blobs.has(key)) throw new Error("Blob key already exists");
    this.#blobs.set(key, { bytes: bytes.slice(), contentType: info.contentType });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const blob = this.#blobs.get(key);
    return blob ? blob.bytes.slice() : null;
  }

  async delete(key: string): Promise<void> {
    this.#blobs.delete(key);
  }

  /** Test helper: stored keys. */
  keys(): string[] {
    return [...this.#blobs.keys()];
  }
}
