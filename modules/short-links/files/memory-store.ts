// SPDX-License-Identifier: Apache-2.0
// In-memory ShortLinkStore for tests and prototypes. Per-process and lost on restart. recordClick
// checks and increments without awaiting in between, which is atomic within one JavaScript process;
// production needs the single conditional UPDATE in sql-store.ts (or its equivalent).
import type { LinkCursor, ShortLink, ShortLinkPatch, ShortLinkStore } from "./core.js";

export class MemoryShortLinkStore implements ShortLinkStore {
  readonly #byId = new Map<string, ShortLink>();
  readonly #idByCode = new Map<string, string>();

  async insert(link: ShortLink): Promise<boolean> {
    if (this.#byId.has(link.id)) throw new Error("Duplicate link id");
    if (this.#idByCode.has(link.code)) return false;
    this.#byId.set(link.id, { ...link });
    this.#idByCode.set(link.code, link.id);
    return true;
  }

  async findById(id: string): Promise<ShortLink | null> {
    const link = this.#byId.get(id);
    return link ? { ...link } : null;
  }

  async findByCode(code: string): Promise<ShortLink | null> {
    const id = this.#idByCode.get(code);
    return id === undefined ? null : this.findById(id);
  }

  async list(tenantId: string, page: { before: LinkCursor | null; limit: number }): Promise<ShortLink[]> {
    const { before } = page;
    return [...this.#byId.values()]
      .filter((link) => link.tenantId === tenantId)
      .filter((link) => !before || link.createdAt < before.createdAt || (link.createdAt === before.createdAt && link.id < before.id))
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .slice(0, page.limit)
      .map((link) => ({ ...link }));
  }

  async update(id: string, patch: ShortLinkPatch): Promise<ShortLink | null> {
    const link = this.#byId.get(id);
    if (!link) return null;
    const next = { ...link, ...patch };
    this.#byId.set(id, next);
    return { ...next };
  }

  async delete(id: string): Promise<boolean> {
    const link = this.#byId.get(id);
    if (!link) return false;
    this.#byId.delete(id);
    this.#idByCode.delete(link.code);
    return true;
  }

  async recordClick(code: string, at: number): Promise<{ id: string; url: string } | null> {
    const id = this.#idByCode.get(code);
    const link = id === undefined ? undefined : this.#byId.get(id);
    if (!link || link.disabled) return null;
    if (link.expiresAt !== null && link.expiresAt <= at) return null;
    if (link.maxClicks !== null && link.clicks >= link.maxClicks) return null;
    this.#byId.set(link.id, { ...link, clicks: link.clicks + 1, lastClickAt: at });
    return { id: link.id, url: link.url };
  }
}
