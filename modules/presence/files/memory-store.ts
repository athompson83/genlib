// SPDX-License-Identifier: Apache-2.0
// In-memory PresenceStore for one server process, tests and prototypes. Presence is ephemeral, so this store is
// also fine in production for a single instance. Several instances need a shared store such as Redis (see
// CONTRACT.md for the sorted-set shape) plus pub/sub for events.
import type { PresenceConnection, PresenceStore, RoomRef } from "./core.js";

const key = (ref: RoomRef): string => `${ref.tenantId}\u0000${ref.room}`;
const copy = (item: PresenceConnection): PresenceConnection => ({ ...item, state: structuredClone(item.state) });

export class MemoryPresenceStore implements PresenceStore {
  /** room key -> connectionId -> connection */
  readonly #rooms = new Map<string, Map<string, PresenceConnection>>();

  async get(ref: RoomRef, connectionId: string): Promise<PresenceConnection | null> {
    const item = this.#rooms.get(key(ref))?.get(connectionId);
    return item ? copy(item) : null;
  }

  async add(connection: PresenceConnection, maxPerRoom: number, now: number): Promise<"added" | "full" | "exists"> {
    let room = this.#rooms.get(key(connection));
    if (!room) {
      room = new Map();
      this.#rooms.set(key(connection), room);
    }
    if (room.has(connection.connectionId)) return "exists";
    let live = 0;
    for (const item of room.values()) if (item.expiresAt > now) live++;
    if (live >= maxPerRoom) return "full";
    room.set(connection.connectionId, copy(connection));
    return "added";
  }

  async replace(connection: PresenceConnection): Promise<boolean> {
    const room = this.#rooms.get(key(connection));
    if (!room?.has(connection.connectionId)) return false;
    room.set(connection.connectionId, copy(connection));
    return true;
  }

  async remove(ref: RoomRef, connectionId: string): Promise<PresenceConnection | null> {
    const room = this.#rooms.get(key(ref));
    const item = room?.get(connectionId);
    if (!room || !item) return null;
    room.delete(connectionId);
    if (room.size === 0) this.#rooms.delete(key(ref));
    return item;
  }

  async list(ref: RoomRef, now: number): Promise<PresenceConnection[]> {
    const room = this.#rooms.get(key(ref));
    if (!room) return [];
    return [...room.values()].filter((item) => item.expiresAt > now).map(copy);
  }

  async expiredRooms(now: number): Promise<RoomRef[]> {
    const out: RoomRef[] = [];
    for (const room of this.#rooms.values()) {
      for (const item of room.values()) {
        if (item.expiresAt <= now) {
          out.push({ tenantId: item.tenantId, room: item.room });
          break;
        }
      }
    }
    return out;
  }

  async removeExpired(ref: RoomRef, now: number): Promise<PresenceConnection[]> {
    const room = this.#rooms.get(key(ref));
    if (!room) return [];
    const removed: PresenceConnection[] = [];
    for (const [id, item] of room) {
      if (item.expiresAt <= now) {
        room.delete(id);
        removed.push(item);
      }
    }
    if (room.size === 0) this.#rooms.delete(key(ref));
    return removed;
  }
}
