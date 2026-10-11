// SPDX-License-Identifier: Apache-2.0
// In-memory ApiKeyStore for tests and prototypes. Per-process and lost on restart. Each method checks and writes
// without awaiting in between, which is atomic within one JavaScript process; production needs the conditional
// UPDATEs in sql-store.ts (or their equivalent).
import type { ApiKeyRecord, ApiKeyStore } from "./core.js";

const copy = (record: ApiKeyRecord): ApiKeyRecord => ({ ...record, scopes: [...record.scopes] });

export class MemoryApiKeyStore implements ApiKeyStore {
  readonly #byId = new Map<string, ApiKeyRecord>();
  readonly #idByLookup = new Map<string, string>();

  async insert(record: ApiKeyRecord): Promise<boolean> {
    if (this.#byId.has(record.id)) throw new Error("Duplicate key id");
    if (this.#idByLookup.has(record.lookupId)) return false;
    this.#byId.set(record.id, copy(record));
    this.#idByLookup.set(record.lookupId, record.id);
    return true;
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    const record = this.#byId.get(id);
    return record ? copy(record) : null;
  }

  async findByLookupId(lookupId: string): Promise<ApiKeyRecord | null> {
    const id = this.#idByLookup.get(lookupId);
    return id === undefined ? null : this.findById(id);
  }

  async listByTenant(tenantId: string): Promise<ApiKeyRecord[]> {
    return [...this.#byId.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .map(copy);
  }

  async revoke(id: string, at: number, by: string): Promise<ApiKeyRecord | null> {
    const record = this.#byId.get(id);
    if (!record || record.revokedAt !== null) return null;
    const next = { ...record, revokedAt: at, revokedBy: by };
    this.#byId.set(id, next);
    return copy(next);
  }

  async touchLastUsed(id: string, at: number, notAfter: number): Promise<boolean> {
    const record = this.#byId.get(id);
    if (!record || record.revokedAt !== null) return false;
    if (record.lastUsedAt !== null && record.lastUsedAt > notAfter) return false;
    this.#byId.set(id, { ...record, lastUsedAt: at });
    return true;
  }
}
