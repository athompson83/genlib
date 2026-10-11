// SPDX-License-Identifier: Apache-2.0
// In-memory RbacStore for tests and prototypes. Per-process and lost on restart. Every method runs without an
// await between its read and write, so each call is atomic within one process. Production needs schema.sql
// (or an equivalent unique key on tenant, subject, role and resource) and an atomic last-holder guard.
import type { Assignment, AssignmentKey, ListCursor, RbacStore, RemoveResult } from "./core.js";

const keyOf = (key: AssignmentKey): string => JSON.stringify([key.tenantId, key.subjectId, key.role, key.resourceId ?? ""]);
const position = (item: Assignment): ListCursor => ({ subjectId: item.subjectId, role: item.role, resourceId: item.resourceId ?? "" });
const order = (a: ListCursor, b: ListCursor): number => {
  for (const field of ["subjectId", "role", "resourceId"] as const) {
    if (a[field] < b[field]) return -1;
    if (a[field] > b[field]) return 1;
  }
  return 0;
};

export class MemoryRbacStore implements RbacStore {
  readonly #rows = new Map<string, Assignment>();

  async forSubject(tenantId: string, subjectId: string): Promise<Assignment[]> {
    return [...this.#rows.values()].filter((item) => item.tenantId === tenantId && item.subjectId === subjectId).map((item) => ({ ...item }));
  }

  async upsert(assignment: Assignment): Promise<{ assignment: Assignment; created: boolean }> {
    const key = keyOf(assignment);
    const existing = this.#rows.get(key);
    if (existing) {
      const next = { ...existing, expiresAt: assignment.expiresAt };
      this.#rows.set(key, next);
      return { assignment: { ...next }, created: false };
    }
    this.#rows.set(key, { ...assignment });
    return { assignment: { ...assignment }, created: true };
  }

  async remove(key: AssignmentKey, guard: { readonly protectedRole: boolean; readonly now: number }): Promise<RemoveResult> {
    const id = keyOf(key);
    const existing = this.#rows.get(id);
    if (!existing) return "not-found";
    const expired = existing.expiresAt !== null && existing.expiresAt <= guard.now;
    if (guard.protectedRole && existing.resourceId === null && !expired) {
      const others = [...this.#rows.values()].some((item) => item.tenantId === key.tenantId && item.role === key.role &&
        item.resourceId === null && item.subjectId !== key.subjectId && (item.expiresAt === null || item.expiresAt > guard.now));
      if (!others) return "last-holder";
    }
    this.#rows.delete(id);
    return "removed";
  }

  async list(tenantId: string, query: { readonly subjectId: string | null; readonly after: ListCursor | null; readonly limit: number }): Promise<Assignment[]> {
    return [...this.#rows.values()]
      .filter((item) => item.tenantId === tenantId && (query.subjectId === null || item.subjectId === query.subjectId))
      .filter((item) => query.after === null || order(position(item), query.after) > 0)
      .sort((a, b) => order(position(a), position(b)))
      .slice(0, query.limit)
      .map((item) => ({ ...item }));
  }
}
