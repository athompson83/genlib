// SPDX-License-Identifier: Apache-2.0
// In-memory AccountDeletionStore for tests and prototypes. Per-process and lost on restart. Each method checks and
// writes without awaiting in between, which is atomic within one JavaScript process; production needs the
// conditional statements in sql-store.ts (or their equivalent) so separate worker processes claim each request once.
import type { AccountDeletionStore, DeletionRequest } from "./core.js";

const live = (request: DeletionRequest) => request.status !== "cancelled";
const copy = (request: DeletionRequest): DeletionRequest => ({ ...request, completedSteps: [...request.completedSteps] });

export class MemoryAccountDeletionStore implements AccountDeletionStore {
  readonly #byId = new Map<string, DeletionRequest>();

  async insert(request: DeletionRequest): Promise<boolean> {
    if (this.#byId.has(request.id)) throw new Error("Duplicate request id");
    for (const existing of this.#byId.values()) if (existing.userId === request.userId && live(existing)) return false;
    this.#byId.set(request.id, copy(request));
    return true;
  }

  async findById(id: string): Promise<DeletionRequest | null> {
    const request = this.#byId.get(id);
    return request ? copy(request) : null;
  }

  async findLatest(userId: string): Promise<DeletionRequest | null> {
    let latest: DeletionRequest | undefined;
    for (const request of this.#byId.values()) {
      if (request.userId !== userId) continue;
      if (!latest || request.requestedAt > latest.requestedAt || (request.requestedAt === latest.requestedAt && request.id > latest.id)) latest = request;
    }
    return latest ? copy(latest) : null;
  }

  async discard(id: string): Promise<boolean> {
    const request = this.#byId.get(id);
    if (!request || request.status !== "pending") return false;
    return this.#byId.delete(id);
  }

  async cancel(id: string, by: string, at: number): Promise<DeletionRequest | null> {
    const request = this.#byId.get(id);
    if (!request || request.status !== "pending" || request.scheduledFor <= at) return null;
    const next: DeletionRequest = { ...request, status: "cancelled", cancelledAt: at, cancelledBy: by };
    this.#byId.set(id, next);
    return copy(next);
  }

  async claimDue(at: number, limit: number, token: string, leaseUntil: number): Promise<DeletionRequest[]> {
    const due = [...this.#byId.values()]
      .filter((r) => (r.status === "pending" && r.scheduledFor <= at) || (r.status === "executing" && r.claimExpiresAt !== null && r.claimExpiresAt <= at))
      .sort((a, b) => a.scheduledFor - b.scheduledFor || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit);
    return due.map((request) => {
      const next: DeletionRequest = { ...request, status: "executing", claimToken: token, claimExpiresAt: leaseUntil, attempts: request.attempts + 1 };
      this.#byId.set(request.id, next);
      return copy(next);
    });
  }

  async renew(id: string, token: string, leaseUntil: number): Promise<boolean> {
    const request = this.#byId.get(id);
    if (!request || request.status !== "executing" || request.claimToken !== token) return false;
    this.#byId.set(id, { ...request, claimExpiresAt: leaseUntil });
    return true;
  }

  async recordStep(id: string, token: string, step: string, leaseUntil: number): Promise<boolean> {
    const request = this.#byId.get(id);
    if (!request || request.status !== "executing" || request.claimToken !== token) return false;
    const steps = request.completedSteps.includes(step) ? request.completedSteps : [...request.completedSteps, step];
    this.#byId.set(id, { ...request, completedSteps: steps, claimExpiresAt: leaseUntil });
    return true;
  }

  async complete(id: string, token: string, at: number): Promise<boolean> {
    const request = this.#byId.get(id);
    if (!request || request.status !== "executing" || request.claimToken !== token) return false;
    this.#byId.set(id, { ...request, status: "completed", completedAt: at, claimToken: null, claimExpiresAt: null, lastError: null });
    return true;
  }

  async release(id: string, token: string, retryAt: number, error: string): Promise<boolean> {
    const request = this.#byId.get(id);
    if (!request || request.status !== "executing" || request.claimToken !== token) return false;
    this.#byId.set(id, { ...request, claimToken: null, claimExpiresAt: retryAt, lastError: error });
    return true;
  }
}
