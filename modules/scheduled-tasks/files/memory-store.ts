// SPDX-License-Identifier: Apache-2.0
// In-memory SchedulerStore for tests, prototypes and single-process apps. Each method changes state synchronously
// between awaits, so compare-and-set, claims and slots are atomic within one process. Data is lost on restart and
// is not shared between processes; use sql-store.ts when several instances run.
import type { FinishPatch, RunRecord, ScheduleRecord, SchedulerStore, SlotResult } from "./core.js";

interface Slot { runId: string; owner: string; since: number; expiresAt: number }

const copySchedule = (s: ScheduleRecord): ScheduleRecord => ({ ...s, payload: structuredClone(s.payload) });
const copyRun = (r: RunRecord): RunRecord => ({ ...r });

export class MemorySchedulerStore implements SchedulerStore {
  readonly #schedules = new Map<string, ScheduleRecord>();
  readonly #runs = new Map<string, RunRecord>();
  readonly #occurrences = new Set<string>();
  readonly #slots = new Map<string, Slot>();

  /** Every run, oldest occurrence first, for inspection in tests. */
  allRuns(): RunRecord[] {
    return [...this.#runs.values()].sort((a, b) => a.scheduledFor - b.scheduledFor || a.scheduleId.localeCompare(b.scheduleId)).map(copyRun);
  }

  async saveSchedule(record: ScheduleRecord): Promise<ScheduleRecord> {
    this.#schedules.set(record.id, copySchedule(record));
    return copySchedule(record);
  }

  async getSchedule(id: string): Promise<ScheduleRecord | null> {
    const s = this.#schedules.get(id);
    return s ? copySchedule(s) : null;
  }

  async listSchedules(): Promise<ScheduleRecord[]> {
    return [...this.#schedules.values()].sort((a, b) => a.id.localeCompare(b.id)).map(copySchedule);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    if (!this.#schedules.delete(id)) return false;
    this.#slots.delete(id);
    for (const [runId, run] of this.#runs) {
      if (run.scheduleId === id) {
        this.#runs.delete(runId);
        this.#occurrences.delete(`${id}\n${run.scheduledFor}`);
      }
    }
    return true;
  }

  async dueSchedules(now: number, limit: number): Promise<ScheduleRecord[]> {
    return [...this.#schedules.values()]
      .filter((s) => s.enabled && s.nextRunAt !== null && s.nextRunAt <= now)
      .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
      .slice(0, limit)
      .map(copySchedule);
  }

  async materialize(input: { scheduleId: string; expectedNextRunAt: number; nextRunAt: number | null; runs: readonly RunRecord[] }) {
    const schedule = this.#schedules.get(input.scheduleId);
    if (!schedule || schedule.nextRunAt !== input.expectedNextRunAt) return { advanced: false, inserted: 0 };
    this.#schedules.set(schedule.id, { ...schedule, nextRunAt: input.nextRunAt });
    let inserted = 0;
    for (const run of input.runs) {
      const key = `${input.scheduleId}\n${run.scheduledFor}`;
      if (this.#occurrences.has(key) || this.#runs.has(run.id)) continue;
      this.#occurrences.add(key);
      this.#runs.set(run.id, { ...run, scheduleId: input.scheduleId });
      inserted++;
    }
    return { advanced: true, inserted };
  }

  #isDue(run: RunRecord, now: number): boolean {
    return (run.status === "pending" && run.nextAttemptAt <= now) || (run.status === "running" && (run.leaseExpiresAt ?? 0) < now);
  }

  async dueRuns(now: number, limit: number, excludeScheduleIds: readonly string[] = []): Promise<RunRecord[]> {
    const excluded = new Set(excludeScheduleIds);
    const order = (a: RunRecord, b: RunRecord) => a.nextAttemptAt - b.nextAttemptAt || a.scheduledFor - b.scheduledFor;
    const earliest = new Map<string, RunRecord>();
    for (const run of this.#runs.values()) {
      if (excluded.has(run.scheduleId) || !this.#isDue(run, now)) continue;
      const current = earliest.get(run.scheduleId);
      if (!current || order(run, current) < 0) earliest.set(run.scheduleId, run);
    }
    return [...earliest.values()].sort(order).slice(0, limit).map(copyRun);
  }

  async claimRun({ runId, workerId, now, leaseMs }: { runId: string; workerId: string; now: number; leaseMs: number }) {
    const run = this.#runs.get(runId);
    if (!run || !this.#isDue(run, now)) return null;
    const claimed: RunRecord = { ...run, status: "running", leaseOwner: workerId, leaseExpiresAt: now + leaseMs, attempt: run.attempt + 1, startedAt: now };
    this.#runs.set(runId, claimed);
    return copyRun(claimed);
  }

  async acquireSlot({ scheduleId, runId, workerId, now, expiresAt }: { scheduleId: string; runId: string; workerId: string; now: number; expiresAt: number }): Promise<SlotResult> {
    if (!this.#schedules.has(scheduleId)) return { acquired: false, since: null };
    const slot = this.#slots.get(scheduleId);
    if (slot && slot.expiresAt >= now && slot.runId !== runId) return { acquired: false, since: slot.since };
    this.#slots.set(scheduleId, { runId, owner: workerId, since: now, expiresAt });
    return { acquired: true };
  }

  async releaseSlot({ scheduleId, runId, workerId }: { scheduleId: string; runId: string; workerId: string }) {
    const slot = this.#slots.get(scheduleId);
    if (slot && slot.runId === runId && slot.owner === workerId) this.#slots.delete(scheduleId);
  }

  async heartbeat({ runId, scheduleId, workerId, now, expiresAt }: { runId: string; scheduleId: string; workerId: string; now: number; expiresAt: number }) {
    const run = this.#runs.get(runId);
    if (!run || run.status !== "running" || run.leaseOwner !== workerId || (run.leaseExpiresAt ?? 0) < now) return false;
    this.#runs.set(runId, { ...run, leaseExpiresAt: expiresAt });
    const slot = this.#slots.get(scheduleId);
    if (slot && slot.runId === runId && slot.owner === workerId) slot.expiresAt = expiresAt;
    return true;
  }

  async finishRun(runId: string, workerId: string, patch: FinishPatch) {
    const run = this.#runs.get(runId);
    if (!run || run.status !== "running" || run.leaseOwner !== workerId) return false;
    this.#runs.set(runId, {
      ...run, status: patch.status, leaseOwner: null, leaseExpiresAt: null,
      attempt: patch.attempt ?? run.attempt, nextAttemptAt: patch.nextAttemptAt ?? run.nextAttemptAt,
      error: patch.error === undefined ? run.error : patch.error, finishedAt: patch.finishedAt ?? run.finishedAt,
    });
    return true;
  }

  async listRuns(scheduleId: string, limit: number): Promise<RunRecord[]> {
    return [...this.#runs.values()].filter((r) => r.scheduleId === scheduleId)
      .sort((a, b) => b.scheduledFor - a.scheduledFor).slice(0, limit).map(copyRun);
  }
}
