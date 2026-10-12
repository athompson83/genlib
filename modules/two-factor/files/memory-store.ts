// SPDX-License-Identifier: Apache-2.0
// In-memory TwoFactorStore for tests and prototypes. Per-process and lost on restart: production needs durable
// tables with conditional updates (see schema.sql and sql-store.ts). Every check-and-write below runs without an
// await in between, so it is atomic within one process.
import type { AttemptLockout, AttemptWindow, EncryptedSecret, TwoFactorEnrollment, TwoFactorStore } from "./core.js";

interface RecoveryRow { readonly userId: string; readonly codeHash: string; readonly createdAt: number; readonly usedAt?: number }

export class MemoryTwoFactorStore implements TwoFactorStore {
  readonly #enrollments = new Map<string, TwoFactorEnrollment>();
  #codes: RecoveryRow[] = [];
  readonly #attempts = new Map<string, AttemptWindow>();

  /** Copies of every stored row (for tests that check what is persisted). */
  dump(): { enrollments: TwoFactorEnrollment[]; recoveryCodes: RecoveryRow[] } {
    return {
      enrollments: [...this.#enrollments.values()].map((item) => ({ ...item, secret: { ...item.secret } })),
      recoveryCodes: this.#codes.map((item) => ({ ...item })),
    };
  }

  async get(userId: string): Promise<TwoFactorEnrollment | null> {
    const item = this.#enrollments.get(userId);
    return item ? { ...item, secret: { ...item.secret } } : null;
  }

  async savePending(enrollment: TwoFactorEnrollment): Promise<boolean> {
    if (this.#enrollments.get(enrollment.userId)?.status === "active") return false;
    this.#enrollments.set(enrollment.userId, { ...enrollment, status: "pending" });
    return true;
  }

  async activate(userId: string, ciphertext: string, step: number, now: number, recoveryHashes: readonly string[]): Promise<boolean> {
    const item = this.#enrollments.get(userId);
    if (!item || item.status !== "pending" || item.secret.ciphertext !== ciphertext || item.pendingExpiresAt === undefined || now >= item.pendingExpiresAt) return false;
    const { pendingExpiresAt: _expired, ...rest } = item;
    this.#enrollments.set(userId, { ...rest, status: "active", confirmedAt: now, lastUsedStep: step });
    this.#setCodes(userId, recoveryHashes, now);
    return true;
  }

  async advanceStep(userId: string, step: number): Promise<boolean> {
    const item = this.#enrollments.get(userId);
    if (!item || item.status !== "active" || (item.lastUsedStep !== null && item.lastUsedStep >= step)) return false;
    this.#enrollments.set(userId, { ...item, lastUsedStep: step });
    return true;
  }

  async updateSecret(userId: string, oldCiphertext: string, secret: EncryptedSecret): Promise<boolean> {
    const item = this.#enrollments.get(userId);
    if (!item || item.secret.ciphertext !== oldCiphertext) return false;
    this.#enrollments.set(userId, { ...item, secret: { ...secret } });
    return true;
  }

  async replaceRecoveryCodes(userId: string, recoveryHashes: readonly string[], now: number): Promise<boolean> {
    if (this.#enrollments.get(userId)?.status !== "active") return false;
    this.#setCodes(userId, recoveryHashes, now);
    return true;
  }

  async consumeRecoveryCode(userId: string, codeHash: string, now: number): Promise<boolean> {
    const index = this.#codes.findIndex((item) => item.userId === userId && item.codeHash === codeHash && item.usedAt === undefined);
    const item = this.#codes[index];
    if (!item) return false;
    this.#codes[index] = { ...item, usedAt: now };
    return true;
  }

  async countRecoveryCodes(userId: string): Promise<number> {
    return this.#codes.filter((item) => item.userId === userId && item.usedAt === undefined).length;
  }

  async remove(userId: string): Promise<boolean> {
    this.#codes = this.#codes.filter((item) => item.userId !== userId);
    return this.#enrollments.delete(userId);
  }

  async registerAttempt(userId: string, now: number, windowMs: number, lockout?: AttemptLockout): Promise<AttemptWindow> {
    const current = this.#attempts.get(userId);
    const lockEnded = current?.lockedUntil !== undefined && current.lockedUntil <= now;
    const reset = !current || lockEnded || (current.lockedUntil === undefined && current.windowStart <= now - windowMs);
    const count = reset ? 1 : current.count + 1;
    const windowStart = reset ? now : current.windowStart;
    // An active lock is kept as it is; otherwise the attempt that reaches the limit starts one.
    const lockedUntil = !reset && current.lockedUntil !== undefined
      ? current.lockedUntil
      : lockout && count >= lockout.maxAttempts ? now + lockout.lockoutMs : undefined;
    const next: AttemptWindow = lockedUntil === undefined ? { count, windowStart } : { count, windowStart, lockedUntil };
    this.#attempts.set(userId, next);
    return { ...next };
  }

  async clearAttempts(userId: string): Promise<void> {
    this.#attempts.delete(userId);
  }

  #setCodes(userId: string, hashes: readonly string[], now: number): void {
    this.#codes = this.#codes.filter((item) => item.userId !== userId);
    for (const codeHash of hashes) this.#codes.push({ userId, codeHash, createdAt: now });
  }
}
