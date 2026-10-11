// SPDX-License-Identifier: Apache-2.0
// In-app notification inbox (the bell menu): publish, list, count unread, mark read, archive and
// prune, framework-neutral. The receiving application supplies persistence and, optionally, an
// authorization hook. Every read and write is scoped to the actor's own tenantId + userId: ids that
// belong to anyone else are silently ignored, never acted on.
//
// Suggested SQL shape for a production InboxStore:
//   CREATE TABLE inbox_items (
//     id text PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
//     kind text NOT NULL, title text NOT NULL, body text, link text, dedupe_key text, data jsonb,
//     created_at bigint NOT NULL, read_at bigint, archived_at bigint);
//   CREATE INDEX inbox_page ON inbox_items (tenant_id, user_id, created_at DESC, id DESC)
//     WHERE archived_at IS NULL;
//   CREATE UNIQUE INDEX inbox_dedupe ON inbox_items (tenant_id, user_id, dedupe_key)
//     WHERE dedupe_key IS NOT NULL;                                   -- insert -> false on conflict
//   page:        ... WHERE tenant_id = $1 AND user_id = $2 AND archived_at IS NULL
//                    AND (created_at, id) < ($3, $4) [AND read_at IS NULL]
//                    ORDER BY created_at DESC, id DESC LIMIT $5;
//   updateMany:  UPDATE inbox_items SET read_at = COALESCE(read_at, $3)
//                WHERE tenant_id = $1 AND user_id = $2 AND id = ANY($4);  -- one statement, scoped
//   deleteWhere: DELETE ... WHERE created_at < $1;  and, for the per-user cap,
//                DELETE ... WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER
//                  (PARTITION BY tenant_id, user_id ORDER BY created_at DESC, id DESC) AS n
//                  FROM inbox_items) ranked WHERE n > $1);

export interface Recipient {
  readonly tenantId: string;
  readonly userId: string;
}

/** The signed-in user reading their own inbox. */
export type Actor = Recipient;

export interface InboxItem extends Recipient {
  readonly id: string;
  /** Application-defined category, e.g. "comment.mention" or "invoice.paid". */
  readonly kind: string;
  readonly title: string;
  readonly body?: string;
  /** A relative path ("/projects/42") or an https URL. */
  readonly link?: string;
  readonly dedupeKey?: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly readAt?: number;
  readonly archivedAt?: number;
}

/** What the HTTP layer returns to the reader (no dedupe key or recipient fields). */
export type PublicInboxItem = Omit<InboxItem, "dedupeKey" | "tenantId" | "userId">;

export interface PageQuery {
  /** Return only items strictly older than this position (createdAt, then id) in newest-first order. */
  readonly before?: { readonly createdAt: number; readonly id: string };
  readonly limit: number;
  readonly unreadOnly: boolean;
}

/** Which of the recipient's items an update touches: listed ids, or every item created at or before a time. */
export type UpdateTarget = { readonly ids: readonly string[] } | { readonly createdAtOrBefore: number };

/** Fields are only set where they are still unset, so the first read or archive time is kept. */
export type ItemPatch = { readonly readAt: number } | { readonly archivedAt: number };

export type DeleteRule =
  | { readonly createdBefore: number; readonly recipient?: Recipient }
  | { readonly keepNewestPerUser: number };

export interface InboxStore {
  /** Inserts the item. Returns false (inserting nothing) when the recipient already has an item with the same dedupeKey. */
  insert(item: InboxItem): Promise<boolean>;
  findByDedupe(recipient: Recipient, dedupeKey: string): Promise<InboxItem | null>;
  /** Unarchived items for the recipient, newest first (createdAt DESC, id DESC). */
  page(recipient: Recipient, query: PageQuery): Promise<InboxItem[]>;
  /** Unread, unarchived items for the recipient. */
  countUnread(recipient: Recipient): Promise<number>;
  /**
   * Atomically applies the patch to the recipient's matching items, in ONE statement scoped by
   * tenantId and userId, and returns how many rows changed. Ids that belong to another recipient
   * must not match. Archived items are not marked read by a createdAtOrBefore target.
   */
  updateMany(recipient: Recipient, target: UpdateTarget, patch: ItemPatch): Promise<number>;
  /** Deletes matching items and returns how many were removed. */
  deleteWhere(rule: DeleteRule): Promise<number>;
}

export type InboxAction = "list" | "count" | "mark-read" | "archive";

export interface InboxOptions {
  readonly store: InboxStore;
  /**
   * Optional extra check, e.g. that the actor is still a member of the tenant. Return false to
   * deny. Ownership scoping is always enforced regardless of this hook.
   */
  readonly authorize?: (actor: Actor, action: InboxAction) => Promise<boolean>;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Items kept per user by prune(); the oldest beyond this are dropped. Default 500; 1 to 10,000. */
  readonly maxPerUser?: number;
  /** How long items live and how long a dedupeKey stays claimed. Default 90 days; 1 hour to 2 years. */
  readonly retentionMs?: number;
  /** Maximum JSON size of `data` in bytes. Default 4096; at most 65,536. */
  readonly maxDataBytes?: number;
}

export interface PublishInput {
  readonly kind: string;
  readonly title: string;
  readonly body?: string;
  readonly link?: string;
  readonly dedupeKey?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export type InboxErrorCode =
  | "forbidden" | "invalid-recipient" | "invalid-kind" | "invalid-title" | "invalid-body" | "invalid-link"
  | "invalid-dedupe-key" | "invalid-data" | "invalid-ids" | "invalid-cursor" | "invalid-limit"
  | "invalid-before" | "bad-request";

export class InboxError extends Error {
  constructor(readonly code: InboxErrorCode, message: string) {
    super(message);
    this.name = "InboxError";
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SCOPE_ID = /^[\w.:@-]{1,128}$/;
const ITEM_ID = /^[\w-]{1,64}$/;
const KIND = /^[A-Za-z0-9][\w.:-]{0,63}$/;
// C0 controls and DEL; titles and bodies are shown as text, never HTML.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const MAX_TITLE = 200;
export const MAX_BODY = 2000;
export const MAX_LINK = 2048;
export const MAX_IDS = 100;
export const MAX_LIMIT = 50;

/**
 * Accepts a same-site relative path ("/a/b?c#d") or an absolute https URL. Rejects javascript:,
 * data:, http:, protocol-relative ("//host"), backslash tricks, whitespace and control characters.
 */
export function isSafeLink(link: string): boolean {
  if (link.length === 0 || link.length > MAX_LINK || /[\s\\\u0000-\u001F\u007F]/.test(link)) return false;
  if (link.startsWith("/")) return !link.startsWith("//");
  try {
    const url = new URL(link);
    return url.protocol === "https:" && url.hostname.length > 0 && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function checkRecipient(value: Recipient): Recipient {
  if (!value || typeof value.tenantId !== "string" || typeof value.userId !== "string" ||
    !SCOPE_ID.test(value.tenantId) || !SCOPE_ID.test(value.userId)) {
    throw new InboxError("invalid-recipient", "Invalid tenantId or userId");
  }
  return { tenantId: value.tenantId, userId: value.userId };
}

function checkIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && ITEM_ID.test(id))) {
    throw new InboxError("invalid-ids", `ids must be 1 to ${MAX_IDS} item ids`);
  }
  return [...new Set(ids as string[])];
}

function base64UrlEncode(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text: string): string {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/** Cursors are opaque to clients. They are not signed: they only position within the actor's own items. */
function encodeCursor(item: InboxItem): string {
  return base64UrlEncode(JSON.stringify([item.createdAt, item.id]));
}

function decodeCursor(cursor: string): { createdAt: number; id: string } {
  try {
    if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const value: unknown = JSON.parse(base64UrlDecode(cursor));
    if (Array.isArray(value) && value.length === 2 && Number.isSafeInteger(value[0]) && typeof value[1] === "string" && ITEM_ID.test(value[1])) {
      return { createdAt: value[0] as number, id: value[1] };
    }
  } catch {
    // fall through
  }
  throw new InboxError("invalid-cursor", "Invalid cursor");
}

export function toPublic(item: InboxItem): PublicInboxItem {
  const { dedupeKey: _key, tenantId: _tenant, userId: _user, ...rest } = item;
  return rest;
}

export function createInbox(options: InboxOptions) {
  const maxPerUser = options.maxPerUser ?? 500;
  if (!Number.isInteger(maxPerUser) || maxPerUser < 1 || maxPerUser > 10_000) throw new RangeError("maxPerUser must be 1 to 10,000");
  const retentionMs = options.retentionMs ?? 90 * DAY;
  if (!Number.isInteger(retentionMs) || retentionMs < HOUR || retentionMs > 730 * DAY) throw new RangeError("retentionMs must be 1 hour to 2 years");
  const maxDataBytes = options.maxDataBytes ?? 4096;
  if (!Number.isInteger(maxDataBytes) || maxDataBytes < 0 || maxDataBytes > 65_536) throw new RangeError("maxDataBytes must be 0 to 65,536");
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { store } = options;

  async function scope(actor: Actor, action: InboxAction): Promise<Recipient> {
    const recipient = checkRecipient(actor);
    if (options.authorize && !(await options.authorize(recipient, action))) throw new InboxError("forbidden", "Not allowed");
    return recipient;
  }

  function validate(input: PublishInput): Omit<InboxItem, "id" | "tenantId" | "userId" | "createdAt"> {
    if (!input || typeof input !== "object") throw new InboxError("bad-request", "Expected a notification object");
    if (typeof input.kind !== "string" || !KIND.test(input.kind)) throw new InboxError("invalid-kind", "kind must be 1 to 64 letters, digits, '.', ':', '_' or '-'");
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length === 0 || title.length > MAX_TITLE || CONTROL.test(title) || /[\r\n]/.test(title)) {
      throw new InboxError("invalid-title", `title must be 1 to ${MAX_TITLE} characters on one line`);
    }
    const item: { kind: string; title: string; body?: string; link?: string; dedupeKey?: string; data?: Record<string, unknown> } = { kind: input.kind, title };
    if (input.body !== undefined) {
      if (typeof input.body !== "string" || input.body.length > MAX_BODY || CONTROL.test(input.body)) throw new InboxError("invalid-body", `body must be at most ${MAX_BODY} characters`);
      if (input.body.trim()) item.body = input.body.trim();
    }
    if (input.link !== undefined) {
      if (typeof input.link !== "string" || !isSafeLink(input.link)) throw new InboxError("invalid-link", "link must be a relative path or an https URL");
      item.link = input.link;
    }
    if (input.dedupeKey !== undefined) {
      if (typeof input.dedupeKey !== "string" || input.dedupeKey.length === 0 || input.dedupeKey.length > 200 || CONTROL.test(input.dedupeKey)) {
        throw new InboxError("invalid-dedupe-key", "dedupeKey must be 1 to 200 characters");
      }
      item.dedupeKey = input.dedupeKey;
    }
    if (input.data !== undefined) {
      if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) throw new InboxError("invalid-data", "data must be a JSON object");
      let json: string;
      try {
        json = JSON.stringify(input.data);
      } catch {
        throw new InboxError("invalid-data", "data must be JSON-serializable");
      }
      if (new TextEncoder().encode(json).length > maxDataBytes) throw new InboxError("invalid-data", `data must be at most ${maxDataBytes} bytes of JSON`);
      // Store a detached copy so later caller mutations cannot change the stored item.
      item.data = JSON.parse(json) as Record<string, unknown>;
    }
    return item;
  }

  return {
    /**
     * Server-only: adds a notification to one user's inbox. Never expose this over HTTP; call it from
     * your own trusted code after deciding who should be told. With a dedupeKey, repeating the call for
     * the same recipient within the retention window returns the existing item (idempotent).
     */
    async publish(recipient: Recipient, input: PublishInput): Promise<InboxItem> {
      const to = checkRecipient(recipient);
      const fields = validate(input);
      const at = now();
      if (fields.dedupeKey !== undefined) {
        const existing = await store.findByDedupe(to, fields.dedupeKey);
        if (existing && existing.createdAt >= at - retentionMs) return existing;
        // A claimed key past retention is released by pruning this recipient's expired items.
        if (existing) await store.deleteWhere({ createdBefore: at - retentionMs, recipient: to });
      }
      const item: InboxItem = { id: newId(), ...to, ...fields, createdAt: at };
      if (await store.insert(item)) return item;
      // Lost a race with a concurrent publish of the same dedupeKey: return the winner.
      const winner = fields.dedupeKey !== undefined ? await store.findByDedupe(to, fields.dedupeKey) : null;
      if (!winner) throw new Error("InboxStore.insert returned false without a dedupe conflict");
      return winner;
    },

    /** Newest first; pass the returned nextCursor to read the next page. Archived items are left out. */
    async list(actor: Actor, query: { cursor?: string; limit?: number; unreadOnly?: boolean } = {}): Promise<{ items: PublicInboxItem[]; nextCursor: string | null }> {
      const recipient = await scope(actor, "list");
      const limit = query.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new InboxError("invalid-limit", `limit must be 1 to ${MAX_LIMIT}`);
      const before = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await store.page(recipient, { ...(before ? { before } : {}), limit: limit + 1, unreadOnly: query.unreadOnly === true });
      const visible = rows.filter((item) => item.tenantId === recipient.tenantId && item.userId === recipient.userId).slice(0, limit + 1);
      const items = visible.slice(0, limit);
      const last = items[items.length - 1];
      return { items: items.map(toPublic), nextCursor: visible.length > limit && last ? encodeCursor(last) : null };
    },

    async unreadCount(actor: Actor): Promise<number> {
      return store.countUnread(await scope(actor, "count"));
    },

    /** Marks the actor's own listed items read. Unknown ids and other users' ids are ignored. */
    async markRead(actor: Actor, ids: readonly string[]): Promise<{ updated: number }> {
      const recipient = await scope(actor, "mark-read");
      return { updated: await store.updateMany(recipient, { ids: checkIds(ids) }, { readAt: now() }) };
    },

    /** Marks every unread item created at or before `before` (default: now) read. */
    async markAllRead(actor: Actor, options: { before?: number } = {}): Promise<{ updated: number }> {
      const recipient = await scope(actor, "mark-read");
      const at = now();
      const before = options.before ?? at;
      if (!Number.isSafeInteger(before) || before < 0) throw new InboxError("invalid-before", "before must be a timestamp in milliseconds");
      return { updated: await store.updateMany(recipient, { createdAtOrBefore: before }, { readAt: at }) };
    },

    /** Hides the actor's own listed items from list and unread counts. Other users' ids are ignored. */
    async archive(actor: Actor, ids: readonly string[]): Promise<{ updated: number }> {
      const recipient = await scope(actor, "archive");
      return { updated: await store.updateMany(recipient, { ids: checkIds(ids) }, { archivedAt: now() }) };
    },

    /** Drops items past retention, then the oldest beyond maxPerUser per user. Run it on a schedule. */
    async prune(): Promise<{ expired: number; overflow: number }> {
      const expired = await store.deleteWhere({ createdBefore: now() - retentionMs });
      const overflow = await store.deleteWhere({ keepNewestPerUser: maxPerUser });
      return { expired, overflow };
    },
  };
}

export type Inbox = ReturnType<typeof createInbox>;
