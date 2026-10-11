// SPDX-License-Identifier: Apache-2.0
// In-memory PasswordResetStore for tests and prototypes. Per-process and lost on restart: production needs a
// table with a unique token_hash and a single conditional consume (see schema.sql and sql-store.ts).
import type { PasswordResetStore, ResetToken } from "./core.js";

export class MemoryPasswordResetStore implements PasswordResetStore {
  readonly #byId = new Map<string, ResetToken>();

  /** Copies of every stored row (for tests that check what is persisted). */
  dump(): ResetToken[] {
    return [...this.#byId.values()].map((item) => ({ ...item }));
  }

  async insert(token: ResetToken): Promise<void> {
    if (this.#byId.has(token.id)) throw new Error("Duplicate token id");
    for (const item of this.#byId.values()) if (item.tokenHash === token.tokenHash) throw new Error("Duplicate token hash");
    this.#byId.set(token.id, { ...token });
  }

  async findByTokenHash(tokenHash: string): Promise<ResetToken | null> {
    for (const item of this.#byId.values()) if (item.tokenHash === tokenHash) return { ...item };
    return null;
  }

  async listPending(userId: string, now: number): Promise<ResetToken[]> {
    return [...this.#byId.values()]
      .filter((item) => item.userId === userId && item.usedAt === undefined && item.revokedAt === undefined && now < item.expiresAt)
      .reverse()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((item) => ({ ...item }));
  }

  async consume(tokenHash: string, now: number): Promise<ResetToken | null> {
    // No await between the check and the write, so this is atomic within one process.
    for (const [id, item] of this.#byId) {
      if (item.tokenHash !== tokenHash) continue;
      if (item.usedAt !== undefined || item.revokedAt !== undefined || now >= item.expiresAt) return null;
      const used = { ...item, usedAt: now };
      this.#byId.set(id, used);
      return { ...used };
    }
    return null;
  }

  async revoke(id: string, now: number): Promise<boolean> {
    const item = this.#byId.get(id);
    if (!item || item.usedAt !== undefined || item.revokedAt !== undefined) return false;
    this.#byId.set(id, { ...item, revokedAt: now });
    return true;
  }

  async revokePending(userId: string, now: number, exceptId?: string): Promise<number> {
    let changed = 0;
    for (const [id, item] of this.#byId) {
      if (item.userId !== userId || id === exceptId || item.usedAt !== undefined || item.revokedAt !== undefined) continue;
      this.#byId.set(id, { ...item, revokedAt: now });
      changed++;
    }
    return changed;
  }
}
