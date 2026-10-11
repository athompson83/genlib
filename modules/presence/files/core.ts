// SPDX-License-Identifier: Apache-2.0
// Real-time presence for server apps: who is online in a room (a document, board, channel or page), with small
// per-connection JSON state such as a cursor position or a typing flag. Rooms are scoped by tenant. Several tabs
// or devices of one user appear once. Connections expire after a TTL unless heartbeated. Events are ordered per
// room with a monotonic `seq`, and update events are coalesced per user.
// Framework-neutral and ephemeral: the application supplies the store (in memory or Redis) and authorization.
// Event fan-out is in-process; with several server instances, publish events through your own pub/sub.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface RoomRef {
  readonly tenantId: string;
  /** What people are present in, for example "doc:42" or "board/7". */
  readonly room: string;
}

export interface PresenceConnection extends RoomRef {
  /** Client-generated id for one tab, device or socket. */
  readonly connectionId: string;
  readonly userId: string;
  readonly state: JsonValue;
  /** When the state last changed (0 when never set); the newest state across a user's connections wins. */
  readonly stateAt: number;
  readonly joinedAt: number;
  readonly lastSeenAt: number;
  readonly expiresAt: number;
}

export interface PresenceStore {
  get(ref: RoomRef, connectionId: string): Promise<PresenceConnection | null>;
  /**
   * Adds a new connection when the room holds fewer than `maxPerRoom` live connections (expiresAt > now).
   * Returns "exists" when the connection id is present, "full" at capacity. Must be one atomic step.
   */
  add(connection: PresenceConnection, maxPerRoom: number, now: number): Promise<"added" | "full" | "exists">;
  /** Replaces an existing connection; returns false when it is gone. */
  replace(connection: PresenceConnection): Promise<boolean>;
  remove(ref: RoomRef, connectionId: string): Promise<PresenceConnection | null>;
  /** Live connections in one room (expiresAt > now). */
  list(ref: RoomRef, now: number): Promise<PresenceConnection[]>;
  /** Rooms that hold at least one connection with expiresAt <= now. */
  expiredRooms(now: number): Promise<RoomRef[]>;
  /** Removes and returns the connections in one room with expiresAt <= now. */
  removeExpired(ref: RoomRef, now: number): Promise<PresenceConnection[]>;
}

export interface Actor { readonly userId: string }
export type PresenceAction = "join" | "read";

export interface PresenceMember {
  readonly userId: string;
  /** Live connections (tabs, devices) of this user in the room. */
  readonly connections: number;
  /** The most recently changed state across the user's connections. */
  readonly state: JsonValue;
  /** Earliest joinedAt across the user's connections. */
  readonly joinedAt: number;
  readonly lastSeenAt: number;
}

export interface PresenceEvent {
  readonly type: "join" | "update" | "leave";
  readonly userId: string;
  /** join and update only. */
  readonly state?: JsonValue;
  /** join and update only. */
  readonly connections?: number;
  /** Monotonic per room within this process. */
  readonly seq: number;
}

export interface PresenceSnapshot { readonly members: PresenceMember[]; readonly seq: number }
export interface SweepResult extends RoomRef { readonly left: PresenceEvent[] }
export type PresenceListener = (event: PresenceEvent) => void;

export interface PresenceInput extends RoomRef {
  readonly connectionId: string;
  /** Omit to keep the current state; null clears it. */
  readonly state?: JsonValue;
}

export interface PresenceOptions {
  readonly store: PresenceStore;
  /** Decide whether `actor` may `join` (also heartbeat) or `read` (list, subscribe) a room. Check tenant membership. */
  readonly authorize: (actor: Actor, action: PresenceAction, ref: RoomRef) => Promise<boolean>;
  readonly now?: () => number;
  /** Connection lifetime without a heartbeat. Default 30 s. */
  readonly ttlMs?: number;
  /** Live connections allowed in one room. Default 500. */
  readonly maxPerRoom?: number;
  /** Largest serialized state in UTF-8 bytes. Default 1024. */
  readonly maxStateBytes?: number;
  /** At most one update event per user per window; the latest state wins. Default 100 ms; 0 disables. */
  readonly minUpdateMs?: number;
  /** Schedules a deferred update flush. Default setTimeout (unref'd where supported). Returns a cancel function. */
  readonly schedule?: (fn: () => void, delayMs: number) => () => void;
}

export type PresenceErrorCode =
  | "forbidden" | "not-owner" | "not-found" | "room-full" | "invalid-tenant" | "invalid-room"
  | "invalid-connection" | "invalid-state" | "state-too-large" | "bad-request";

export class PresenceError extends Error {
  constructor(readonly code: PresenceErrorCode, message: string) {
    super(message);
    this.name = "PresenceError";
  }
}

const TENANT = /^[\w.:-]{1,128}$/;
const ROOM = /^[\w.:\/-]{1,200}$/;
const CONNECTION = /^[\w-]{1,64}$/;
const MAX_STATE_DEPTH = 8;

function integerOption(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return result;
}

function checkJson(value: unknown, depth: number): void {
  if (depth > MAX_STATE_DEPTH) throw new PresenceError("invalid-state", "State is nested too deeply");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new PresenceError("invalid-state", "State numbers must be finite");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) checkJson(item, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new PresenceError("invalid-state", "State objects must be plain JSON objects");
    for (const item of Object.values(value)) checkJson(item, depth + 1);
    return;
  }
  throw new PresenceError("invalid-state", "State must be JSON");
}

/** Validates JSON state and its size; returns a detached copy. */
export function validateState(value: unknown, maxStateBytes: number): JsonValue {
  checkJson(value, 0);
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > maxStateBytes) throw new PresenceError("state-too-large", `State exceeds ${maxStateBytes} bytes`);
  return JSON.parse(text) as JsonValue;
}

function checkRef(ref: RoomRef): RoomRef {
  if (typeof ref?.tenantId !== "string" || !TENANT.test(ref.tenantId)) throw new PresenceError("invalid-tenant", "Invalid tenantId");
  if (typeof ref.room !== "string" || !ROOM.test(ref.room)) throw new PresenceError("invalid-room", "Invalid room");
  return { tenantId: ref.tenantId, room: ref.room };
}

function checkConnection(id: unknown): string {
  if (typeof id !== "string" || !CONNECTION.test(id)) throw new PresenceError("invalid-connection", "Invalid connectionId");
  return id;
}

/** Groups live connections by user: one entry per user with the connection count, newest state and earliest joinedAt. */
export function groupMembers(connections: readonly PresenceConnection[]): PresenceMember[] {
  const byUser = new Map<string, PresenceConnection[]>();
  for (const item of connections) {
    const list = byUser.get(item.userId);
    if (list) list.push(item); else byUser.set(item.userId, [item]);
  }
  const members: PresenceMember[] = [];
  for (const [userId, list] of byUser) {
    let newest = list[0]!;
    let joinedAt = newest.joinedAt;
    let lastSeenAt = newest.lastSeenAt;
    for (const item of list) {
      if (item.stateAt > newest.stateAt || (item.stateAt === newest.stateAt && item.connectionId > newest.connectionId)) newest = item;
      joinedAt = Math.min(joinedAt, item.joinedAt);
      lastSeenAt = Math.max(lastSeenAt, item.lastSeenAt);
    }
    members.push({ userId, connections: list.length, state: newest.state, joinedAt, lastSeenAt });
  }
  return members.sort((a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

interface RoomState {
  seq: number;
  readonly listeners: Set<PresenceListener>;
  /** userId -> time of the last update event. */
  readonly lastUpdate: Map<string, number>;
  /** userId -> latest member view waiting for its window. */
  readonly pending: Map<string, PresenceMember>;
  cancelTimer: (() => void) | null;
  timerAt: number;
}

const roomKey = (ref: RoomRef): string => `${ref.tenantId}\u0000${ref.room}`;

function defaultSchedule(fn: () => void, delayMs: number): () => void {
  const handle = setTimeout(fn, delayMs) as unknown as { unref?: () => void };
  handle.unref?.();
  return () => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

export function createPresence(options: PresenceOptions) {
  const { store, authorize } = options;
  const now = options.now ?? Date.now;
  const ttlMs = integerOption(options.ttlMs, 30_000, 1, 86_400_000, "ttlMs");
  const maxPerRoom = integerOption(options.maxPerRoom, 500, 1, 1_000_000, "maxPerRoom");
  const maxStateBytes = integerOption(options.maxStateBytes, 1024, 2, 1_048_576, "maxStateBytes");
  const minUpdateMs = integerOption(options.minUpdateMs, 100, 0, 3_600_000, "minUpdateMs");
  const schedule = options.schedule ?? defaultSchedule;
  const rooms = new Map<string, RoomState>();
  const locks = new Map<string, Promise<unknown>>();

  function roomState(ref: RoomRef): RoomState {
    const key = roomKey(ref);
    let state = rooms.get(key);
    if (!state) {
      state = { seq: 0, listeners: new Set(), lastUpdate: new Map(), pending: new Map(), cancelTimer: null, timerAt: 0 };
      rooms.set(key, state);
    }
    return state;
  }

  /** Serializes operations per room so events and join/leave decisions stay ordered within this process. */
  function withRoom<T>(ref: RoomRef, fn: () => Promise<T>): Promise<T> {
    const key = roomKey(ref);
    const previous = locks.get(key) ?? Promise.resolve();
    const run = previous.then(fn);
    const tail = run.then(() => undefined, () => undefined);
    locks.set(key, tail);
    void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    return run;
  }

  function emit(ref: RoomRef, event: Omit<PresenceEvent, "seq">): PresenceEvent {
    const state = roomState(ref);
    const full = { ...event, seq: ++state.seq } as PresenceEvent;
    for (const listener of [...state.listeners]) {
      try { listener(full); } catch { /* a failing listener must not break presence */ }
    }
    return full;
  }

  function armTimer(ref: RoomRef, state: RoomState, dueAt: number): void {
    if (state.cancelTimer && state.timerAt <= dueAt) return;
    state.cancelTimer?.();
    state.timerAt = dueAt;
    state.cancelTimer = schedule(() => {
      state.cancelTimer = null;
      void withRoom(ref, async () => { flushDue(ref); }).catch(() => undefined);
    }, Math.max(0, dueAt - now()));
  }

  /** Emits pending updates whose window has passed; re-arms the timer for the rest. */
  function flushDue(ref: RoomRef): void {
    const state = rooms.get(roomKey(ref));
    if (!state || state.pending.size === 0) return;
    const at = now();
    let nextDue = Infinity;
    for (const [userId, member] of [...state.pending]) {
      const dueAt = (state.lastUpdate.get(userId) ?? -Infinity) + minUpdateMs;
      if (at >= dueAt) {
        state.pending.delete(userId);
        state.lastUpdate.set(userId, at);
        emit(ref, { type: "update", userId, state: member.state, connections: member.connections });
      } else {
        nextDue = Math.min(nextDue, dueAt);
      }
    }
    if (nextDue !== Infinity) armTimer(ref, state, nextDue);
  }

  function queueUpdate(ref: RoomRef, member: PresenceMember): void {
    const state = roomState(ref);
    const at = now();
    const last = state.lastUpdate.get(member.userId);
    if (last === undefined || at - last >= minUpdateMs) {
      state.pending.delete(member.userId);
      state.lastUpdate.set(member.userId, at);
      emit(ref, { type: "update", userId: member.userId, state: member.state, connections: member.connections });
      return;
    }
    state.pending.set(member.userId, member);
    armTimer(ref, state, last + minUpdateMs);
  }

  async function memberOf(ref: RoomRef, userId: string): Promise<PresenceMember | null> {
    const own = (await store.list(ref, now())).filter((item) => item.userId === userId);
    return own.length === 0 ? null : groupMembers(own)[0]!;
  }

  function userLeft(ref: RoomRef, userId: string): PresenceEvent {
    const state = roomState(ref);
    state.pending.delete(userId);
    state.lastUpdate.delete(userId);
    return emit(ref, { type: "leave", userId });
  }

  /** Inside the room lock: removes expired connections, emitting leave for users with none left. */
  async function sweepRoom(ref: RoomRef): Promise<PresenceEvent[]> {
    flushDue(ref);
    const removed = await store.removeExpired(ref, now());
    const left: PresenceEvent[] = [];
    for (const userId of new Set(removed.map((item) => item.userId))) {
      const member = await memberOf(ref, userId);
      if (member) queueUpdate(ref, member); else left.push(userLeft(ref, userId));
    }
    return left;
  }

  /** Drops in-process room state once a room is empty, unwatched and idle. */
  async function maybeForget(ref: RoomRef): Promise<void> {
    const state = rooms.get(roomKey(ref));
    if (!state || state.listeners.size > 0 || state.pending.size > 0) return;
    if ((await store.list(ref, now())).length === 0) {
      state.cancelTimer?.();
      rooms.delete(roomKey(ref));
    }
  }

  async function allowed(actor: Actor, action: PresenceAction, ref: RoomRef): Promise<void> {
    if (!actor || typeof actor.userId !== "string" || actor.userId === "") throw new PresenceError("forbidden", "Not signed in");
    if (!(await authorize(actor, action, ref))) throw new PresenceError("forbidden", "Not allowed in this room");
  }

  async function refresh(actor: Actor, ref: RoomRef, existing: PresenceConnection, state: JsonValue | undefined): Promise<PresenceConnection> {
    if (existing.userId !== actor.userId) throw new PresenceError("not-owner", "This connection belongs to another user");
    const at = now();
    const changed = state !== undefined && JSON.stringify(state) !== JSON.stringify(existing.state);
    const next: PresenceConnection = {
      ...existing, lastSeenAt: at, expiresAt: at + ttlMs,
      ...(changed ? { state: state as JsonValue, stateAt: at } : {}),
    };
    if (!(await store.replace(next))) throw new PresenceError("not-found", "Connection expired; join again");
    if (changed) {
      const member = await memberOf(ref, actor.userId);
      if (member) queueUpdate(ref, member);
    }
    return next;
  }

  return {
    /** Adds a connection. A user's first connection emits join; further tabs emit update. Re-joining an own connection refreshes it. */
    async join(actor: Actor, input: PresenceInput): Promise<PresenceConnection> {
      const ref = checkRef(input);
      const connectionId = checkConnection(input.connectionId);
      const state = input.state === undefined ? undefined : validateState(input.state, maxStateBytes);
      await allowed(actor, "join", ref);
      return withRoom(ref, async () => {
        await sweepRoom(ref);
        const existing = await store.get(ref, connectionId);
        if (existing) return refresh(actor, ref, existing, state);
        const before = await memberOf(ref, actor.userId);
        const at = now();
        const connection: PresenceConnection = {
          ...ref, connectionId, userId: actor.userId, state: state ?? null, stateAt: state === undefined ? 0 : at, joinedAt: at, lastSeenAt: at, expiresAt: at + ttlMs,
        };
        const result = await store.add(connection, maxPerRoom, at);
        if (result === "full") throw new PresenceError("room-full", "This room is full");
        if (result === "exists") throw new PresenceError("not-owner", "This connection id is in use");
        const member = (await memberOf(ref, actor.userId))!;
        if (before === null) {
          roomState(ref).lastUpdate.set(actor.userId, at);
          emit(ref, { type: "join", userId: actor.userId, state: member.state, connections: member.connections });
        } else {
          queueUpdate(ref, member);
        }
        return connection;
      });
    },

    /** Extends the connection's expiry and optionally replaces its state. Only the actor who joined may heartbeat. */
    async heartbeat(actor: Actor, input: PresenceInput): Promise<PresenceConnection> {
      const ref = checkRef(input);
      const connectionId = checkConnection(input.connectionId);
      const state = input.state === undefined ? undefined : validateState(input.state, maxStateBytes);
      await allowed(actor, "join", ref);
      return withRoom(ref, async () => {
        await sweepRoom(ref);
        const existing = await store.get(ref, connectionId);
        if (!existing) throw new PresenceError("not-found", "Connection expired or unknown; join again");
        return refresh(actor, ref, existing, state);
      });
    },

    /** Removes a connection. Idempotent for unknown ids; only the actor who joined may leave it. */
    async leave(actor: Actor, input: RoomRef & { readonly connectionId: string }): Promise<{ left: boolean }> {
      const ref = checkRef(input);
      const connectionId = checkConnection(input.connectionId);
      if (!actor || typeof actor.userId !== "string" || actor.userId === "") throw new PresenceError("forbidden", "Not signed in");
      return withRoom(ref, async () => {
        await sweepRoom(ref);
        const existing = await store.get(ref, connectionId);
        if (!existing) return { left: false };
        if (existing.userId !== actor.userId) throw new PresenceError("not-owner", "This connection belongs to another user");
        await store.remove(ref, connectionId);
        const member = await memberOf(ref, actor.userId);
        if (member) queueUpdate(ref, member); else userLeft(ref, actor.userId);
        await maybeForget(ref);
        return { left: true };
      });
    },

    /** Live members grouped by user, with the room's current seq; events with a greater seq follow this snapshot. */
    async list(actor: Actor, input: RoomRef): Promise<PresenceSnapshot> {
      const ref = checkRef(input);
      await allowed(actor, "read", ref);
      return withRoom(ref, async () => {
        await sweepRoom(ref);
        const members = groupMembers(await store.list(ref, now()));
        return { members, seq: rooms.get(roomKey(ref))?.seq ?? 0 };
      });
    },

    /** Removes expired connections in every room; returns the leave events per room. */
    async sweep(): Promise<SweepResult[]> {
      const results: SweepResult[] = [];
      for (const ref of await store.expiredRooms(now())) {
        const left = await withRoom(ref, async () => {
          const events = await sweepRoom(ref);
          await maybeForget(ref);
          return events;
        });
        if (left.length > 0) results.push({ tenantId: ref.tenantId, room: ref.room, left });
      }
      return results;
    },

    /**
     * In-process listener for one room's events, in seq order. Trusted server call: authorize `read` first
     * (the HTTP adapter does). Returns an unsubscribe function.
     */
    subscribe(tenantId: string, room: string, listener: PresenceListener): () => void {
      const ref = checkRef({ tenantId, room });
      const state = roomState(ref);
      state.listeners.add(listener);
      return () => { state.listeners.delete(listener); };
    },

    /** Cancels pending flush timers (for shutdown and tests). Pending updates are dropped. */
    close(): void {
      for (const state of rooms.values()) {
        state.cancelTimer?.();
        state.cancelTimer = null;
        state.pending.clear();
      }
    },
  };
}

export type Presence = ReturnType<typeof createPresence>;
