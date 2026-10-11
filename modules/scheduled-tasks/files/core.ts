// SPDX-License-Identifier: Apache-2.0
// Cron scheduled tasks for multi-instance apps. Every instance calls tick() from its own loop or cron route; the
// store makes each occurrence run once: materializing an occurrence is a compare-and-set on the schedule's
// next_run_at plus a unique (schedule_id, scheduled_for) run row, and executing it is a conditional lease claim.
// Overlap policies use a per-schedule slot held with the same lease. Handlers are registered by name, so saved
// schedules carry data only. Nothing runs at import: no timers, network or environment reads.
import { latestOccurrences, nextOccurrence, parseCron, resolveTimeZone, type CronSchedule } from "./cron.js";

export type OverlapPolicy = "skip" | "queue" | "allow";
export type CatchUpPolicy = "none" | "latest" | "all";
export type RunStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface ScheduleDefinition {
  /** Stable id, 1-128 characters: letters, digits, . _ : - (starting with a letter or digit). */
  readonly id: string;
  /** Five-field cron expression or macro (see cron.ts). */
  readonly cron: string;
  /** Registered handler name. */
  readonly handler: string;
  /** IANA zone the expression is evaluated in. Default: the scheduler's defaultTimeZone (UTC). */
  readonly timeZone?: string;
  /** JSON passed to the handler; at most 64 KiB serialized. */
  readonly payload?: unknown;
  /** While a run of this schedule holds a live lease: skip new occurrences, queue them, or allow overlap. Default skip. */
  readonly overlap?: OverlapPolicy;
  /** What happens to occurrences missed while no instance ticked. Default latest. */
  readonly catchUp?: CatchUpPolicy;
  /** With catchUp all: at most this many of the most recent missed occurrences run (1-1000). Default 10. */
  readonly maxCatchUp?: number;
  /** With catchUp none: an occurrence at most this late still counts as on time. Default 60,000 ms. */
  readonly graceMs?: number;
  /** Attempts per occurrence before the run fails and onFailure is called (1-100). Default 3. */
  readonly maxAttempts?: number;
  /** Retry delay before attempt n+1 is min(retryMaxMs, retryBaseMs * 2^(n-1)). Defaults 30,000 and 3,600,000 ms. */
  readonly retryBaseMs?: number;
  readonly retryMaxMs?: number;
  /** Lease length; heartbeats extend it. A worker silent for longer is presumed crashed. Default 60,000 ms. */
  readonly leaseMs?: number;
  /** Default true. A disabled schedule keeps its history and materializes nothing. */
  readonly enabled?: boolean;
}

export interface ScheduleRecord {
  readonly id: string;
  readonly cron: string;
  readonly timeZone: string;
  readonly handler: string;
  readonly payload: Json;
  readonly overlap: OverlapPolicy;
  readonly catchUp: CatchUpPolicy;
  readonly maxCatchUp: number;
  readonly graceMs: number;
  readonly maxAttempts: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly leaseMs: number;
  readonly enabled: boolean;
  /** The first occurrence not yet materialized; null when disabled or the expression has no future run. */
  readonly nextRunAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RunRecord {
  readonly id: string;
  readonly scheduleId: string;
  /** The occurrence instant; unique per schedule. */
  readonly scheduledFor: number;
  readonly status: RunStatus;
  /** Attempts started. */
  readonly attempt: number;
  readonly nextAttemptAt: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  /** Last error, truncated to 1,000 characters. */
  readonly error: string | null;
  readonly createdAt: number;
}

export interface FinishPatch {
  readonly status: RunStatus;
  /** Replaces attempt (used to undo a claim that did not execute). */
  readonly attempt?: number;
  readonly nextAttemptAt?: number;
  /** undefined keeps the error; null clears it. */
  readonly error?: string | null;
  readonly finishedAt?: number;
}

export type SlotResult = { readonly acquired: true } | { readonly acquired: false; readonly since: number | null };

export interface SchedulerStore {
  /** Inserts or replaces the schedule's definition and next_run_at; keeps its slot. Returns the stored record. */
  saveSchedule(record: ScheduleRecord): Promise<ScheduleRecord>;
  getSchedule(id: string): Promise<ScheduleRecord | null>;
  listSchedules(): Promise<ScheduleRecord[]>;
  /** Deletes the schedule and its run history. */
  deleteSchedule(id: string): Promise<boolean>;
  /** Enabled schedules with next_run_at <= now, earliest first. */
  dueSchedules(now: number, limit: number): Promise<ScheduleRecord[]>;
  /**
   * Atomically: if next_run_at still equals expectedNextRunAt, set it to nextRunAt and insert the runs, ignoring
   * any whose (scheduleId, scheduledFor) exists. Otherwise change nothing.
   */
  materialize(input: { scheduleId: string; expectedNextRunAt: number; nextRunAt: number | null; runs: readonly RunRecord[] }): Promise<{ advanced: boolean; inserted: number }>;
  /**
   * At most ONE due run per schedule (pending and due, or running with an expired lease): each schedule's earliest by
   * nextAttemptAt then scheduledFor, skipping `excludeScheduleIds`; the result is ordered the same way. One row per
   * schedule keeps a busy schedule's backlog from filling the page and starving other schedules.
   */
  dueRuns(now: number, limit: number, excludeScheduleIds: readonly string[]): Promise<RunRecord[]>;
  /** Conditionally claims one due run: status running, lease, attempt + 1, startedAt. Null if someone else won. */
  claimRun(input: { runId: string; workerId: string; now: number; leaseMs: number }): Promise<RunRecord | null>;
  /** Takes the schedule's execution slot if it is free, expired, or already this run's. */
  acquireSlot(input: { scheduleId: string; runId: string; workerId: string; now: number; expiresAt: number }): Promise<SlotResult>;
  releaseSlot(input: { scheduleId: string; runId: string; workerId: string }): Promise<void>;
  /** Extends a live lease held by workerId (and the slot if this run holds it). False if the lease is lost or expired. */
  heartbeat(input: { runId: string; scheduleId: string; workerId: string; now: number; expiresAt: number }): Promise<boolean>;
  /** Applies the patch and clears the lease only while the run is running and leased by workerId. */
  finishRun(runId: string, workerId: string, patch: FinishPatch): Promise<boolean>;
  /** Newest occurrence first. */
  listRuns(scheduleId: string, limit: number): Promise<RunRecord[]>;
}

export interface RunContext {
  readonly scheduleId: string;
  readonly runId: string;
  readonly scheduledFor: number;
  /** 1-based attempt number. */
  readonly attempt: number;
  readonly payload: Json;
  readonly instanceId: string;
  /** Aborted when a heartbeat finds the lease lost; stop work and do not commit further effects. */
  readonly signal: AbortSignal;
  /** Extends the lease now; resolves false (and aborts signal) when another instance has taken the run over. */
  heartbeat(): Promise<boolean>;
}

export type TaskHandler = (context: RunContext) => unknown;

export interface FailureInfo { readonly schedule: ScheduleRecord; readonly run: RunRecord; readonly error: string }

export interface HeartbeatTimers {
  /** Repeating timer (setInterval semantics). */
  set(callback: () => unknown, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface SchedulerOptions {
  readonly store: SchedulerStore;
  readonly handlers: Readonly<Record<string, TaskHandler>>;
  /** Unique per process, for example `web-${hostname}-${pid}`. 1-128 word characters, . : or -. */
  readonly instanceId: string;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly defaultTimeZone?: string;
  /** Called once when a run fails for good. Errors thrown here are counted in hookErrors. */
  readonly onFailure?: (info: FailureInfo) => unknown;
  /** Automatic heartbeat every leaseMs/3 while a handler runs. Default setInterval; false disables it. */
  readonly timers?: HeartbeatTimers | false;
  /** Runs executed per tick at most. Default 100. */
  readonly maxRunsPerTick?: number;
}

export interface TickSummary {
  materialized: number;
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  skipped: number;
  /** Claims returned to pending because overlap is queue (or a catch-up backlog) and another run holds the slot. */
  deferred: number;
  /** Results discarded because another instance took over the run's lease. */
  lostLease: number;
  hookErrors: number;
}

export type SchedulerErrorCode =
  | "invalid-id" | "invalid-cron" | "invalid-time-zone" | "unknown-handler" | "invalid-option" | "invalid-payload"
  | "never-runs" | "invalid-worker" | "not-found";

export class SchedulerError extends Error {
  readonly code: SchedulerErrorCode;
  constructor(code: SchedulerErrorCode, message: string) {
    super(message);
    this.name = "SchedulerError";
    this.code = code;
  }
}

export interface Scheduler {
  /** Validates and stores a schedule. Re-saving keeps the pending occurrence unless cron, zone or enabled changed. */
  save(definition: ScheduleDefinition): Promise<ScheduleRecord>;
  get(id: string): Promise<ScheduleRecord | null>;
  list(): Promise<ScheduleRecord[]>;
  remove(id: string): Promise<boolean>;
  /** Run history, newest occurrence first (default 50, at most 500). */
  runs(scheduleId: string, options?: { limit?: number }): Promise<RunRecord[]>;
  /** Materializes due occurrences and executes due runs. `now` fixes the tick's time; default the clock. */
  tick(now?: number): Promise<TickSummary>;
}

/** Retry delay before attempt `attempt + 1`: min(maxMs, baseMs * 2^(attempt-1)). */
export function exponentialBackoff(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, Math.min(attempt - 1, 52)));
}

/** Shortest lease; the automatic heartbeat runs every leaseMs/3, so it always renews well before expiry. */
export const MIN_LEASE_MS = 3000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORKER = /^[\w.:-]{1,128}$/;
const OVERLAP: readonly OverlapPolicy[] = ["skip", "queue", "allow"];
const CATCH_UP: readonly CatchUpPolicy[] = ["none", "latest", "all"];
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 1000);
const emptySummary = (): TickSummary => ({ materialized: 0, claimed: 0, succeeded: 0, retried: 0, failed: 0, skipped: 0, deferred: 0, lostLease: 0, hookErrors: 0 });

function toJson(value: unknown, depth = 0): Json {
  if (depth > 32) throw new SchedulerError("invalid-payload", "payload is nested too deeply");
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SchedulerError("invalid-payload", "payload numbers must be finite");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJson(item, depth + 1));
  if (typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const out: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = toJson(item, depth + 1);
    return out;
  }
  throw new SchedulerError("invalid-payload", "payload must be plain JSON data");
}

function intOption(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new SchedulerError("invalid-option", `${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const { store, handlers } = options;
  if (typeof options.instanceId !== "string" || !WORKER.test(options.instanceId)) {
    throw new SchedulerError("invalid-worker", "instanceId must be 1-128 word characters, . : or -");
  }
  for (const [name, handler] of Object.entries(handlers ?? {})) {
    if (typeof handler !== "function") throw new TypeError(`handler ${name} must be a function`);
  }
  const workerId = options.instanceId;
  const clock = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const defaultTimeZone = resolveTimeZone(options.defaultTimeZone ?? "UTC");
  const maxRunsPerTick = intOption(options.maxRunsPerTick, 100, 1, 10_000, "maxRunsPerTick");
  const timers: HeartbeatTimers | null = options.timers === false ? null : options.timers ?? {
    set: (callback, ms) => {
      const handle = setInterval(callback, ms) as unknown as { unref?: () => void };
      handle.unref?.();
      return handle;
    },
    clear: (handle) => clearInterval(handle as Parameters<typeof clearInterval>[0]),
  };
  const parsedCache = new Map<string, CronSchedule>();
  const parsed = (cron: string): CronSchedule => {
    let schedule = parsedCache.get(cron);
    if (!schedule) {
      schedule = parseCron(cron);
      if (parsedCache.size > 1000) parsedCache.clear();
      parsedCache.set(cron, schedule);
    }
    return schedule;
  };
  const handlerFor = (name: string): TaskHandler | undefined => (Object.hasOwn(handlers, name) ? handlers[name] : undefined);

  async function callFailureHook(info: FailureInfo, summary: TickSummary): Promise<void> {
    if (!options.onFailure) return;
    try {
      await options.onFailure(info);
    } catch {
      summary.hookErrors++;
    }
  }

  async function materialize(schedule: ScheduleRecord, now: number, summary: TickSummary): Promise<void> {
    if (schedule.nextRunAt === null || schedule.nextRunAt > now) return;
    let cron: CronSchedule;
    try {
      cron = parsed(schedule.cron);
    } catch {
      return; // Validated at save; a row edited by hand with a bad expression is left alone.
    }
    const limit = schedule.catchUp === "all" ? schedule.maxCatchUp : 1;
    let due = latestOccurrences(cron, schedule.nextRunAt, now, limit, schedule.timeZone);
    if (schedule.catchUp === "none") due = due.filter((t) => now - t <= schedule.graceMs).slice(-1);
    const nextRunAt = nextOccurrence(cron, now, schedule.timeZone);
    const runs: RunRecord[] = due.map((scheduledFor) => ({
      id: newId(), scheduleId: schedule.id, scheduledFor, status: "pending", attempt: 0, nextAttemptAt: scheduledFor,
      leaseOwner: null, leaseExpiresAt: null, startedAt: null, finishedAt: null, error: null, createdAt: now,
    }));
    const result = await store.materialize({ scheduleId: schedule.id, expectedNextRunAt: schedule.nextRunAt, nextRunAt, runs });
    summary.materialized += result.inserted;
  }

  async function execute(schedule: ScheduleRecord, run: RunRecord, holdsSlot: boolean, time: () => number, summary: TickSummary): Promise<void> {
    const handler = handlerFor(schedule.handler);
    let failure: string | null = null;
    if (!handler) {
      failure = `unknown handler: ${schedule.handler}`;
    } else {
      const controller = new AbortController();
      const heartbeat = async (): Promise<boolean> => {
        if (controller.signal.aborted) return false;
        const now = time();
        const ok = await store.heartbeat({ runId: run.id, scheduleId: schedule.id, workerId, now, expiresAt: now + schedule.leaseMs });
        if (!ok) controller.abort(new Error("lease lost"));
        return ok;
      };
      const timer = timers ? timers.set(() => heartbeat().catch(() => false), Math.max(100, Math.floor(schedule.leaseMs / 3))) : null;
      try {
        await handler({
          scheduleId: schedule.id, runId: run.id, scheduledFor: run.scheduledFor, attempt: run.attempt, payload: schedule.payload,
          instanceId: workerId, signal: controller.signal, heartbeat,
        });
      } catch (error) {
        failure = errorText(error) || "handler failed";
      } finally {
        if (timers && timer !== null) timers.clear(timer);
      }
    }

    const finishedAt = time();
    if (failure === null) {
      if (await store.finishRun(run.id, workerId, { status: "succeeded", error: null, finishedAt })) summary.succeeded++;
      else summary.lostLease++;
    } else if (handler && run.attempt < schedule.maxAttempts) {
      const nextAttemptAt = finishedAt + exponentialBackoff(run.attempt, schedule.retryBaseMs, schedule.retryMaxMs);
      if (await store.finishRun(run.id, workerId, { status: "pending", error: failure, nextAttemptAt, finishedAt })) summary.retried++;
      else summary.lostLease++;
    } else if (await store.finishRun(run.id, workerId, { status: "failed", error: failure, finishedAt })) {
      summary.failed++;
      await callFailureHook({ schedule, run: { ...run, status: "failed", error: failure, finishedAt, leaseOwner: null, leaseExpiresAt: null }, error: failure }, summary);
    } else {
      summary.lostLease++;
    }
    if (holdsSlot) await store.releaseSlot({ scheduleId: schedule.id, runId: run.id, workerId });
  }

  async function validate(definition: ScheduleDefinition): Promise<Omit<ScheduleRecord, "nextRunAt" | "createdAt" | "updatedAt"> & { parsed: CronSchedule }> {
    if (!definition || typeof definition !== "object") throw new SchedulerError("invalid-option", "definition must be an object");
    if (typeof definition.id !== "string" || !ID.test(definition.id)) throw new SchedulerError("invalid-id", "id must be 1-128 letters, digits, . _ : or -");
    let cron: CronSchedule;
    try {
      cron = parseCron(definition.cron);
    } catch (error) {
      throw new SchedulerError("invalid-cron", errorText(error));
    }
    let timeZone: string;
    try {
      timeZone = resolveTimeZone(definition.timeZone ?? defaultTimeZone);
    } catch (error) {
      throw new SchedulerError("invalid-time-zone", errorText(error));
    }
    if (typeof definition.handler !== "string" || !handlerFor(definition.handler)) throw new SchedulerError("unknown-handler", "handler is not registered");
    const overlap = definition.overlap ?? "skip";
    const catchUp = definition.catchUp ?? "latest";
    if (!OVERLAP.includes(overlap)) throw new SchedulerError("invalid-option", "overlap must be skip, queue or allow");
    if (!CATCH_UP.includes(catchUp)) throw new SchedulerError("invalid-option", "catchUp must be none, latest or all");
    if (definition.enabled !== undefined && typeof definition.enabled !== "boolean") throw new SchedulerError("invalid-option", "enabled must be a boolean");
    const retryBaseMs = intOption(definition.retryBaseMs, 30_000, 0, 86_400_000, "retryBaseMs");
    const retryMaxMs = intOption(definition.retryMaxMs, Math.max(retryBaseMs, 3_600_000), retryBaseMs, 7 * 86_400_000, "retryMaxMs");
    const payload = toJson(definition.payload);
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 65_536) throw new SchedulerError("invalid-payload", "payload must serialize to at most 64 KiB");
    return {
      id: definition.id, cron: cron.source, timeZone, handler: definition.handler, payload, overlap, catchUp,
      maxCatchUp: intOption(definition.maxCatchUp, 10, 1, 1000, "maxCatchUp"),
      graceMs: intOption(definition.graceMs, 60_000, 0, 86_400_000, "graceMs"),
      maxAttempts: intOption(definition.maxAttempts, 3, 1, 100, "maxAttempts"),
      retryBaseMs, retryMaxMs,
      leaseMs: intOption(definition.leaseMs, 60_000, MIN_LEASE_MS, 86_400_000, "leaseMs"),
      enabled: definition.enabled ?? true, parsed: cron,
    };
  }

  return {
    async save(definition) {
      const { parsed: cron, ...fields } = await validate(definition);
      const now = clock();
      const upcoming = nextOccurrence(cron, now, fields.timeZone);
      if (upcoming === null) throw new SchedulerError("never-runs", "the expression has no run in the next 29 years");
      const existing = await store.getSchedule(fields.id);
      const keep = existing !== null && existing.enabled && fields.enabled && existing.nextRunAt !== null &&
        existing.cron === fields.cron && existing.timeZone === fields.timeZone;
      const nextRunAt = !fields.enabled ? null : keep ? existing.nextRunAt : upcoming;
      return store.saveSchedule({ ...fields, nextRunAt, createdAt: existing?.createdAt ?? now, updatedAt: now });
    },

    get: (id) => store.getSchedule(id),
    list: () => store.listSchedules(),
    remove: (id) => store.deleteSchedule(id),

    async runs(scheduleId, runOptions = {}) {
      return store.listRuns(scheduleId, intOption(runOptions.limit, 50, 1, 500, "limit"));
    },

    async tick(fixedNow) {
      if (fixedNow !== undefined && (typeof fixedNow !== "number" || !Number.isSafeInteger(fixedNow) || fixedNow < 0)) {
        throw new RangeError("now must be epoch milliseconds");
      }
      const time = () => fixedNow ?? clock();
      const summary = emptySummary();

      for (const schedule of await store.dueSchedules(time(), 200)) await materialize(schedule, time(), summary);

      // Schedules whose run was deferred this tick (slot held elsewhere) are excluded from later queries.
      const deferredSchedules = new Set<string>();
      let executed = 0;
      for (let round = 0; round < 1000 && executed < maxRunsPerTick; round++) {
        const candidates = await store.dueRuns(time(), Math.min(100, maxRunsPerTick - executed), [...deferredSchedules]);
        const busy = new Set<string>();
        const executions: Promise<void>[] = [];
        let resolved = 0;
        for (const candidate of candidates) {
          if (executed + executions.length >= maxRunsPerTick) break;
          if (deferredSchedules.has(candidate.scheduleId) || busy.has(candidate.scheduleId)) continue;
          const schedule = await store.getSchedule(candidate.scheduleId);
          if (!schedule) continue;
          const claimed = await store.claimRun({ runId: candidate.id, workerId, now: time(), leaseMs: schedule.leaseMs });
          if (!claimed) continue;
          summary.claimed++;

          if (!schedule.enabled) {
            if (await store.finishRun(claimed.id, workerId, { status: "skipped", attempt: claimed.attempt - 1, error: "schedule disabled", finishedAt: time() })) summary.skipped++;
            else summary.lostLease++;
            resolved++;
            continue;
          }
          // A reclaimed run whose final attempt was cut short by a crash is not executed again.
          if (claimed.attempt > schedule.maxAttempts) {
            const error = "lease expired during the final attempt";
            if (await store.finishRun(claimed.id, workerId, { status: "failed", error, finishedAt: time() })) {
              summary.failed++;
              await callFailureHook({ schedule, run: { ...claimed, status: "failed", error, leaseOwner: null, leaseExpiresAt: null }, error }, summary);
            } else summary.lostLease++;
            resolved++;
            continue;
          }
          let holdsSlot = false;
          if (schedule.overlap !== "allow") {
            const slot = await store.acquireSlot({ scheduleId: schedule.id, runId: claimed.id, workerId, now: time(), expiresAt: claimed.leaseExpiresAt ?? time() + schedule.leaseMs });
            busy.add(schedule.id);
            if (!slot.acquired) {
              // Skip only an occurrence that came due while the other run was already executing; an older backlog
              // or retry waits its turn instead.
              const skip = schedule.overlap === "skip" && slot.since !== null && claimed.scheduledFor >= slot.since;
              const patch: FinishPatch = skip
                ? { status: "skipped", attempt: claimed.attempt - 1, error: "overlap: a previous run is still executing", finishedAt: time() }
                : { status: "pending", attempt: claimed.attempt - 1 };
              if (await store.finishRun(claimed.id, workerId, patch)) {
                if (skip) { summary.skipped++; resolved++; }
                else { summary.deferred++; deferredSchedules.add(schedule.id); }
              } else summary.lostLease++;
              continue;
            }
            holdsSlot = true;
          }
          executions.push(execute(schedule, claimed, holdsSlot, time, summary));
        }
        // Stop when a round made no progress (nothing executed, skipped or failed); deferrals alone do not count.
        if (executions.length === 0 && resolved === 0) break;
        executed += executions.length;
        await Promise.all(executions);
      }
      return summary;
    },
  };
}
