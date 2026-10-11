// SPDX-License-Identifier: Apache-2.0
// In-memory WebhookDeliveryStore for tests and prototypes. Single process, no durability, and the `tx` argument is
// ignored, so enqueue is not atomic with your own writes. Use the SQL store (or your own) in production.
import type {
  AttemptRecord, CompletePatch, DeliveryFilter, DeliveryRecord, EndpointPatch, StoredEndpoint, WebhookDeliveryStore,
} from "./core.js";

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryWebhookStore implements WebhookDeliveryStore<unknown> {
  #endpoints = new Map<string, StoredEndpoint>();
  #deliveries = new Map<string, DeliveryRecord>();
  #attempts: AttemptRecord[] = [];

  async insertEndpoint(endpoint: StoredEndpoint): Promise<void> {
    if (this.#endpoints.has(endpoint.id)) throw new Error("Duplicate endpoint id");
    this.#endpoints.set(endpoint.id, clone(endpoint));
  }

  async getEndpoint(tenantId: string, id: string): Promise<StoredEndpoint | null> {
    const endpoint = this.#endpoints.get(id);
    return endpoint && endpoint.tenantId === tenantId ? clone(endpoint) : null;
  }

  async listEndpoints(tenantId: string): Promise<StoredEndpoint[]> {
    return [...this.#endpoints.values()].filter(e => e.tenantId === tenantId).sort((a, b) => a.createdAt - b.createdAt).map(clone);
  }

  async updateEndpoint(tenantId: string, id: string, expectedVersion: number, patch: EndpointPatch, updatedAt: number): Promise<StoredEndpoint | null> {
    const endpoint = this.#endpoints.get(id);
    if (!endpoint || endpoint.tenantId !== tenantId || endpoint.version !== expectedVersion) return null;
    const next: StoredEndpoint = { ...endpoint, ...clone(patch), version: endpoint.version + 1, updatedAt };
    this.#endpoints.set(id, next);
    return clone(next);
  }

  async deleteEndpoint(tenantId: string, id: string): Promise<boolean> {
    const endpoint = this.#endpoints.get(id);
    if (!endpoint || endpoint.tenantId !== tenantId) return false;
    return this.#endpoints.delete(id);
  }

  async endpointsForEvent(tenantId: string, eventType: string): Promise<StoredEndpoint[]> {
    return (await this.listEndpoints(tenantId)).filter(e => e.enabled && (e.eventTypes === null || e.eventTypes.includes(eventType)));
  }

  async insertDeliveries(rows: readonly DeliveryRecord[]): Promise<DeliveryRecord[]> {
    const out: DeliveryRecord[] = [];
    for (const row of rows) {
      const existing = [...this.#deliveries.values()].find(d => d.endpointId === row.endpointId && d.eventId === row.eventId);
      if (existing) { out.push(clone(existing)); continue; }
      if (this.#deliveries.has(row.id)) throw new Error("Duplicate delivery id");
      this.#deliveries.set(row.id, clone(row));
      out.push(clone(row));
    }
    return out;
  }

  async claim({ now, limit, workerId, leaseMs }: { now: number; limit: number; workerId: string; leaseMs: number }): Promise<DeliveryRecord[]> {
    const due = [...this.#deliveries.values()]
      .filter(d => (d.status === "pending" && d.nextAttemptAt <= now) || (d.status === "delivering" && (d.leaseExpiresAt ?? 0) < now))
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt)
      .slice(0, limit);
    return due.map(d => {
      const next: DeliveryRecord = { ...d, status: "delivering", leaseOwner: workerId, leaseExpiresAt: now + leaseMs, attempts: d.attempts + 1 };
      this.#deliveries.set(d.id, next);
      return clone(next);
    });
  }

  async complete(id: string, workerId: string, patch: CompletePatch): Promise<boolean> {
    const d = this.#deliveries.get(id);
    if (!d || d.status !== "delivering" || d.leaseOwner !== workerId) return false;
    this.#deliveries.set(id, {
      ...d, status: patch.status, leaseOwner: null, leaseExpiresAt: null,
      nextAttemptAt: patch.nextAttemptAt ?? d.nextAttemptAt,
      lastError: patch.lastError === undefined ? d.lastError : patch.lastError,
      lastStatusCode: patch.lastStatusCode === undefined ? d.lastStatusCode : patch.lastStatusCode,
      completedAt: patch.completedAt === undefined ? d.completedAt : patch.completedAt,
    });
    return true;
  }

  async renewLease(id: string, workerId: string, leaseExpiresAt: number): Promise<boolean> {
    const d = this.#deliveries.get(id);
    if (!d || d.status !== "delivering" || d.leaseOwner !== workerId) return false;
    this.#deliveries.set(id, { ...d, leaseExpiresAt });
    return true;
  }

  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    this.#attempts.push(clone(attempt));
  }

  async getDelivery(tenantId: string, id: string): Promise<DeliveryRecord | null> {
    const d = this.#deliveries.get(id);
    return d && d.tenantId === tenantId ? clone(d) : null;
  }

  async listDeliveries(tenantId: string, filter: DeliveryFilter): Promise<DeliveryRecord[]> {
    return [...this.#deliveries.values()]
      .filter(d => d.tenantId === tenantId && (filter.endpointId === undefined || d.endpointId === filter.endpointId)
        && (filter.status === undefined || d.status === filter.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, filter.limit)
      .map(clone);
  }

  async listAttempts(tenantId: string, deliveryId: string): Promise<AttemptRecord[]> {
    return this.#attempts.filter(a => a.tenantId === tenantId && a.deliveryId === deliveryId).sort((a, b) => a.startedAt - b.startedAt).map(clone);
  }

  async replay(tenantId: string, id: string, now: number): Promise<DeliveryRecord | null> {
    const d = this.#deliveries.get(id);
    if (!d || d.tenantId !== tenantId || (d.status !== "dead" && d.status !== "succeeded")) return null;
    const next: DeliveryRecord = { ...d, status: "pending", attempts: 0, nextAttemptAt: now, leaseOwner: null, leaseExpiresAt: null, completedAt: null };
    this.#deliveries.set(id, next);
    return clone(next);
  }
}
