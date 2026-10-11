// SPDX-License-Identifier: Apache-2.0
// In-memory InvitationStore for tests and prototypes. Per-process and lost on restart: production
// needs a database table with a unique index on token_hash and an atomic conditional update, e.g.
//   UPDATE invitations SET status = $2, closed_at = $3, accepted_by = $4
//   WHERE id = $1 AND status = 'pending' RETURNING id;
// run in the same transaction that inserts the membership row.
import type { Invitation, InvitationStatus, InvitationStore } from "./core.js";

export class MemoryInvitationStore implements InvitationStore {
  readonly #byId = new Map<string, Invitation>();

  async insert(invitation: Invitation): Promise<void> {
    if (this.#byId.has(invitation.id)) throw new Error("Duplicate invitation id");
    for (const item of this.#byId.values()) if (item.tokenHash === invitation.tokenHash) throw new Error("Duplicate token hash");
    this.#byId.set(invitation.id, { ...invitation });
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    for (const item of this.#byId.values()) if (item.tokenHash === tokenHash) return { ...item };
    return null;
  }

  async findById(id: string): Promise<Invitation | null> {
    const item = this.#byId.get(id);
    return item ? { ...item } : null;
  }

  async listPending(tenantId: string, email?: string): Promise<Invitation[]> {
    return [...this.#byId.values()]
      .filter((item) => item.tenantId === tenantId && item.status === "pending" && (email === undefined || item.email === email))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((item) => ({ ...item }));
  }

  async transition(id: string, from: InvitationStatus, patch: Pick<Invitation, "status" | "closedAt"> & { acceptedBy?: string }): Promise<boolean> {
    const item = this.#byId.get(id);
    if (!item || item.status !== from) return false;
    this.#byId.set(id, { ...item, ...patch });
    return true;
  }
}
