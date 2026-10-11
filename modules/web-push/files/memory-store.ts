// SPDX-License-Identifier: Apache-2.0
// In-memory PushSubscriptionStore for tests and prototypes. Per-process and lost on restart; production needs a
// table keyed by endpoint (schema.sql and sql-store.ts on PostgreSQL).
import type { PushSubscriptionRecord, PushSubscriptionStore } from "./push.js";

export class MemoryPushSubscriptionStore implements PushSubscriptionStore {
  readonly #byEndpoint = new Map<string, PushSubscriptionRecord>();

  async upsert(subscription: Omit<PushSubscriptionRecord, "lastSuccessAt" | "failureCount">): Promise<PushSubscriptionRecord> {
    const existing = this.#byEndpoint.get(subscription.endpoint);
    const record: PushSubscriptionRecord = {
      ...subscription,
      createdAt: existing?.createdAt ?? subscription.createdAt,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      failureCount: 0,
    };
    this.#byEndpoint.set(record.endpoint, record);
    return { ...record };
  }

  async listByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    return [...this.#byEndpoint.values()].filter((item) => item.userId === userId).map((item) => ({ ...item }));
  }

  async remove(endpoint: string, userId?: string): Promise<boolean> {
    const existing = this.#byEndpoint.get(endpoint);
    if (!existing || (userId !== undefined && existing.userId !== userId)) return false;
    return this.#byEndpoint.delete(endpoint);
  }

  async recordSuccess(endpoint: string, at: number): Promise<void> {
    const existing = this.#byEndpoint.get(endpoint);
    if (existing) this.#byEndpoint.set(endpoint, { ...existing, lastSuccessAt: at, failureCount: 0 });
  }

  async recordFailure(endpoint: string): Promise<number | null> {
    const existing = this.#byEndpoint.get(endpoint);
    if (!existing) return null;
    const failureCount = existing.failureCount + 1;
    this.#byEndpoint.set(endpoint, { ...existing, failureCount });
    return failureCount;
  }
}
