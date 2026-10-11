// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: transactional outbox reference implementation (in memory). Original source; copy and adapt.
// The pattern: write business state and the messages it implies in ONE database transaction,
// then a relay publishes pending messages and marks them sent. Delivery is at-least-once, so
// consumers must de-duplicate by message id. This in-memory version models the semantics for
// tests and prototypes; production stores rows in the same database as the business data.

export interface OutboxMessage<P = unknown> {
  id: string;
  topic: string;
  payload: P;
  createdAt: number;
  attempts: number;
  status: "pending" | "sent" | "dead";
  nextAttemptAt: number;
  lastError?: string;
}

export interface RelayOptions { batchSize?: number; maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }
export interface RelayReport { sent: number; failed: number; dead: number }

export class InMemoryOutbox<State, P = unknown> {
  #state: State;
  readonly #messages: OutboxMessage<P>[] = [];
  readonly #now: () => number;
  readonly #newId: () => string;
  #relaying = false;

  constructor(initial: State, options: { now?: () => number; newId?: () => string } = {}) {
    this.#state = structuredClone(initial);
    this.#now = options.now ?? Date.now;
    this.#newId = options.newId ?? (() => crypto.randomUUID());
  }

  get state(): State { return structuredClone(this.#state); }
  /** Deep copies: mutating a returned message (or its payload) never changes the stored one. */
  messages(): OutboxMessage<P>[] { return this.#messages.map((m) => structuredClone(m)); }

  /**
   * Runs `work` against a draft copy of state. Commit applies the draft and enqueues messages
   * atomically; a throw discards both, so no message is published for a rolled-back change.
   */
  transaction<T>(work: (draft: State, enqueue: (topic: string, payload: P) => string) => T): T {
    const draft = structuredClone(this.#state);
    const staged: OutboxMessage<P>[] = [];
    const enqueue = (topic: string, payload: P) => {
      const now = this.#now();
      const id = this.#newId();
      staged.push({ id, topic, payload: structuredClone(payload), createdAt: now, attempts: 0, status: "pending", nextAttemptAt: now });
      return id;
    };
    const result = work(draft, enqueue);
    if (result instanceof Promise) throw new TypeError("Outbox transactions must be synchronous in this reference");
    this.#state = draft;
    this.#messages.push(...staged);
    return result;
  }

  /**
   * Publishes due messages in creation order. Failures back off exponentially and become
   * "dead" after maxAttempts for operator review. Only one relay pass runs at a time.
   */
  async relay(publish: (message: Readonly<OutboxMessage<P>>) => Promise<void>, options: RelayOptions = {}): Promise<RelayReport> {
    if (this.#relaying) return { sent: 0, failed: 0, dead: 0 };
    this.#relaying = true;
    const report: RelayReport = { sent: 0, failed: 0, dead: 0 };
    try {
      const now = this.#now();
      const due = this.#messages.filter((m) => m.status === "pending" && m.nextAttemptAt <= now).slice(0, options.batchSize ?? 100);
      for (const message of due) {
        message.attempts++;
        try {
          // A deep copy, so a publisher that mutates the payload cannot change what a retry sends.
          await publish(structuredClone(message));
          message.status = "sent";
          delete message.lastError;
          report.sent++;
        } catch (error) {
          message.lastError = error instanceof Error ? error.message : String(error);
          if (message.attempts >= (options.maxAttempts ?? 8)) { message.status = "dead"; report.dead++; continue; }
          const delay = Math.min((options.baseDelayMs ?? 1000) * 2 ** (message.attempts - 1), options.maxDelayMs ?? 300_000);
          message.nextAttemptAt = this.#now() + delay;
          report.failed++;
        }
      }
    } finally {
      this.#relaying = false;
    }
    return report;
  }

  /** Requeues a dead message after the cause is fixed. */
  revive(id: string): void {
    const message = this.#messages.find((m) => m.id === id && m.status === "dead");
    if (!message) throw new Error("No dead message with that id");
    message.status = "pending";
    message.attempts = 0;
    message.nextAttemptAt = this.#now();
  }

  /** Deletes sent messages older than `olderThanMs` to bound storage. */
  prune(olderThanMs: number): number {
    const cutoff = this.#now() - olderThanMs;
    let removed = 0;
    for (let i = this.#messages.length - 1; i >= 0; i--) {
      const m = this.#messages[i];
      if (m && m.status === "sent" && m.createdAt < cutoff) { this.#messages.splice(i, 1); removed++; }
    }
    return removed;
  }
}
