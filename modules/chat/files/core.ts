// SPDX-License-Identifier: Apache-2.0
// In-app chat between users of a multi-tenant app: direct (1:1) and group conversations, idempotent sends with a
// gap-free per-conversation sequence number, edit window, soft delete, history paging, read positions, unread
// counts, an inbox ordered by last message, and user blocking. Framework-neutral: the receiving application
// supplies persistence (ChatStore), tenant authorization and realtime delivery (onMessage). Bodies are plain text;
// this module never renders HTML. For typing indicators, use a separate presence module (one room per
// conversation); this module does not import it.

export type ConversationKind = "direct" | "group";
export type MemberRole = "admin" | "member";

export interface Conversation {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: ConversationKind;
  /** Direct conversations only: `tenantId|userA|userB` with the two user ids sorted. Unique. */
  readonly directKey: string | null;
  /** Group conversations only. */
  readonly title: string | null;
  /** Highest message seq allocated so far (0 before the first message). */
  readonly lastSeq: number;
  readonly lastMessageAt: number | null;
  readonly createdAt: number;
}

export interface Member {
  readonly conversationId: string;
  readonly userId: string;
  readonly role: MemberRole;
  readonly joinedAt: number;
  /** Set when the member left or was removed; null while active. */
  readonly leftAt: number | null;
  /** The conversation's lastSeq when the member left: history stops there. */
  readonly leftSeq: number | null;
  readonly lastReadSeq: number;
}

export interface ChatMessage {
  readonly conversationId: string;
  /** 1, 2, 3 ... per conversation, gap-free and unique. */
  readonly seq: number;
  readonly id: string;
  readonly senderId: string;
  /** Client-generated id; a retry with the same clientId returns the stored message instead of a duplicate. */
  readonly clientId: string;
  /** null once soft-deleted. */
  readonly body: string | null;
  readonly createdAt: number;
  readonly editedAt: number | null;
  readonly deletedAt: number | null;
}

export interface NewMessage {
  readonly conversationId: string;
  readonly id: string;
  readonly senderId: string;
  readonly clientId: string;
  readonly body: string;
  readonly createdAt: number;
}

export interface HistoryQuery {
  /** Messages with seq < beforeSeq (newest page below it). */
  readonly beforeSeq?: number;
  /** Messages with seq > afterSeq (oldest page above it). Takes precedence for direction when both are given. */
  readonly afterSeq?: number;
  /** Upper bound (inclusive), used for removed members. */
  readonly maxSeq?: number;
  readonly limit: number;
}

/** Keyset position for the inbox: (activityAt, id), where activityAt is lastMessageAt or createdAt. */
export interface InboxCursor { readonly activityAt: number; readonly id: string }

export interface InboxRow {
  readonly conversation: Conversation;
  readonly member: Member;
  readonly lastMessage: ChatMessage | null;
}

export interface ChatStore {
  findConversation(id: string): Promise<Conversation | null>;
  /**
   * Returns the direct conversation for `conversation.directKey`, creating it with both members when absent.
   * Must be atomic: concurrent calls for the same key, from either side, end with one conversation.
   */
  openDirect(conversation: Conversation, members: readonly Member[]): Promise<Conversation>;
  createGroup(conversation: Conversation, members: readonly Member[]): Promise<void>;
  /** The member row (active or left), or null. */
  getMember(conversationId: string, userId: string): Promise<Member | null>;
  /** Active members, oldest first. */
  listMembers(conversationId: string): Promise<Member[]>;
  /**
   * Adds the users as `member` (re-activating a left member) unless the active count would exceed `maxMembers`,
   * in which case nothing changes and null is returned. Already-active users are skipped. Returns the added rows.
   */
  addMembers(conversationId: string, userIds: readonly string[], at: number, maxMembers: number): Promise<Member[] | null>;
  /**
   * Marks an active member as left at the conversation's current lastSeq. When no active admin remains, the
   * oldest remaining active member becomes admin, in the same transaction. Returns the left row, or null.
   */
  leave(conversationId: string, userId: string, at: number): Promise<Member | null>;
  /**
   * Idempotent send. When (conversationId, senderId, clientId) exists, returns it with created false. Otherwise,
   * only while the sender is an active member, allocates lastSeq + 1 and inserts the message in one transaction,
   * sets lastMessageAt and advances the sender's lastReadSeq. Returns null when the sender is not an active member.
   */
  appendMessage(message: NewMessage): Promise<{ message: ChatMessage; created: boolean } | null>;
  getMessage(conversationId: string, seq: number): Promise<ChatMessage | null>;
  /** Replaces the body only while not deleted. */
  editMessage(conversationId: string, seq: number, body: string, at: number): Promise<ChatMessage | null>;
  /** Sets body null and deletedAt only while not deleted. */
  deleteMessage(conversationId: string, seq: number, at: number): Promise<ChatMessage | null>;
  /** Messages in ascending seq order, at most `limit`. Without afterSeq, the newest page below beforeSeq. */
  history(conversationId: string, query: HistoryQuery): Promise<ChatMessage[]>;
  /** lastReadSeq = max(lastReadSeq, seq). Returns the stored value, or null when not a member. */
  markRead(conversationId: string, userId: string, seq: number): Promise<number | null>;
  /** Not-deleted messages from other senders after the user's lastReadSeq, per active conversation in the tenant. */
  unreadCounts(tenantId: string, userId: string, conversationIds?: readonly string[]): Promise<Map<string, number>>;
  /** The user's active conversations in the tenant, newest activity first, strictly after the cursor. */
  listInbox(tenantId: string, userId: string, cursor: InboxCursor | null, limit: number): Promise<InboxRow[]>;
  addBlock(blockerId: string, blockedId: string, at: number): Promise<void>;
  removeBlock(blockerId: string, blockedId: string): Promise<void>;
  /** True when either user blocked the other. */
  isBlocked(userA: string, userB: string): Promise<boolean>;
}

export interface Actor { readonly userId: string }

/**
 * `use`: the actor may use chat in the tenant (checked on every call, against the conversation's tenant).
 * `reach`: `userId` may be added to a conversation in the tenant (checked for direct partners and new members).
 */
export type ChatAction = "use" | "reach";

export type ChatEventType = "message" | "edited" | "deleted";

export interface ChatEvent {
  readonly type: ChatEventType;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly message: ChatMessage;
  /** Active members at the time of the event, including the sender. Deliver to their streams. */
  readonly recipientIds: readonly string[];
}

export interface ChatOptions {
  readonly store: ChatStore;
  /**
   * Tenant membership check. Without it every signed-in user may chat in any tenant id and message any user id,
   * which is only acceptable for a single-tenant prototype. Return false to deny.
   */
  readonly authorize?: (actor: Actor, action: ChatAction, context: { tenantId: string; userId?: string }) => Promise<boolean>;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Maximum message length in UTF-16 code units after trimming. Default 4,000. */
  readonly maxBody?: number;
  /** Maximum active members in a group, including the creator. Default 256. */
  readonly maxMembers?: number;
  /** How long a sender may edit a message. Default 15 minutes. */
  readonly editWindowMs?: number;
  /**
   * Fan-out hook, called after a new message, an edit or a delete is stored (not for an idempotent replay).
   * Errors are caught and passed to onError so a delivery failure never fails a stored send.
   */
  readonly onMessage?: (event: ChatEvent) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}

export interface ConversationView {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: ConversationKind;
  readonly title: string | null;
  /** Direct conversations: the other participant. */
  readonly otherUserId?: string;
  readonly lastSeq: number;
  readonly lastMessageAt: number | null;
  readonly createdAt: number;
}

export interface MessagePreview {
  readonly seq: number;
  readonly senderId: string;
  /** First 140 characters, or null when deleted. */
  readonly body: string | null;
  readonly createdAt: number;
}

export interface InboxItem extends ConversationView {
  readonly role: MemberRole;
  readonly lastReadSeq: number;
  readonly unread: number;
  readonly lastMessage: MessagePreview | null;
}

export interface HistoryPage {
  readonly messages: ChatMessage[];
  /** More messages exist in the requested direction. */
  readonly hasMore: boolean;
}

export type ChatErrorCode =
  | "forbidden" | "not-found" | "blocked" | "invalid-tenant" | "invalid-user" | "invalid-title" | "invalid-members"
  | "too-many-members" | "invalid-body" | "invalid-client-id" | "invalid-seq" | "invalid-limit" | "invalid-cursor"
  | "not-group" | "not-member" | "edit-window-closed" | "deleted" | "bad-request" | "too-large";

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  constructor(code: ChatErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ChatError";
  }
}

const TENANT = /^[\w.:-]{1,128}$/;
const USER = /^[\w.@:-]{1,128}$/;
const ID = /^[\w-]{1,64}$/;
const CLIENT_ID = /^[\w.:-]{1,64}$/;
const MAX_TITLE = 200;
const PREVIEW = 140;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** The unique key of the direct conversation between two users in one tenant (order-independent). */
export function directKey(tenantId: string, userA: string, userB: string): string {
  const [first, second] = userA < userB ? [userA, userB] : [userB, userA];
  return `${tenantId}|${first}|${second}`;
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

export function encodeInboxCursor(position: InboxCursor): string {
  return base64UrlEncode(JSON.stringify([position.activityAt, position.id]));
}

export function decodeInboxCursor(cursor: string | null | undefined): InboxCursor | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  try {
    if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const value: unknown = JSON.parse(base64UrlDecode(cursor));
    if (!Array.isArray(value) || value.length !== 2) throw new Error("shape");
    const [activityAt, id] = value as unknown[];
    if (typeof activityAt !== "number" || !Number.isSafeInteger(activityAt) || typeof id !== "string" || !ID.test(id)) throw new Error("shape");
    return { activityAt, id };
  } catch {
    throw new ChatError("invalid-cursor", "Invalid cursor");
  }
}

function integerOption(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return result;
}

export function createChat(options: ChatOptions) {
  const { store } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const maxBody = integerOption(options.maxBody, 4000, 1, 100_000, "maxBody");
  const maxMembers = integerOption(options.maxMembers, 256, 2, 100_000, "maxMembers");
  const editWindowMs = integerOption(options.editWindowMs, 15 * 60 * 1000, 0, 365 * 24 * 60 * 60 * 1000, "editWindowMs");

  async function allowed(actor: Actor, action: ChatAction, tenantId: string, userId?: string): Promise<boolean> {
    if (!options.authorize) return true;
    return (await options.authorize(actor, action, userId === undefined ? { tenantId } : { tenantId, userId })) === true;
  }

  function checkActor(actor: Actor): void {
    if (!actor || typeof actor.userId !== "string" || !USER.test(actor.userId)) throw new ChatError("forbidden", "Invalid actor");
  }

  function checkTenant(tenantId: unknown): string {
    if (typeof tenantId !== "string" || !TENANT.test(tenantId)) throw new ChatError("invalid-tenant", "Invalid tenant id");
    return tenantId;
  }

  function checkUser(userId: unknown): string {
    if (typeof userId !== "string" || !USER.test(userId)) throw new ChatError("invalid-user", "Invalid user id");
    return userId;
  }

  async function useTenant(actor: Actor, tenantId: unknown): Promise<string> {
    checkActor(actor);
    const tenant = checkTenant(tenantId);
    if (!(await allowed(actor, "use", tenant))) throw new ChatError("forbidden", "Not allowed");
    return tenant;
  }

  async function requireReach(actor: Actor, tenantId: string, userIds: readonly string[]): Promise<void> {
    for (const userId of userIds) {
      if (!(await allowed(actor, "reach", tenantId, userId))) throw new ChatError("forbidden", `User ${userId} cannot be added`);
    }
  }

  /** Loads a conversation the actor belongs to (active or left). Unknown, other-tenant and non-member ids are not-found. */
  async function membership(actor: Actor, conversationId: unknown): Promise<{ conversation: Conversation; member: Member }> {
    checkActor(actor);
    if (typeof conversationId !== "string" || !ID.test(conversationId)) throw new ChatError("not-found", "Conversation not found");
    const conversation = await store.findConversation(conversationId);
    const member = conversation ? await store.getMember(conversation.id, actor.userId) : null;
    if (!conversation || !member || !(await allowed(actor, "use", conversation.tenantId))) throw new ChatError("not-found", "Conversation not found");
    return { conversation, member };
  }

  async function activeMembership(actor: Actor, conversationId: unknown) {
    const found = await membership(actor, conversationId);
    if (found.member.leftAt !== null) throw new ChatError("not-member", "You are no longer a member of this conversation");
    return found;
  }

  function otherOf(conversation: Conversation, userId: string): string | undefined {
    if (conversation.kind !== "direct" || conversation.directKey === null) return undefined;
    const [, first, second] = conversation.directKey.split("|");
    return first === userId ? second : first;
  }

  function view(conversation: Conversation, userId: string): ConversationView {
    const other = otherOf(conversation, userId);
    return {
      id: conversation.id, tenantId: conversation.tenantId, kind: conversation.kind, title: conversation.title,
      ...(other === undefined ? {} : { otherUserId: other }),
      lastSeq: conversation.lastSeq, lastMessageAt: conversation.lastMessageAt, createdAt: conversation.createdAt,
    };
  }

  function cleanBody(body: unknown): string {
    if (typeof body !== "string") throw new ChatError("invalid-body", "Body must be text");
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > maxBody) throw new ChatError("invalid-body", `Body must be 1 to ${maxBody} characters`);
    return trimmed;
  }

  function checkSeq(seq: unknown, min = 1): number {
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < min) throw new ChatError("invalid-seq", "Invalid seq");
    return seq;
  }

  function checkLimit(limit: unknown, fallback: number, max: number): number {
    if (limit === undefined) return fallback;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > max) throw new ChatError("invalid-limit", `limit must be 1 to ${max}`);
    return limit;
  }

  async function emit(type: ChatEventType, conversation: Conversation, message: ChatMessage): Promise<void> {
    if (!options.onMessage) return;
    try {
      const recipients = (await store.listMembers(conversation.id)).map((member) => member.userId);
      await options.onMessage({ type, tenantId: conversation.tenantId, conversationId: conversation.id, message, recipientIds: recipients });
    } catch (error) {
      options.onError?.(error);
    }
  }

  async function loadMessage(conversationId: string, seq: unknown, member: Member): Promise<ChatMessage> {
    const value = checkSeq(seq);
    if (member.leftSeq !== null && value > member.leftSeq) throw new ChatError("not-found", "Message not found");
    const message = await store.getMessage(conversationId, value);
    if (!message) throw new ChatError("not-found", "Message not found");
    return message;
  }

  async function removeMember(actor: Actor, conversationId: string, userId: string): Promise<Member> {
    const { conversation, member } = await activeMembership(actor, conversationId);
    if (conversation.kind !== "group") throw new ChatError("not-group", "Direct conversations have no membership changes");
    const target = checkUser(userId);
    if (target !== actor.userId && member.role !== "admin") throw new ChatError("forbidden", "Only group admins can remove members");
    const left = await store.leave(conversation.id, target, now());
    if (!left) throw new ChatError("not-member", "That user is not an active member");
    return left;
  }

  return {
    /** Returns the direct conversation between the actor and another user in a tenant, creating it once. */
    async openDirect(actor: Actor, input: { tenantId: string; otherUserId: string }): Promise<ConversationView> {
      const tenantId = await useTenant(actor, input?.tenantId);
      const other = checkUser(input.otherUserId);
      if (other === actor.userId) throw new ChatError("invalid-user", "Cannot open a direct conversation with yourself");
      await requireReach(actor, tenantId, [other]);
      if (await store.isBlocked(actor.userId, other)) throw new ChatError("blocked", "Messaging between these users is blocked");
      const at = now();
      const conversation: Conversation = {
        id: newId(), tenantId, kind: "direct", directKey: directKey(tenantId, actor.userId, other), title: null,
        lastSeq: 0, lastMessageAt: null, createdAt: at,
      };
      const member = (userId: string): Member => ({ conversationId: conversation.id, userId, role: "member", joinedAt: at, leftAt: null, leftSeq: null, lastReadSeq: 0 });
      const stored = await store.openDirect(conversation, [member(actor.userId), member(other)]);
      return view(stored, actor.userId);
    },

    /** Creates a group with the actor as its admin and the other users as members. */
    async createGroup(actor: Actor, input: { tenantId: string; title: string; memberIds: readonly string[] }): Promise<ConversationView> {
      const tenantId = await useTenant(actor, input?.tenantId);
      if (typeof input.title !== "string" || input.title.trim().length === 0 || input.title.trim().length > MAX_TITLE) {
        throw new ChatError("invalid-title", `Title must be 1 to ${MAX_TITLE} characters`);
      }
      if (!Array.isArray(input.memberIds)) throw new ChatError("invalid-members", "memberIds must be a list");
      const others = [...new Set(input.memberIds.map(checkUser))].filter((id) => id !== actor.userId);
      if (others.length + 1 > maxMembers) throw new ChatError("too-many-members", `A group holds at most ${maxMembers} members`);
      await requireReach(actor, tenantId, others);
      const at = now();
      const conversation: Conversation = {
        id: newId(), tenantId, kind: "group", directKey: null, title: input.title.trim(), lastSeq: 0, lastMessageAt: null, createdAt: at,
      };
      const member = (userId: string, role: MemberRole): Member => ({ conversationId: conversation.id, userId, role, joinedAt: at, leftAt: null, leftSeq: null, lastReadSeq: 0 });
      await store.createGroup(conversation, [member(actor.userId, "admin"), ...others.map((id) => member(id, "member"))]);
      return view(conversation, actor.userId);
    },

    /** Active members of a conversation the actor belongs to. */
    async members(actor: Actor, conversationId: string): Promise<Member[]> {
      await membership(actor, conversationId);
      return store.listMembers(conversationId);
    },

    /** Group admins add users; a previously removed user is re-activated. */
    async addMembers(actor: Actor, conversationId: string, userIds: readonly string[]): Promise<Member[]> {
      const { conversation, member } = await activeMembership(actor, conversationId);
      if (conversation.kind !== "group") throw new ChatError("not-group", "Members can only be added to groups");
      if (member.role !== "admin") throw new ChatError("forbidden", "Only group admins can add members");
      if (!Array.isArray(userIds) || userIds.length === 0) throw new ChatError("invalid-members", "userIds must be a non-empty list");
      const ids = [...new Set(userIds.map(checkUser))];
      await requireReach(actor, conversation.tenantId, ids);
      const added = await store.addMembers(conversation.id, ids, now(), maxMembers);
      if (added === null) throw new ChatError("too-many-members", `A group holds at most ${maxMembers} members`);
      return added;
    },

    /** A group admin removes a member, or any member removes themself (leave). The last admin leaving promotes the oldest member. */
    removeMember,

    /** The actor leaves a group. */
    leave: (actor: Actor, conversationId: string): Promise<Member> => removeMember(actor, conversationId, actor?.userId),

    /** Sends a plain-text message. A retry with the same clientId returns the stored message (created false). */
    async send(actor: Actor, conversationId: string, input: { body: string; clientId: string }): Promise<{ message: ChatMessage; created: boolean }> {
      const { conversation } = await activeMembership(actor, conversationId);
      const body = cleanBody(input?.body);
      if (typeof input.clientId !== "string" || !CLIENT_ID.test(input.clientId)) throw new ChatError("invalid-client-id", "clientId must be 1 to 64 letters, digits, _ . : or -");
      if (conversation.kind === "direct") {
        const other = otherOf(conversation, actor.userId);
        if (other !== undefined && (await store.isBlocked(actor.userId, other))) throw new ChatError("blocked", "Messaging between these users is blocked");
      }
      const result = await store.appendMessage({ conversationId: conversation.id, id: newId(), senderId: actor.userId, clientId: input.clientId, body, createdAt: now() });
      if (!result) throw new ChatError("not-member", "You are no longer a member of this conversation");
      if (result.created) await emit("message", conversation, result.message);
      return result;
    },

    /** The sender edits a message within the edit window. */
    async edit(actor: Actor, conversationId: string, seq: number, body: string): Promise<ChatMessage> {
      const { conversation, member } = await activeMembership(actor, conversationId);
      const message = await loadMessage(conversation.id, seq, member);
      const text = cleanBody(body);
      if (message.senderId !== actor.userId) throw new ChatError("forbidden", "Only the sender can edit a message");
      if (message.deletedAt !== null) throw new ChatError("deleted", "Message was deleted");
      const at = now();
      if (at - message.createdAt > editWindowMs) throw new ChatError("edit-window-closed", "The edit window has closed");
      const edited = await store.editMessage(conversation.id, message.seq, text, at);
      if (!edited) throw new ChatError("deleted", "Message was deleted");
      await emit("edited", conversation, edited);
      return edited;
    },

    /** Soft delete by the sender or a group admin: the body becomes null and the seq stays. */
    async delete(actor: Actor, conversationId: string, seq: number): Promise<ChatMessage> {
      const { conversation, member } = await activeMembership(actor, conversationId);
      const message = await loadMessage(conversation.id, seq, member);
      const isAdmin = conversation.kind === "group" && member.role === "admin";
      if (message.senderId !== actor.userId && !isAdmin) throw new ChatError("forbidden", "Only the sender or a group admin can delete a message");
      if (message.deletedAt !== null) throw new ChatError("deleted", "Message was already deleted");
      const removed = await store.deleteMessage(conversation.id, message.seq, now());
      if (!removed) throw new ChatError("deleted", "Message was already deleted");
      await emit("deleted", conversation, removed);
      return removed;
    },

    /** Messages in ascending seq. Without afterSeq: the newest page (below beforeSeq). Removed members see up to their removal. */
    async history(actor: Actor, conversationId: string, query: { beforeSeq?: number; afterSeq?: number; limit?: number } = {}): Promise<HistoryPage> {
      const { conversation, member } = await membership(actor, conversationId);
      const limit = checkLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
      const beforeSeq = query.beforeSeq === undefined ? undefined : checkSeq(query.beforeSeq, 1);
      const afterSeq = query.afterSeq === undefined ? undefined : checkSeq(query.afterSeq, 0);
      const rows = await store.history(conversation.id, {
        ...(beforeSeq === undefined ? {} : { beforeSeq }), ...(afterSeq === undefined ? {} : { afterSeq }),
        ...(member.leftSeq === null ? {} : { maxSeq: member.leftSeq }), limit: limit + 1,
      });
      if (rows.length <= limit) return { messages: rows, hasMore: false };
      return { messages: afterSeq === undefined ? rows.slice(rows.length - limit) : rows.slice(0, limit), hasMore: true };
    },

    /** Moves the actor's read position forward to seq (clamped to the latest message); never backward. */
    async markRead(actor: Actor, conversationId: string, seq: number): Promise<{ lastReadSeq: number }> {
      const { conversation, member } = await membership(actor, conversationId);
      const value = Math.min(checkSeq(seq, 0), member.leftSeq ?? conversation.lastSeq);
      const stored = await store.markRead(conversation.id, actor.userId, value);
      if (stored === null) throw new ChatError("not-found", "Conversation not found");
      return { lastReadSeq: stored };
    },

    /** Unread messages per active conversation in the tenant and the total. */
    async unreadCounts(actor: Actor, tenantId: string): Promise<{ conversations: { conversationId: string; unread: number }[]; total: number }> {
      const tenant = await useTenant(actor, tenantId);
      const counts = await store.unreadCounts(tenant, actor.userId);
      const conversations = [...counts].filter(([, unread]) => unread > 0).map(([conversationId, unread]) => ({ conversationId, unread }));
      return { conversations, total: conversations.reduce((sum, item) => sum + item.unread, 0) };
    },

    /** The actor's inbox in a tenant: most recent activity first, with a last-message preview and unread count. */
    async listConversations(actor: Actor, tenantId: string, query: { cursor?: string | null; limit?: number } = {}): Promise<{ conversations: InboxItem[]; nextCursor: string | null }> {
      const tenant = await useTenant(actor, tenantId);
      const limit = checkLimit(query.limit, 20, MAX_LIMIT);
      const cursor = decodeInboxCursor(query.cursor);
      const rows = await store.listInbox(tenant, actor.userId, cursor, limit + 1);
      const kept = rows.slice(0, limit);
      const counts = await store.unreadCounts(tenant, actor.userId, kept.map((row) => row.conversation.id));
      const conversations = kept.map(({ conversation, member, lastMessage }): InboxItem => ({
        ...view(conversation, actor.userId), role: member.role, lastReadSeq: member.lastReadSeq,
        unread: counts.get(conversation.id) ?? 0,
        lastMessage: lastMessage === null ? null : {
          seq: lastMessage.seq, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt,
          body: lastMessage.body === null ? null : lastMessage.body.slice(0, PREVIEW),
        },
      }));
      const last = kept[kept.length - 1];
      const nextCursor = rows.length > limit && last
        ? encodeInboxCursor({ activityAt: last.conversation.lastMessageAt ?? last.conversation.createdAt, id: last.conversation.id })
        : null;
      return { conversations, nextCursor };
    },

    /** Blocks direct messages between the actor and userId in both directions (new and existing conversations). */
    async block(actor: Actor, userId: string): Promise<{ blocked: true }> {
      checkActor(actor);
      const target = checkUser(userId);
      if (target === actor.userId) throw new ChatError("invalid-user", "Cannot block yourself");
      await store.addBlock(actor.userId, target, now());
      return { blocked: true };
    },

    /** Removes the actor's own block (a block the other user placed stays). */
    async unblock(actor: Actor, userId: string): Promise<{ blocked: boolean }> {
      checkActor(actor);
      const target = checkUser(userId);
      await store.removeBlock(actor.userId, target);
      return { blocked: await store.isBlocked(actor.userId, target) };
    },
  };
}

export type Chat = ReturnType<typeof createChat>;
