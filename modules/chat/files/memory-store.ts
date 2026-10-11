// SPDX-License-Identifier: Apache-2.0
// In-memory ChatStore for tests and prototypes. Per-process and lost on restart. Every method does its work
// without awaiting in between, so each one is atomic within a single Node.js process; production needs the
// tables in schema.sql (or equivalents) with the same unique keys and a transactional seq counter.
import type { ChatMessage, ChatStore, Conversation, HistoryQuery, InboxCursor, InboxRow, Member, NewMessage } from "./core.js";

const activity = (conversation: Conversation): number => conversation.lastMessageAt ?? conversation.createdAt;
/** Newest activity first, then id descending. */
const inboxOrder = (a: InboxCursor, b: InboxCursor): number => b.activityAt - a.activityAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export class MemoryChatStore implements ChatStore {
  readonly #conversations = new Map<string, Conversation>();
  readonly #directKeys = new Map<string, string>();
  /** conversationId -> userId -> member */
  readonly #members = new Map<string, Map<string, Member>>();
  /** conversationId -> messages indexed by seq - 1 */
  readonly #messages = new Map<string, ChatMessage[]>();
  readonly #clientIds = new Map<string, number>();
  readonly #blocks = new Set<string>();

  #insert(conversation: Conversation, members: readonly Member[]): void {
    if (this.#conversations.has(conversation.id)) throw new Error("Duplicate conversation id");
    this.#conversations.set(conversation.id, { ...conversation });
    this.#members.set(conversation.id, new Map(members.map((member) => [member.userId, { ...member }])));
    this.#messages.set(conversation.id, []);
  }

  async findConversation(id: string): Promise<Conversation | null> {
    const item = this.#conversations.get(id);
    return item ? { ...item } : null;
  }

  async openDirect(conversation: Conversation, members: readonly Member[]): Promise<Conversation> {
    const key = conversation.directKey;
    if (key === null) throw new Error("directKey required");
    const existing = this.#directKeys.get(key);
    if (existing !== undefined) return { ...this.#conversations.get(existing)! };
    this.#insert(conversation, members);
    this.#directKeys.set(key, conversation.id);
    return { ...conversation };
  }

  async createGroup(conversation: Conversation, members: readonly Member[]): Promise<void> {
    this.#insert(conversation, members);
  }

  async getMember(conversationId: string, userId: string): Promise<Member | null> {
    const member = this.#members.get(conversationId)?.get(userId);
    return member ? { ...member } : null;
  }

  #active(conversationId: string): Member[] {
    return [...(this.#members.get(conversationId)?.values() ?? [])]
      .filter((member) => member.leftAt === null)
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  }

  async listMembers(conversationId: string): Promise<Member[]> {
    return this.#active(conversationId).map((member) => ({ ...member }));
  }

  async addMembers(conversationId: string, userIds: readonly string[], at: number, maxMembers: number): Promise<Member[] | null> {
    const members = this.#members.get(conversationId);
    if (!members) return null;
    // Absent users (undefined) and left members (a number) are added; active members (null) are skipped.
    const toAdd = userIds.filter((userId) => members.get(userId)?.leftAt !== null);
    if (this.#active(conversationId).length + toAdd.length > maxMembers) return null;
    const added: Member[] = [];
    for (const userId of toAdd) {
      const previous = members.get(userId);
      const member: Member = { conversationId, userId, role: "member", joinedAt: at, leftAt: null, leftSeq: null, lastReadSeq: previous?.lastReadSeq ?? 0 };
      members.set(userId, member);
      added.push({ ...member });
    }
    return added;
  }

  async leave(conversationId: string, userId: string, at: number): Promise<Member | null> {
    const members = this.#members.get(conversationId);
    const conversation = this.#conversations.get(conversationId);
    const member = members?.get(userId);
    if (!members || !conversation || !member || member.leftAt !== null) return null;
    const left: Member = { ...member, leftAt: at, leftSeq: conversation.lastSeq };
    members.set(userId, left);
    const active = this.#active(conversationId);
    if (active.length > 0 && !active.some((item) => item.role === "admin")) {
      const oldest = active[0]!;
      members.set(oldest.userId, { ...oldest, role: "admin" });
    }
    return { ...left };
  }

  async appendMessage(input: NewMessage): Promise<{ message: ChatMessage; created: boolean } | null> {
    const conversation = this.#conversations.get(input.conversationId);
    const messages = this.#messages.get(input.conversationId);
    if (!conversation || !messages) return null;
    const key = JSON.stringify([input.conversationId, input.senderId, input.clientId]);
    const existingSeq = this.#clientIds.get(key);
    if (existingSeq !== undefined) return { message: { ...messages[existingSeq - 1]! }, created: false };
    const sender = this.#members.get(input.conversationId)?.get(input.senderId);
    if (!sender || sender.leftAt !== null) return null;
    const seq = conversation.lastSeq + 1;
    const message: ChatMessage = { ...input, seq, editedAt: null, deletedAt: null };
    messages.push(message);
    this.#clientIds.set(key, seq);
    this.#conversations.set(conversation.id, { ...conversation, lastSeq: seq, lastMessageAt: input.createdAt });
    this.#members.get(input.conversationId)!.set(input.senderId, { ...sender, lastReadSeq: Math.max(sender.lastReadSeq, seq) });
    return { message: { ...message }, created: true };
  }

  async getMessage(conversationId: string, seq: number): Promise<ChatMessage | null> {
    const message = this.#messages.get(conversationId)?.[seq - 1];
    return message ? { ...message } : null;
  }

  #update(conversationId: string, seq: number, patch: Partial<ChatMessage>): ChatMessage | null {
    const messages = this.#messages.get(conversationId);
    const message = messages?.[seq - 1];
    if (!messages || !message || message.deletedAt !== null) return null;
    const next: ChatMessage = { ...message, ...patch };
    messages[seq - 1] = next;
    return { ...next };
  }

  async editMessage(conversationId: string, seq: number, body: string, at: number): Promise<ChatMessage | null> {
    return this.#update(conversationId, seq, { body, editedAt: at });
  }

  async deleteMessage(conversationId: string, seq: number, at: number): Promise<ChatMessage | null> {
    return this.#update(conversationId, seq, { body: null, deletedAt: at });
  }

  async history(conversationId: string, query: HistoryQuery): Promise<ChatMessage[]> {
    const rows = (this.#messages.get(conversationId) ?? []).filter((message) =>
      (query.beforeSeq === undefined || message.seq < query.beforeSeq) &&
      (query.afterSeq === undefined || message.seq > query.afterSeq) &&
      (query.maxSeq === undefined || message.seq <= query.maxSeq));
    const page = query.afterSeq === undefined ? rows.slice(Math.max(0, rows.length - query.limit)) : rows.slice(0, query.limit);
    return page.map((message) => ({ ...message }));
  }

  async markRead(conversationId: string, userId: string, seq: number): Promise<number | null> {
    const members = this.#members.get(conversationId);
    const member = members?.get(userId);
    if (!members || !member) return null;
    const lastReadSeq = Math.max(member.lastReadSeq, seq);
    members.set(userId, { ...member, lastReadSeq });
    return lastReadSeq;
  }

  async unreadCounts(tenantId: string, userId: string, conversationIds?: readonly string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const only = conversationIds ? new Set(conversationIds) : null;
    for (const conversation of this.#conversations.values()) {
      if (conversation.tenantId !== tenantId || (only && !only.has(conversation.id))) continue;
      const member = this.#members.get(conversation.id)?.get(userId);
      if (!member || member.leftAt !== null) continue;
      const unread = (this.#messages.get(conversation.id) ?? [])
        .filter((message) => message.seq > member.lastReadSeq && message.senderId !== userId && message.deletedAt === null).length;
      result.set(conversation.id, unread);
    }
    return result;
  }

  async listInbox(tenantId: string, userId: string, cursor: InboxCursor | null, limit: number): Promise<InboxRow[]> {
    const rows: InboxRow[] = [];
    for (const conversation of this.#conversations.values()) {
      if (conversation.tenantId !== tenantId) continue;
      const member = this.#members.get(conversation.id)?.get(userId);
      if (!member || member.leftAt !== null) continue;
      if (cursor && inboxOrder(cursor, { activityAt: activity(conversation), id: conversation.id }) >= 0) continue;
      const last = conversation.lastSeq > 0 ? this.#messages.get(conversation.id)?.[conversation.lastSeq - 1] : undefined;
      rows.push({ conversation: { ...conversation }, member: { ...member }, lastMessage: last ? { ...last } : null });
    }
    return rows
      .sort((a, b) => inboxOrder({ activityAt: activity(a.conversation), id: a.conversation.id }, { activityAt: activity(b.conversation), id: b.conversation.id }))
      .slice(0, limit);
  }

  async addBlock(blockerId: string, blockedId: string): Promise<void> {
    this.#blocks.add(JSON.stringify([blockerId, blockedId]));
  }

  async removeBlock(blockerId: string, blockedId: string): Promise<void> {
    this.#blocks.delete(JSON.stringify([blockerId, blockedId]));
  }

  async isBlocked(userA: string, userB: string): Promise<boolean> {
    return this.#blocks.has(JSON.stringify([userA, userB])) || this.#blocks.has(JSON.stringify([userB, userA]));
  }
}
