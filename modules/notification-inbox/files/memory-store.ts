// SPDX-License-Identifier: Apache-2.0
// In-memory InboxStore for tests and prototypes. Per-process and lost on restart: production needs
// the table and indexes described at the top of core.ts, with updateMany as one scoped statement:
//   UPDATE inbox_items SET read_at = COALESCE(read_at, $3)
//   WHERE tenant_id = $1 AND user_id = $2 AND id = ANY($4);
import type { DeleteRule, InboxItem, InboxStore, ItemPatch, PageQuery, Recipient, UpdateTarget } from "./core.js";

type Row = { -readonly [K in keyof InboxItem]: InboxItem[K] };

const owns = (item: InboxItem, recipient: Recipient): boolean =>
  item.tenantId === recipient.tenantId && item.userId === recipient.userId;

/** Newest first: createdAt descending, then id descending. */
const newestFirst = (a: InboxItem, b: InboxItem): number =>
  b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const copy = (item: InboxItem): InboxItem => structuredClone(item);

export class MemoryInboxStore implements InboxStore {
  readonly #byId = new Map<string, Row>();

  async insert(item: InboxItem): Promise<boolean> {
    if (this.#byId.has(item.id)) throw new Error("Duplicate inbox item id");
    if (item.dedupeKey !== undefined) {
      for (const row of this.#byId.values()) if (owns(row, item) && row.dedupeKey === item.dedupeKey) return false;
    }
    this.#byId.set(item.id, structuredClone(item) as Row);
    return true;
  }

  async findByDedupe(recipient: Recipient, dedupeKey: string): Promise<InboxItem | null> {
    for (const row of this.#byId.values()) if (owns(row, recipient) && row.dedupeKey === dedupeKey) return copy(row);
    return null;
  }

  async page(recipient: Recipient, query: PageQuery): Promise<InboxItem[]> {
    const { before } = query;
    return [...this.#byId.values()]
      .filter((row) => owns(row, recipient) && row.archivedAt === undefined && (!query.unreadOnly || row.readAt === undefined))
      .filter((row) => !before || row.createdAt < before.createdAt || (row.createdAt === before.createdAt && row.id < before.id))
      .sort(newestFirst)
      .slice(0, query.limit)
      .map(copy);
  }

  async countUnread(recipient: Recipient): Promise<number> {
    let count = 0;
    for (const row of this.#byId.values()) if (owns(row, recipient) && row.readAt === undefined && row.archivedAt === undefined) count += 1;
    return count;
  }

  async updateMany(recipient: Recipient, target: UpdateTarget, patch: ItemPatch): Promise<number> {
    let changed = 0;
    const ids = "ids" in target ? new Set(target.ids) : null;
    // Synchronous loop: no await between read and write, so the update is atomic in this process.
    for (const row of this.#byId.values()) {
      if (!owns(row, recipient)) continue;
      if (ids ? !ids.has(row.id) : row.createdAt > (target as { createdAtOrBefore: number }).createdAtOrBefore || row.archivedAt !== undefined) continue;
      if ("readAt" in patch && row.readAt === undefined) { row.readAt = patch.readAt; changed += 1; }
      if ("archivedAt" in patch && row.archivedAt === undefined) { row.archivedAt = patch.archivedAt; changed += 1; }
    }
    return changed;
  }

  async deleteWhere(rule: DeleteRule): Promise<number> {
    const doomed: string[] = [];
    if ("createdBefore" in rule) {
      for (const row of this.#byId.values()) {
        if (row.createdAt < rule.createdBefore && (!rule.recipient || owns(row, rule.recipient))) doomed.push(row.id);
      }
    } else {
      const byUser = new Map<string, Row[]>();
      for (const row of this.#byId.values()) {
        const key = JSON.stringify([row.tenantId, row.userId]);
        const rows = byUser.get(key) ?? [];
        rows.push(row);
        byUser.set(key, rows);
      }
      for (const rows of byUser.values()) doomed.push(...rows.sort(newestFirst).slice(rule.keepNewestPerUser).map((row) => row.id));
    }
    for (const id of doomed) this.#byId.delete(id);
    return doomed.length;
  }
}
