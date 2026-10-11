// SPDX-License-Identifier: Apache-2.0
// Usage credits as an append-only ledger. The balance is never stored; it is replayed from entries, so every
// change is auditable. Grants can expire and are consumed earliest-expiry first. Debits, grants and holds carry
// an idempotency key, so a retried request never charges twice. Each append is conditional on the ledger version
// the decision was made against (optimistic concurrency), so two concurrent debits cannot overdraw.
// SQL shape: credit_entries(account_id, version, entry jsonb, PRIMARY KEY (account_id, version)) and
// INSERT ... only when version = (SELECT max(version) ...) + 1, or a unique (account_id, version) violation.

export type CreditEntry =
  | { readonly type: "grant"; readonly id: string; readonly key: string; readonly amount: number; readonly at: number; readonly expiresAt?: number; readonly reason?: string }
  | { readonly type: "debit"; readonly id: string; readonly key: string; readonly amount: number; readonly at: number; readonly reason?: string }
  | { readonly type: "hold"; readonly id: string; readonly key: string; readonly amount: number; readonly at: number; readonly expiresAt: number }
  | { readonly type: "capture"; readonly id: string; readonly holdId: string; readonly amount: number; readonly at: number }
  | { readonly type: "release"; readonly id: string; readonly holdId: string; readonly at: number };

export interface CreditStore {
  /** Entries in append order and the current version (0 when empty). */
  read(accountId: string): Promise<{ entries: CreditEntry[]; version: number }>;
  /** Appends only when the stored version still equals `expectedVersion`; returns false otherwise. */
  append(accountId: string, entry: CreditEntry, expectedVersion: number): Promise<boolean>;
}

export interface Balance { available: number; held: number; expiring: { amount: number; expiresAt: number }[] }

export type CreditErrorCode = "insufficient" | "key-reused" | "unknown-hold" | "hold-closed" | "invalid" | "conflict";
export class CreditError extends Error {
  constructor(readonly code: CreditErrorCode, message: string) { super(message); this.name = "CreditError"; }
}

interface Lot { remaining: number; expiresAt: number }
interface HoldState { id: string; key: string; amount: number; expiresAt: number; taken: { lot: Lot; amount: number }[]; open: boolean }

// Replays the ledger at time `now`. Expired lots are forfeited; expired open holds return to their lots.
function replay(entries: readonly CreditEntry[], now: number) {
  const lots: Lot[] = [];
  const holds = new Map<string, HoldState>();
  const byKey = new Map<string, CreditEntry>();
  const live = (lot: Lot, at: number) => lot.expiresAt > at && lot.remaining > 0;
  // Earliest expiry first; lots without expiry last.
  const take = (amount: number, at: number) => {
    const taken: { lot: Lot; amount: number }[] = [];
    let left = amount;
    for (const lot of [...lots].filter(lot => live(lot, at)).sort((a, b) => a.expiresAt - b.expiresAt)) {
      const used = Math.min(lot.remaining, left);
      lot.remaining -= used; left -= used; taken.push({ lot, amount: used });
      if (left === 0) break;
    }
    return { taken, short: left };
  };
  const giveBack = (taken: { lot: Lot; amount: number }[]) => { for (const part of taken) part.lot.remaining += part.amount; };
  const expireHolds = (at: number) => { for (const hold of holds.values()) if (hold.open && hold.expiresAt <= at) { hold.open = false; giveBack(hold.taken); } };
  for (const entry of entries) {
    expireHolds(entry.at);
    if ("key" in entry) byKey.set(entry.key, entry);
    if (entry.type === "grant") lots.push({ remaining: entry.amount, expiresAt: entry.expiresAt ?? Infinity });
    else if (entry.type === "debit") take(entry.amount, entry.at);
    else if (entry.type === "hold") holds.set(entry.id, { id: entry.id, key: entry.key, amount: entry.amount, expiresAt: entry.expiresAt, taken: take(entry.amount, entry.at).taken, open: true });
    else {
      const hold = holds.get(entry.holdId);
      if (!hold || !hold.open) continue;
      hold.open = false;
      if (entry.type === "capture") {
        // Keep `amount` from the earliest-expiring lots the hold drew on and return the rest to the others.
        let keep = entry.amount;
        for (const part of [...hold.taken].sort((a, b) => a.lot.expiresAt - b.lot.expiresAt)) {
          const kept = Math.min(part.amount, keep); keep -= kept; part.lot.remaining += part.amount - kept;
        }
      } else giveBack(hold.taken);
    }
  }
  expireHolds(now);
  const open = [...holds.values()].filter(hold => hold.open);
  const usable = lots.filter(lot => live(lot, now));
  return {
    lots, holds, byKey, take: (amount: number) => take(amount, now),
    balance: {
      available: usable.reduce((sum, lot) => sum + lot.remaining, 0),
      held: open.reduce((sum, hold) => sum + hold.amount, 0),
      expiring: usable.filter(lot => lot.expiresAt !== Infinity).sort((a, b) => a.expiresAt - b.expiresAt).map(lot => ({ amount: lot.remaining, expiresAt: lot.expiresAt })),
    } satisfies Balance,
  };
}

const KEY = /^[\x21-\x7e]{1,200}$/;
const amountOk = (n: number) => Number.isSafeInteger(n) && n > 0;

export function createCredits(options: { store: CreditStore; now?: () => number; newId?: () => string; maxRetries?: number }) {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const retries = options.maxRetries ?? 5;
  const { store } = options;

  // Read, decide, conditionally append; on a concurrent write, re-read and decide again.
  async function apply<T>(accountId: string, decide: (state: ReturnType<typeof replay>, at: number) => { entry?: CreditEntry; result: T }): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { entries, version } = await store.read(accountId);
      const at = now();
      const { entry, result } = decide(replay(entries, at), at);
      if (!entry || await store.append(accountId, entry, version)) return result;
    }
    throw new CreditError("conflict", "Too many concurrent changes; retry");
  }

  // A repeated key with identical parameters returns the original entry; anything else is refused.
  function replayed(state: ReturnType<typeof replay>, key: string, type: CreditEntry["type"], amount: number): CreditEntry | undefined {
    if (!KEY.test(key)) throw new CreditError("invalid", "Idempotency key must be 1-200 visible ASCII characters");
    const prior = state.byKey.get(key);
    if (!prior) return undefined;
    if (prior.type !== type || ("amount" in prior && prior.amount !== amount)) throw new CreditError("key-reused", "Idempotency key reused with different parameters");
    return prior;
  }

  return {
    async balance(accountId: string): Promise<Balance> {
      return replay((await store.read(accountId)).entries, now()).balance;
    },

    /** Adds credits (a purchase, a monthly allowance), optionally expiring. */
    async grant(accountId: string, amount: number, { key, expiresAt, reason }: { key: string; expiresAt?: number; reason?: string }) {
      if (!amountOk(amount)) throw new CreditError("invalid", "Amount must be a positive integer");
      return apply(accountId, (state, at) => {
        const prior = replayed(state, key, "grant", amount);
        if (prior) return { result: prior };
        if (expiresAt !== undefined && expiresAt <= at) throw new CreditError("invalid", "expiresAt is in the past");
        const entry: CreditEntry = { type: "grant", id: newId(), key, amount, at, ...(expiresAt !== undefined ? { expiresAt } : {}), ...(reason ? { reason } : {}) };
        return { entry, result: entry };
      });
    },

    /** Spends credits now; fails with `insufficient` rather than going negative. */
    async debit(accountId: string, amount: number, { key, reason }: { key: string; reason?: string }) {
      if (!amountOk(amount)) throw new CreditError("invalid", "Amount must be a positive integer");
      return apply(accountId, (state, at) => {
        const prior = replayed(state, key, "debit", amount);
        if (prior) return { result: prior };
        if (state.balance.available < amount) throw new CreditError("insufficient", `Needs ${amount}, has ${state.balance.available}`);
        const entry: CreditEntry = { type: "debit", id: newId(), key, amount, at, ...(reason ? { reason } : {}) };
        return { entry, result: entry };
      });
    },

    /** Reserves credits for work whose final cost is known later (an AI call, a render); expires on its own. */
    async reserve(accountId: string, amount: number, { key, ttlMs }: { key: string; ttlMs: number }) {
      if (!amountOk(amount) || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 86_400_000) throw new CreditError("invalid", "Amount must be positive and ttlMs 1 s to 24 h");
      return apply(accountId, (state, at) => {
        const prior = replayed(state, key, "hold", amount);
        if (prior) return { result: prior };
        if (state.balance.available < amount) throw new CreditError("insufficient", `Needs ${amount}, has ${state.balance.available}`);
        const entry: CreditEntry = { type: "hold", id: newId(), key, amount, at, expiresAt: at + ttlMs };
        return { entry, result: entry };
      });
    },

    /** Charges up to the held amount and returns the rest. Capturing a closed hold fails; retries see hold-closed. */
    async capture(accountId: string, holdId: string, amount: number) {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new CreditError("invalid", "Amount must be a non-negative integer");
      return apply(accountId, (state, at) => {
        const hold = state.holds.get(holdId);
        if (!hold) throw new CreditError("unknown-hold", "No such hold");
        if (!hold.open) throw new CreditError("hold-closed", "Hold already captured, released or expired");
        if (amount > hold.amount) throw new CreditError("invalid", "Cannot capture more than was held");
        const entry: CreditEntry = { type: "capture", id: newId(), holdId, amount, at };
        return { entry, result: entry };
      });
    },

    /** Returns a hold's credits without charging. Releasing a closed hold is a no-op. */
    async release(accountId: string, holdId: string) {
      return apply(accountId, (state, at) => {
        const hold = state.holds.get(holdId);
        if (!hold) throw new CreditError("unknown-hold", "No such hold");
        if (!hold.open) return { result: false };
        return { entry: { type: "release", id: newId(), holdId, at } as CreditEntry, result: true };
      });
    },
  };
}

export type Credits = ReturnType<typeof createCredits>;

/** In-memory CreditStore for tests and prototypes (per process, lost on restart). */
export class MemoryCreditStore implements CreditStore {
  readonly #ledgers = new Map<string, CreditEntry[]>();
  async read(accountId: string) {
    const entries = this.#ledgers.get(accountId) ?? [];
    return { entries: entries.map(entry => ({ ...entry })), version: entries.length };
  }
  async append(accountId: string, entry: CreditEntry, expectedVersion: number) {
    const entries = this.#ledgers.get(accountId) ?? [];
    if (entries.length !== expectedVersion) return false;
    this.#ledgers.set(accountId, [...entries, { ...entry }]);
    return true;
  }
}
