// SPDX-License-Identifier: Apache-2.0
// Account deletion with a grace period, framework-neutral. A re-authenticated owner (or an authorized admin)
// requests deletion; the account is disabled at once, its sessions are revoked through an injected hook and the
// deletion is scheduled `graceMs` later. During the grace period the owner can cancel and regain access. When the
// period ends, runDue() claims due requests with a lease (claim token + expiry), runs the declared data policy
// (each handler tagged delete | anonymize | retain with a reason) in order, records every finished step so a retry
// after a crash resumes where it stopped, and records completion. The receiving application supplies persistence,
// authorization, session revocation and the data handlers through the interfaces below.

export type DeletionStatus = "pending" | "cancelled" | "executing" | "completed";

export interface DeletionRequest {
  readonly id: string;
  readonly userId: string;
  /** The actor who requested it: the owner, or an admin acting on the owner's account. */
  readonly requestedBy: string;
  readonly requestedAt: number;
  /** When the grace period ends and the deletion becomes due (epoch ms). */
  readonly scheduledFor: number;
  readonly status: DeletionStatus;
  readonly reason: string | null;
  readonly cancelledAt: number | null;
  readonly cancelledBy: string | null;
  readonly completedAt: number | null;
  /** Current worker's lease token while executing; null otherwise. */
  readonly claimToken: string | null;
  /** When the current lease (or retry delay) ends; another worker may claim the request after it. */
  readonly claimExpiresAt: number | null;
  /** How many times a worker claimed this request. */
  readonly attempts: number;
  /** Names of policy handlers that finished, in order. A retry skips them. */
  readonly completedSteps: readonly string[];
  readonly lastError: string | null;
}

export interface AccountDeletionStore {
  /**
   * Inserts a pending request and returns true, or returns false when the user already has a live (pending,
   * executing or completed) request. Must be one atomic step (a partial unique index on user_id covering those
   * statuses), so a request racing completion can never add a pending row for a deleted account.
   */
  insert(request: DeletionRequest): Promise<boolean>;
  findById(id: string): Promise<DeletionRequest | null>;
  /** The user's most recent request (any status), or null. */
  findLatest(userId: string): Promise<DeletionRequest | null>;
  /** Removes a pending request that was never acted on (used when session revocation fails); true when removed. */
  discard(id: string): Promise<boolean>;
  /**
   * ONE conditional step: when the request is pending and `at` is before scheduledFor, mark it cancelled and
   * return it; otherwise change nothing and return null.
   */
  cancel(id: string, by: string, at: number): Promise<DeletionRequest | null>;
  /**
   * ONE atomic step: claim up to `limit` requests that are pending with scheduledFor <= at, or executing with
   * claimExpiresAt <= at (a crashed or failed run). Set status executing, claimToken = token,
   * claimExpiresAt = leaseUntil, attempts + 1, and return them. Two workers must never claim the same request
   * with overlapping leases.
   */
  claimDue(at: number, limit: number, token: string, leaseUntil: number): Promise<DeletionRequest[]>;
  /** Extends the lease to `leaseUntil` only while the request is executing and holds `token`. False when the lease was lost. */
  renew(id: string, token: string, leaseUntil: number): Promise<boolean>;
  /** Appends `step` to completedSteps and extends the lease, only while the request holds `token`. False when the lease was lost. */
  recordStep(id: string, token: string, step: string, leaseUntil: number): Promise<boolean>;
  /** Marks the request completed at `at` and clears the claim, only while it holds `token`. */
  complete(id: string, token: string, at: number): Promise<boolean>;
  /** After a failed step: clears the token, keeps status executing, sets claimExpiresAt = retryAt and lastError. */
  release(id: string, token: string, retryAt: number, error: string): Promise<boolean>;
}

/** The signed-in or freshly re-authenticated caller. `authenticatedAt` is when they last proved their credentials. */
export interface Actor {
  readonly userId: string;
  readonly authenticatedAt?: number;
}

export type DeletionAction = "request" | "cancel" | "read";

export type DataAction = "delete" | "anonymize" | "retain";

export interface StepContext {
  readonly userId: string;
  readonly requestId: string;
  readonly at: number;
}

/**
 * One entry of the declared data policy. Handlers run in order and must be idempotent: a crash after a handler
 * finished but before its step was recorded runs it again on the retry.
 */
export interface DataHandler {
  /** Unique step name, recorded when it finishes: 1-64 of [a-z0-9_.-]. */
  readonly name: string;
  readonly action: DataAction;
  /** Why the data is deleted, anonymized or kept (for example the legal basis for retention). */
  readonly reason: string;
  /** Does the work. Optional for `retain` entries that only declare what is kept. */
  readonly run?: (context: StepContext) => Promise<void>;
}

export interface AccountDeletionOptions {
  readonly store: AccountDeletionStore;
  /**
   * Decide whether `actor` may perform `action` on the account `userId`. `self` is true when the actor is the
   * account owner. Return true for owners and for admins you authorize; return false to deny.
   */
  readonly authorize: (actor: Actor, action: DeletionAction, target: Readonly<{ userId: string; self: boolean }>) => Promise<boolean>;
  /** Revokes every session, refresh token and API token of the user. Called on request; a throw aborts the request. */
  readonly revokeSessions: (userId: string) => Promise<void>;
  /** The declared data policy, run in order when the grace period ends. At least one entry. */
  readonly policy: readonly DataHandler[];
  /** Grace period in ms. Default 30 days; 0 (immediately due) to 365 days. */
  readonly graceMs?: number;
  /** How recently the actor must have authenticated to request deletion. Default 5 minutes; 1 second to 1 day. */
  readonly recentAuthMs?: number;
  /** Worker lease per claim, renewed after every step. Default 5 minutes; 1 second to 1 day. */
  readonly leaseMs?: number;
  /** Delay before a failed run may be claimed again. Default 60 seconds; 0 to 1 day. */
  readonly retryDelayMs?: number;
  readonly now?: () => number;
  /** Request ids and claim tokens. Default crypto.randomUUID. */
  readonly newId?: () => string;
}

export type AccountDeletionErrorCode =
  | "forbidden" | "reauth-required" | "invalid-user" | "invalid-reason" | "already-pending" | "already-deleted"
  | "not-pending" | "too-late" | "revoke-failed" | "invalid-limit" | "bad-request" | "too-large";

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode;
  constructor(code: AccountDeletionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AccountDeletionError";
  }
}

export interface RunResult {
  readonly claimed: number;
  readonly completed: readonly string[];
  readonly failed: readonly { readonly id: string; readonly step: string; readonly error: string }[];
  /** Requests whose lease expired and was taken by another worker before this one finished. */
  readonly lost: readonly string[];
}

const USER = /^[\w.:@-]{1,128}$/;
const STEP = /^[a-z0-9_.-]{1,64}$/;
const DAY = 86_400_000;
const ACTIONS: readonly DataAction[] = ["delete", "anonymize", "retain"];

function range(name: string, value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${name} must be a whole number from ${min} to ${max}`);
  return value;
}

export function createAccountDeletion(options: AccountDeletionOptions) {
  const graceMs = range("graceMs", options.graceMs ?? 30 * DAY, 0, 365 * DAY);
  const recentAuthMs = range("recentAuthMs", options.recentAuthMs ?? 300_000, 1000, DAY);
  const leaseMs = range("leaseMs", options.leaseMs ?? 300_000, 1000, DAY);
  const retryDelayMs = range("retryDelayMs", options.retryDelayMs ?? 60_000, 0, DAY);
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { store } = options;

  if (!Array.isArray(options.policy) || options.policy.length === 0) throw new RangeError("Declare at least one data policy entry");
  const names = new Set<string>();
  for (const handler of options.policy) {
    if (!handler || typeof handler.name !== "string" || !STEP.test(handler.name)) throw new RangeError("Policy entry names must be 1-64 of [a-z0-9_.-]");
    if (names.has(handler.name)) throw new RangeError(`Duplicate policy entry ${handler.name}`);
    names.add(handler.name);
    if (!ACTIONS.includes(handler.action)) throw new RangeError(`Policy entry ${handler.name} must be delete, anonymize or retain`);
    if (typeof handler.reason !== "string" || handler.reason.trim() === "") throw new RangeError(`Policy entry ${handler.name} needs a reason`);
    if (handler.action !== "retain" && typeof handler.run !== "function") throw new RangeError(`Policy entry ${handler.name} needs run()`);
  }
  const policy = options.policy.slice();

  function checkUser(userId: unknown): string {
    if (typeof userId !== "string" || !USER.test(userId)) throw new AccountDeletionError("invalid-user", "Invalid user id");
    return userId;
  }

  async function allowed(actor: Actor, action: DeletionAction, userId: string): Promise<void> {
    if (!actor || typeof actor.userId !== "string") throw new AccountDeletionError("forbidden", "Not allowed");
    if (!(await options.authorize(actor, action, { userId, self: actor.userId === userId }))) throw new AccountDeletionError("forbidden", "Not allowed");
  }

  function recentlyAuthenticated(actor: Actor, at: number): void {
    const when = actor.authenticatedAt;
    if (typeof when !== "number" || !Number.isFinite(when) || when > at || at - when > recentAuthMs) {
      throw new AccountDeletionError("reauth-required", "Sign in again to confirm");
    }
  }

  function message(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 500);
  }

  async function execute(request: DeletionRequest, token: string, result: { completed: string[]; failed: { id: string; step: string; error: string }[]; lost: string[] }): Promise<void> {
    const done = new Set(request.completedSteps);
    for (const handler of policy) {
      if (done.has(handler.name)) continue;
      // Requests claimed together wait in a queue; confirm (and extend) this worker's lease before each handler,
      // so a request another worker took over after the lease expired is never touched again.
      if (!(await store.renew(request.id, token, now() + leaseMs))) {
        result.lost.push(request.id);
        return;
      }
      try {
        if (handler.run) await handler.run({ userId: request.userId, requestId: request.id, at: now() });
      } catch (error) {
        const text = message(error);
        await store.release(request.id, token, now() + retryDelayMs, `${handler.name}: ${text}`);
        result.failed.push({ id: request.id, step: handler.name, error: text });
        return;
      }
      if (!(await store.recordStep(request.id, token, handler.name, now() + leaseMs))) {
        result.lost.push(request.id);
        return;
      }
    }
    if (await store.complete(request.id, token, now())) result.completed.push(request.id);
    else result.lost.push(request.id);
  }

  return {
    /**
     * Requests deletion of `userId`. The actor must be allowed (owner or authorized admin) and must have
     * authenticated within recentAuthMs. Order: insert the pending request (the account is disabled from here),
     * then revoke sessions; when revocation throws, the request is discarded and `revoke-failed` is raised, so
     * nothing stays scheduled with live sessions.
     */
    async request(actor: Actor, input: { userId: string; reason?: string | null }): Promise<DeletionRequest> {
      const userId = checkUser(input?.userId);
      await allowed(actor, "request", userId);
      const at = now();
      recentlyAuthenticated(actor, at);
      const reason = input.reason ?? null;
      if (reason !== null && (typeof reason !== "string" || reason.length > 500)) throw new AccountDeletionError("invalid-reason", "reason must be text up to 500 characters");
      const latest = await store.findLatest(userId);
      if (latest?.status === "completed") throw new AccountDeletionError("already-deleted", "This account has been deleted");
      const request: DeletionRequest = {
        id: newId(), userId, requestedBy: actor.userId, requestedAt: at, scheduledFor: at + graceMs, status: "pending", reason,
        cancelledAt: null, cancelledBy: null, completedAt: null, claimToken: null, claimExpiresAt: null, attempts: 0, completedSteps: [], lastError: null,
      };
      if (!(await store.insert(request))) {
        // Re-read: a completion that raced the check above also makes the insert fail.
        if ((await store.findLatest(userId))?.status === "completed") throw new AccountDeletionError("already-deleted", "This account has been deleted");
        throw new AccountDeletionError("already-pending", "Deletion is already scheduled");
      }
      try {
        await options.revokeSessions(userId);
      } catch {
        await store.discard(request.id);
        throw new AccountDeletionError("revoke-failed", "Could not sign the account out everywhere; nothing was scheduled");
      }
      return request;
    },

    /**
     * Cancels a pending deletion during the grace period and restores access. The owner has no session at this
     * point: verify their credentials, then call cancel with an actor carrying a fresh authenticatedAt before
     * issuing a new session. Admins need recent authentication too.
     */
    async cancel(actor: Actor, input: { userId: string }): Promise<DeletionRequest> {
      const userId = checkUser(input?.userId);
      await allowed(actor, "cancel", userId);
      const at = now();
      recentlyAuthenticated(actor, at);
      const latest = await store.findLatest(userId);
      if (!latest || latest.status === "cancelled") throw new AccountDeletionError("not-pending", "No deletion is scheduled");
      if (latest.status !== "pending" || latest.scheduledFor <= at) throw new AccountDeletionError("too-late", "The grace period has ended");
      const cancelled = await store.cancel(latest.id, actor.userId, at);
      if (!cancelled) throw new AccountDeletionError("too-late", "The grace period has ended");
      return cancelled;
    },

    /** The account's latest deletion request, or null. */
    async status(actor: Actor, userId: string): Promise<DeletionRequest | null> {
      const id = checkUser(userId);
      await allowed(actor, "read", id);
      return store.findLatest(id);
    },

    /**
     * Gate for sign-in and authenticated requests: true while deletion is pending or executing, and after it
     * completed. Allow only the cancel flow for a disabled account.
     */
    async isDisabled(userId: string): Promise<boolean> {
      if (typeof userId !== "string" || !USER.test(userId)) return false;
      const latest = await store.findLatest(userId);
      return latest !== null && latest.status !== "cancelled";
    },

    /** The declared data policy without its functions, for a privacy notice or an audit. */
    describePolicy(): { name: string; action: DataAction; reason: string }[] {
      return policy.map(({ name, action, reason }) => ({ name, action, reason }));
    },

    /**
     * Claims up to `limit` due requests (default 10, 1 to 100) under a lease and runs the policy for each.
     * Call it from a scheduler or job queue; concurrent workers execute each account once.
     */
    async runDue(input: { limit?: number } = {}): Promise<RunResult> {
      const limit = input.limit ?? 10;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AccountDeletionError("invalid-limit", "limit must be 1 to 100");
      const at = now();
      const token = newId();
      const claimed = await store.claimDue(at, limit, token, at + leaseMs);
      const result = { completed: [] as string[], failed: [] as { id: string; step: string; error: string }[], lost: [] as string[] };
      for (const request of claimed) await execute(request, token, result);
      return { claimed: claimed.length, ...result };
    },
  };
}

export type AccountDeletion = ReturnType<typeof createAccountDeletion>;
