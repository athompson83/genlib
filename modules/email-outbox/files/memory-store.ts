// SPDX-License-Identifier: Apache-2.0
// In-memory EmailOutboxStore for tests and prototypes. Each method runs synchronously between awaits, so claims
// and conditional transitions are atomic within one process. Data is lost on restart; use sql-store.ts in production.
import type { CompletePatch, EmailMessage, EmailOutboxStore, EmailStatus } from "./core.js";

export class MemoryEmailOutboxStore implements EmailOutboxStore {
  readonly #byId = new Map<string, EmailMessage>();
  readonly #byKey = new Map<string, string>();
  readonly #suppressed = new Map<string, { reason: string; at: number }>();

  #copy(message: EmailMessage | undefined): EmailMessage | null {
    return message ? { ...message, tags: { ...message.tags } } : null;
  }

  /** All messages, for inspection in tests. */
  all(): EmailMessage[] { return [...this.#byId.values()].map((m) => this.#copy(m)!); }
  suppressions(): { address: string; reason: string; at: number }[] {
    return [...this.#suppressed].map(([address, entry]) => ({ address, ...entry }));
  }

  async insertIfAbsent(message: EmailMessage): Promise<EmailMessage> {
    const existing = this.#byKey.get(message.key);
    if (existing !== undefined) return this.#copy(this.#byId.get(existing))!;
    this.#byId.set(message.id, { ...message, tags: { ...message.tags } });
    this.#byKey.set(message.key, message.id);
    return this.#copy(message)!;
  }

  async findByKey(key: string) {
    const id = this.#byKey.get(key);
    return id === undefined ? null : this.#copy(this.#byId.get(id));
  }

  async findByProviderId(providerId: string) {
    for (const message of this.#byId.values()) if (message.providerId === providerId) return this.#copy(message);
    return null;
  }

  async claim({ now, limit, workerId, leaseMs }: { now: number; limit: number; workerId: string; leaseMs: number }) {
    const due = [...this.#byId.values()]
      .filter((m) => (m.status === "queued" && m.nextAttemptAt <= now) || (m.status === "sending" && (m.leaseExpiresAt ?? 0) < now))
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt)
      .slice(0, limit);
    return due.map((m) => {
      const claimed: EmailMessage = { ...m, status: "sending", leaseOwner: workerId, leaseExpiresAt: now + leaseMs, attempts: m.attempts + 1 };
      this.#byId.set(m.id, claimed);
      return this.#copy(claimed)!;
    });
  }

  async complete(id: string, workerId: string, patch: CompletePatch) {
    const message = this.#byId.get(id);
    if (!message || message.status !== "sending" || message.leaseOwner !== workerId) return false;
    this.#byId.set(id, {
      ...message, status: patch.status, leaseOwner: null, leaseExpiresAt: null,
      providerId: patch.providerId ?? message.providerId, lastError: patch.lastError ?? (patch.status === "sent" ? null : message.lastError),
      nextAttemptAt: patch.nextAttemptAt ?? message.nextAttemptAt, sentAt: patch.sentAt ?? message.sentAt,
    });
    return true;
  }

  async cancel(key: string) {
    const id = this.#byKey.get(key);
    const message = id === undefined ? undefined : this.#byId.get(id);
    if (!message || message.status !== "queued") return null;
    const cancelled: EmailMessage = { ...message, status: "cancelled" };
    this.#byId.set(message.id, cancelled);
    return this.#copy(cancelled);
  }

  async transitionByProviderId(providerId: string, from: readonly EmailStatus[], to: EmailStatus) {
    for (const message of this.#byId.values()) {
      if (message.providerId !== providerId) continue;
      if (!from.includes(message.status)) return null;
      const updated: EmailMessage = { ...message, status: to };
      this.#byId.set(message.id, updated);
      return this.#copy(updated);
    }
    return null;
  }

  async suppress(address: string, reason: string, at: number) {
    if (!this.#suppressed.has(address)) this.#suppressed.set(address, { reason, at });
  }

  async isSuppressed(address: string) { return this.#suppressed.has(address); }
}
