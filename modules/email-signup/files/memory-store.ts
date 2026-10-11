// SPDX-License-Identifier: Apache-2.0
// In-memory EmailSignupStore for tests and prototypes. Per-process and lost on restart. Every conditional method
// checks and writes without an await in between, so it is atomic within one process. Production needs the
// unique index and single conditional statements in schema.sql and sql-store.ts.
import type { EmailSignupStore, SendLimits, SignupAccount, VerificationToken } from "./core.js";

export class MemoryEmailSignupStore implements EmailSignupStore {
  readonly #accounts = new Map<string, SignupAccount>();
  readonly #idByEmail = new Map<string, string>();
  readonly #tokens = new Map<string, VerificationToken>();

  /** Copies of every stored row (for tests that check what is persisted). */
  dump(): { accounts: SignupAccount[]; tokens: VerificationToken[] } {
    return {
      accounts: [...this.#accounts.values()].map((item) => ({ ...item })),
      tokens: [...this.#tokens.values()].map((item) => ({ ...item })),
    };
  }

  /** Test helper: changes an account's email (to exercise link binding). */
  changeEmail(accountId: string, email: string): void {
    const account = this.#accounts.get(accountId);
    if (!account || this.#idByEmail.has(email)) throw new Error("Cannot change email");
    this.#idByEmail.delete(account.email);
    this.#idByEmail.set(email, accountId);
    this.#accounts.set(accountId, { ...account, email });
  }

  async createAccount(account: SignupAccount): Promise<boolean> {
    if (this.#idByEmail.has(account.email)) return false;
    if (this.#accounts.has(account.id)) throw new Error("Duplicate account id");
    this.#accounts.set(account.id, { ...account });
    this.#idByEmail.set(account.email, account.id);
    return true;
  }

  async findAccountByEmail(email: string): Promise<SignupAccount | null> {
    const id = this.#idByEmail.get(email);
    const account = id === undefined ? undefined : this.#accounts.get(id);
    return account ? { ...account } : null;
  }

  async findAccountById(id: string): Promise<SignupAccount | null> {
    const account = this.#accounts.get(id);
    return account ? { ...account } : null;
  }

  async markVerified(accountId: string, now: number): Promise<boolean> {
    const account = this.#accounts.get(accountId);
    if (!account || account.verifiedAt !== undefined) return false;
    this.#accounts.set(accountId, { ...account, verifiedAt: now });
    return true;
  }

  async reserveSend(accountId: string, now: number, limits: SendLimits): Promise<boolean> {
    const account = this.#accounts.get(accountId);
    if (!account || account.verifiedAt !== undefined) return false;
    if (account.lastSentAt !== undefined && now - account.lastSentAt < limits.cooldownMs) return false;
    const windowOpen = account.sendWindowStart !== undefined && now - account.sendWindowStart < limits.windowMs;
    if (windowOpen && account.sendWindowCount >= limits.maxPerWindow) return false;
    this.#accounts.set(accountId, {
      ...account, lastSentAt: now,
      sendWindowStart: windowOpen ? (account.sendWindowStart as number) : now,
      sendWindowCount: windowOpen ? account.sendWindowCount + 1 : 1,
    });
    return true;
  }

  async issueToken(token: VerificationToken): Promise<void> {
    if (this.#tokens.has(token.id)) throw new Error("Duplicate token id");
    for (const item of this.#tokens.values()) if (item.tokenHash === token.tokenHash) throw new Error("Duplicate token hash");
    // Atomically revoke the other pending links that exist now and are not newer, so the last-issued link survives.
    for (const [id, item] of this.#tokens) {
      if (item.accountId !== token.accountId || item.usedAt !== undefined || item.revokedAt !== undefined) continue;
      if (item.createdAt <= token.createdAt) {
        this.#tokens.set(id, { ...item, revokedAt: token.createdAt });
      }
    }
    this.#tokens.set(token.id, { ...token });
  }

  async findTokenByHash(tokenHash: string): Promise<VerificationToken | null> {
    for (const item of this.#tokens.values()) if (item.tokenHash === tokenHash) return { ...item };
    return null;
  }

  async consumeToken(tokenHash: string, now: number): Promise<VerificationToken | null> {
    for (const [id, item] of this.#tokens) {
      if (item.tokenHash !== tokenHash) continue;
      if (item.usedAt !== undefined || item.revokedAt !== undefined || now >= item.expiresAt) return null;
      const used = { ...item, usedAt: now };
      this.#tokens.set(id, used);
      return { ...used };
    }
    return null;
  }

  async revokeToken(id: string, now: number): Promise<boolean> {
    const item = this.#tokens.get(id);
    if (!item || item.usedAt !== undefined || item.revokedAt !== undefined) return false;
    this.#tokens.set(id, { ...item, revokedAt: now });
    return true;
  }

  async revokePendingTokens(accountId: string, now: number, exceptId?: string): Promise<number> {
    let changed = 0;
    for (const [id, item] of this.#tokens) {
      if (item.accountId !== accountId || id === exceptId || item.usedAt !== undefined || item.revokedAt !== undefined) continue;
      this.#tokens.set(id, { ...item, revokedAt: now });
      changed++;
    }
    return changed;
  }
}
