// SPDX-License-Identifier: Apache-2.0
// In-memory CommentStore for tests and prototypes. Per-process and lost on restart; production needs the
// tables in schema.sql (or equivalents) with a primary key on (comment_id, user_id, emoji) for reactions,
// (comment_id, user_id) for flags, and an atomic flag_count increment.
import type { Comment, CommentStatus, CommentStore, CommentTarget, PageCursor, PageRequest, ReactionSummary, ReplyPreview } from "./core.js";

const copy = (comment: Comment): Comment => ({ ...comment, mentions: [...comment.mentions] });
const compare = (a: PageCursor, b: PageCursor): number => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class MemoryCommentStore implements CommentStore {
  readonly #comments = new Map<string, Comment>();
  /** commentId -> emoji -> user ids */
  readonly #reactions = new Map<string, Map<string, Set<string>>>();
  /** commentId -> userId -> reason */
  readonly #flags = new Map<string, Map<string, string>>();

  async insert(comment: Comment): Promise<void> {
    if (this.#comments.has(comment.id)) throw new Error("Duplicate comment id");
    this.#comments.set(comment.id, copy(comment));
  }

  async findById(id: string): Promise<Comment | null> {
    const item = this.#comments.get(id);
    return item ? copy(item) : null;
  }

  async updateBody(id: string, patch: { body: string; mentions: readonly string[]; editedAt: number }): Promise<Comment | null> {
    const item = this.#comments.get(id);
    if (!item || item.deletedAt !== undefined) return null;
    const next: Comment = { ...item, body: patch.body, mentions: [...patch.mentions], editedAt: patch.editedAt, status: item.status === "approved" ? "visible" : item.status };
    this.#comments.set(id, next);
    return copy(next);
  }

  async softDelete(id: string, at: number): Promise<Comment | null> {
    const item = this.#comments.get(id);
    if (!item || item.deletedAt !== undefined) return null;
    const next: Comment = { ...item, body: null, mentions: [], deletedAt: at };
    this.#comments.set(id, next);
    return copy(next);
  }

  async setStatus(id: string, status: CommentStatus): Promise<Comment | null> {
    const item = this.#comments.get(id);
    if (!item) return null;
    const next: Comment = { ...item, status };
    this.#comments.set(id, next);
    return copy(next);
  }

  async listTopLevel(target: CommentTarget, page: PageRequest): Promise<Comment[]> {
    return [...this.#comments.values()]
      .filter((item) => item.parentId === null && item.tenantId === target.tenantId && item.resourceType === target.resourceType && item.resourceId === target.resourceId)
      .filter((item) => page.cursor === null || compare(item, page.cursor) < 0)
      .sort((a, b) => compare(b, a))
      .slice(0, page.limit)
      .map(copy);
  }

  async listReplies(parentId: string, page: PageRequest): Promise<Comment[]> {
    return [...this.#comments.values()]
      .filter((item) => item.parentId === parentId && (page.cursor === null || compare(item, page.cursor) > 0))
      .sort(compare)
      .slice(0, page.limit)
      .map(copy);
  }

  async replyPreview(parentIds: readonly string[], perParent: number): Promise<Map<string, ReplyPreview>> {
    const result = new Map<string, ReplyPreview>();
    for (const parentId of parentIds) {
      const replies = [...this.#comments.values()].filter((item) => item.parentId === parentId).sort(compare);
      if (replies.length > 0) result.set(parentId, { count: replies.length, replies: replies.slice(0, perParent).map(copy) });
    }
    return result;
  }

  async toggleReaction(commentId: string, userId: string, emoji: string): Promise<"added" | "removed"> {
    const byEmoji = this.#reactions.get(commentId) ?? new Map<string, Set<string>>();
    this.#reactions.set(commentId, byEmoji);
    const users = byEmoji.get(emoji) ?? new Set<string>();
    byEmoji.set(emoji, users);
    if (users.delete(userId)) return "removed";
    users.add(userId);
    return "added";
  }

  async reactions(commentIds: readonly string[], userId: string): Promise<Map<string, ReactionSummary[]>> {
    const result = new Map<string, ReactionSummary[]>();
    for (const commentId of commentIds) {
      const list: ReactionSummary[] = [];
      for (const [emoji, users] of this.#reactions.get(commentId) ?? []) {
        if (users.size > 0) list.push({ emoji, count: users.size, reacted: users.has(userId) });
      }
      if (list.length > 0) result.set(commentId, list);
    }
    return result;
  }

  async addFlag(commentId: string, userId: string, reason: string, _at: number, threshold: number): Promise<Comment | null> {
    const item = this.#comments.get(commentId);
    if (!item) return null;
    const flags = this.#flags.get(commentId) ?? new Map<string, string>();
    this.#flags.set(commentId, flags);
    if (flags.has(userId)) return null;
    flags.set(userId, reason);
    const flagCount = item.flagCount + 1;
    const next: Comment = { ...item, flagCount, status: item.status === "visible" && flagCount >= threshold ? "hidden" : item.status };
    this.#comments.set(commentId, next);
    return copy(next);
  }
}
