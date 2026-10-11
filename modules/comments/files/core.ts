// SPDX-License-Identifier: Apache-2.0
// Threaded comments for any resource in a multi-tenant app: post, reply (bounded depth), edit within a window,
// soft delete, paginated listing with reply previews, emoji reactions, user flags with auto-hide, and moderation.
// Framework-neutral. The receiving application supplies persistence and authorization through the interfaces
// below. Bodies are plain text; this module never renders HTML. Apps that store rich text pass `sanitize`.

export type CommentStatus = "visible" | "hidden" | "approved";

export interface CommentTarget {
  readonly tenantId: string;
  /** What is being discussed, for example "task", "document" or "invoice". */
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface Comment extends CommentTarget {
  readonly id: string;
  /** null for a top-level comment. */
  readonly parentId: string | null;
  /** 0 for a top-level comment; a reply is its parent's depth + 1. */
  readonly depth: number;
  readonly authorId: string;
  /** null once soft-deleted. */
  readonly body: string | null;
  readonly mentions: readonly string[];
  readonly createdAt: number;
  readonly editedAt?: number;
  readonly deletedAt?: number;
  /** hidden: withheld pending moderation. approved: a moderator cleared it, so flags no longer auto-hide it. */
  readonly status: CommentStatus;
  readonly flagCount: number;
}

export interface ReactionSummary {
  readonly emoji: string;
  readonly count: number;
  /** Whether the requesting user reacted with this emoji. */
  readonly reacted: boolean;
}

/** Keyset position: (createdAt, id). */
export interface PageCursor { readonly createdAt: number; readonly id: string }
export interface PageRequest { readonly cursor: PageCursor | null; readonly limit: number }
export interface ReplyPreview { readonly count: number; readonly replies: Comment[] }

export interface CommentStore {
  insert(comment: Comment): Promise<void>;
  findById(id: string): Promise<Comment | null>;
  /** Replaces body and mentions only while the comment is not deleted; an approved comment returns to visible. */
  updateBody(id: string, patch: { body: string; mentions: readonly string[]; editedAt: number }): Promise<Comment | null>;
  /** Sets body null, mentions empty and deletedAt, only while not already deleted. Replies are untouched. */
  softDelete(id: string, at: number): Promise<Comment | null>;
  setStatus(id: string, status: CommentStatus): Promise<Comment | null>;
  /** Top-level comments on one target, newest first: (createdAt, id) strictly before the cursor. */
  listTopLevel(target: CommentTarget, page: PageRequest): Promise<Comment[]>;
  /** Direct replies to one comment, oldest first: (createdAt, id) strictly after the cursor. */
  listReplies(parentId: string, page: PageRequest): Promise<Comment[]>;
  /** For each parent: the number of direct replies and the first `perParent` of them, oldest first. */
  replyPreview(parentIds: readonly string[], perParent: number): Promise<Map<string, ReplyPreview>>;
  /** Removes the (comment, user, emoji) reaction when present, otherwise adds it. Must be safe under concurrency. */
  toggleReaction(commentId: string, userId: string, emoji: string, at: number): Promise<"added" | "removed">;
  reactions(commentIds: readonly string[], userId: string): Promise<Map<string, ReactionSummary[]>>;
  /**
   * Records one flag per (comment, user). On a new flag, atomically increments flagCount and sets status
   * hidden when a visible comment reaches `threshold`; returns the updated comment. Returns null for a repeat flag.
   */
  addFlag(commentId: string, userId: string, reason: string, at: number, threshold: number): Promise<Comment | null>;
}

export interface Actor { readonly userId: string }
export type CommentAction = "read" | "post" | "moderate";

export interface CommentOptions {
  readonly store: CommentStore;
  /**
   * Decide whether `actor` may `read`, `post` (also edit own, delete own, react) or `moderate` on the target.
   * Check tenant membership here; return false to deny. Ids the actor cannot read behave as not found.
   */
  readonly authorize: (actor: Actor, action: CommentAction, target: CommentTarget) => Promise<boolean>;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** How long an author may edit after posting. Default 15 minutes; moderators may edit any time. */
  readonly editWindowMs?: number;
  /** Deepest reply level (top level is 0). Default 3. */
  readonly maxDepth?: number;
  /** Maximum body length in UTF-16 code units after trimming. Default 10,000. */
  readonly maxBodyLength?: number;
  /** Distinct user flags that hide a visible comment pending moderation. Default 3. */
  readonly flagThreshold?: number;
  /** Replies included under each top-level comment in `list`. Default 3. */
  readonly previewReplies?: number;
  /** Allowed reaction emoji, in display order. Default 👍 ❤️ 🎉 😄 😕 👀. */
  readonly reactions?: readonly string[];
  /**
   * Optional transform for apps that store rich text (run your HTML sanitizer here). It receives the trimmed
   * body and returns what is stored. Without it the body is stored as plain text; render it as text, never HTML.
   */
  readonly sanitize?: (body: string) => string;
}

export interface CommentView extends CommentTarget {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly authorId: string;
  /** null when deleted, or hidden from this reader. */
  readonly body: string | null;
  readonly mentions: readonly string[];
  readonly createdAt: number;
  readonly editedAt?: number;
  readonly deletedAt?: number;
  readonly status: CommentStatus;
  readonly replyCount: number;
  readonly reactions: readonly ReactionSummary[];
  /** Moderators only. */
  readonly flagCount?: number;
  /** In `list`, the first replies (oldest first). */
  readonly replies?: readonly CommentView[];
}

export interface CommentPage { readonly comments: CommentView[]; readonly nextCursor: string | null }
export interface ReplyPage { readonly replies: CommentView[]; readonly nextCursor: string | null }

export type CommentErrorCode =
  | "forbidden" | "not-found" | "invalid-tenant" | "invalid-resource" | "invalid-body" | "invalid-parent"
  | "too-deep" | "invalid-cursor" | "invalid-limit" | "invalid-emoji" | "invalid-reason" | "invalid-action"
  | "edit-window-closed" | "deleted" | "already-flagged" | "conflict" | "bad-request";

export class CommentError extends Error {
  readonly code: CommentErrorCode;
  constructor(code: CommentErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CommentError";
  }
}

export const DEFAULT_REACTIONS: readonly string[] = ["👍", "❤️", "🎉", "😄", "😕", "👀"];

const TENANT = /^[\w.:-]{1,128}$/;
const RESOURCE_TYPE = /^[\w.:-]{1,64}$/;
const RESOURCE_ID = /^[\w.:-]{1,128}$/;
const ID = /^[\w-]{1,64}$/;
const MENTION = /(?<![\w@.])@([\w.-]+)/g;
const MAX_MENTIONS = 50;
const MAX_REASON = 500;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** @mentions as written (`@[\w.-]{1,64}`, not inside an email address), deduplicated case-insensitively. */
export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const name = (match[1] ?? "").replace(/\.+$/, ""); // "thanks @bob." mentions bob
    if (name.length < 1 || name.length > 64) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_MENTIONS) break;
  }
  return out;
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

/** Opaque cursor text for a keyset position. */
export function encodeCursor(position: PageCursor): string {
  return base64UrlEncode(JSON.stringify([position.createdAt, position.id]));
}

export function decodeCursor(cursor: string | null | undefined): PageCursor | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  try {
    if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const value: unknown = JSON.parse(base64UrlDecode(cursor));
    if (!Array.isArray(value) || value.length !== 2) throw new Error("shape");
    const [createdAt, id] = value as unknown[];
    if (typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) || typeof id !== "string" || !ID.test(id)) throw new Error("shape");
    return { createdAt, id };
  } catch {
    throw new CommentError("invalid-cursor", "Invalid cursor");
  }
}

function integerOption(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return result;
}

export function createComments(options: CommentOptions) {
  const { store } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const editWindowMs = integerOption(options.editWindowMs, 15 * 60 * 1000, 0, 365 * 24 * 60 * 60 * 1000, "editWindowMs");
  const maxDepth = integerOption(options.maxDepth, 3, 0, 32, "maxDepth");
  const maxBodyLength = integerOption(options.maxBodyLength, 10_000, 1, 1_000_000, "maxBodyLength");
  const flagThreshold = integerOption(options.flagThreshold, 3, 1, 10_000, "flagThreshold");
  const previewReplies = integerOption(options.previewReplies, 3, 0, 20, "previewReplies");
  const reactionOrder = [...(options.reactions ?? DEFAULT_REACTIONS)];
  if (reactionOrder.length === 0 || reactionOrder.some((emoji) => typeof emoji !== "string" || emoji.length === 0 || emoji.length > 32)) {
    throw new RangeError("reactions must list 1 or more short emoji strings");
  }
  const allowedReactions = new Set(reactionOrder);

  const targetOf = (item: CommentTarget): CommentTarget => ({ tenantId: item.tenantId, resourceType: item.resourceType, resourceId: item.resourceId });

  function checkTarget(input: CommentTarget): CommentTarget {
    if (typeof input.tenantId !== "string" || !TENANT.test(input.tenantId)) throw new CommentError("invalid-tenant", "Invalid tenant id");
    if (typeof input.resourceType !== "string" || !RESOURCE_TYPE.test(input.resourceType) || typeof input.resourceId !== "string" || !RESOURCE_ID.test(input.resourceId)) {
      throw new CommentError("invalid-resource", "Invalid resource type or id");
    }
    return targetOf(input);
  }

  async function can(actor: Actor, action: CommentAction, target: CommentTarget): Promise<boolean> {
    return (await options.authorize(actor, action, targetOf(target))) === true;
  }

  async function requireAccess(actor: Actor, action: CommentAction, target: CommentTarget): Promise<void> {
    if (!(await can(actor, action, target))) throw new CommentError("forbidden", "Not allowed");
  }

  /** Loads a comment the actor may read. Other tenants' ids, unknown ids and unreadable ids are all not-found. */
  async function readable(actor: Actor, id: unknown): Promise<Comment> {
    if (typeof id !== "string" || !ID.test(id)) throw new CommentError("not-found", "Comment not found");
    const comment = await store.findById(id);
    if (!comment || !(await can(actor, "read", comment))) throw new CommentError("not-found", "Comment not found");
    return comment;
  }

  function cleanBody(body: unknown): string {
    if (typeof body !== "string") throw new CommentError("invalid-body", "Body must be text");
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > maxBodyLength) throw new CommentError("invalid-body", `Body must be 1 to ${maxBodyLength} characters`);
    if (!options.sanitize) return trimmed;
    const cleaned: unknown = options.sanitize(trimmed);
    if (typeof cleaned !== "string" || cleaned.trim().length === 0 || cleaned.length > maxBodyLength) throw new CommentError("invalid-body", "Body is empty after sanitizing");
    return cleaned;
  }

  function pageLimit(limit: number | undefined): number {
    if (limit === undefined) return DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new CommentError("invalid-limit", `limit must be 1 to ${MAX_LIMIT}`);
    return limit;
  }

  function sortReactions(list: readonly ReactionSummary[] | undefined): ReactionSummary[] {
    return (list ?? [])
      .filter((item) => allowedReactions.has(item.emoji) && item.count > 0)
      .sort((a, b) => reactionOrder.indexOf(a.emoji) - reactionOrder.indexOf(b.emoji))
      .map((item) => ({ emoji: item.emoji, count: item.count, reacted: item.reacted }));
  }

  function toView(actor: Actor, comment: Comment, moderator: boolean, replyCount: number, reactions: readonly ReactionSummary[], replies?: CommentView[]): CommentView {
    // Hidden comments are withheld from ordinary readers; the author and moderators still see them.
    const withheld = comment.deletedAt !== undefined || (comment.status === "hidden" && !moderator && comment.authorId !== actor.userId);
    return {
      id: comment.id, tenantId: comment.tenantId, resourceType: comment.resourceType, resourceId: comment.resourceId,
      parentId: comment.parentId, depth: comment.depth, authorId: comment.authorId,
      body: withheld ? null : comment.body, mentions: withheld ? [] : [...comment.mentions], createdAt: comment.createdAt,
      ...(comment.editedAt === undefined ? {} : { editedAt: comment.editedAt }),
      ...(comment.deletedAt === undefined ? {} : { deletedAt: comment.deletedAt }),
      status: comment.status, replyCount, reactions,
      ...(moderator ? { flagCount: comment.flagCount } : {}),
      ...(replies === undefined ? {} : { replies }),
    };
  }

  /** Builds views with reply counts, reactions and (optionally) the first replies of each comment. */
  async function views(actor: Actor, comments: readonly Comment[], moderator: boolean, withReplies: boolean): Promise<CommentView[]> {
    if (comments.length === 0) return [];
    const ids = comments.map((item) => item.id);
    const previews = await store.replyPreview(ids, withReplies ? previewReplies : 0);
    const replies = withReplies ? ids.flatMap((id) => previews.get(id)?.replies ?? []) : [];
    const replyIds = replies.map((item) => item.id);
    const nested = replyIds.length > 0 ? await store.replyPreview(replyIds, 0) : new Map<string, ReplyPreview>();
    const reactions = await store.reactions([...ids, ...replyIds], actor.userId);
    const viewOf = (item: Comment, counts: Map<string, ReplyPreview>, children?: CommentView[]) =>
      toView(actor, item, moderator, counts.get(item.id)?.count ?? 0, sortReactions(reactions.get(item.id)), children);
    return comments.map((item) => viewOf(item, previews,
      withReplies ? (previews.get(item.id)?.replies ?? []).slice(0, previewReplies).map((reply) => viewOf(reply, nested)) : undefined));
  }

  async function viewOne(actor: Actor, comment: Comment, moderator: boolean): Promise<CommentView> {
    const [view] = await views(actor, [comment], moderator, false);
    return view!;
  }

  function page<T extends Comment>(rows: T[], limit: number): { rows: T[]; nextCursor: string | null } {
    const kept = rows.slice(0, limit);
    const last = kept[kept.length - 1];
    return { rows: kept, nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null };
  }

  return {
    /** Posts a top-level comment or a reply. A reply must be on the same tenant and resource, at most maxDepth deep. */
    async post(actor: Actor, input: CommentTarget & { body: string; parentId?: string | null }): Promise<CommentView> {
      const target = checkTarget(input);
      const body = cleanBody(input.body);
      await requireAccess(actor, "post", target);
      let parentId: string | null = null;
      let depth = 0;
      if (input.parentId !== undefined && input.parentId !== null) {
        const parent = typeof input.parentId === "string" && ID.test(input.parentId) ? await store.findById(input.parentId) : null;
        // One code for unknown, other-tenant and other-resource parents, so ids from elsewhere reveal nothing.
        if (!parent || parent.tenantId !== target.tenantId || parent.resourceType !== target.resourceType || parent.resourceId !== target.resourceId) {
          throw new CommentError("invalid-parent", "Parent comment is not on this resource");
        }
        if (parent.deletedAt !== undefined) throw new CommentError("invalid-parent", "Cannot reply to a deleted comment");
        if (parent.depth + 1 > maxDepth) throw new CommentError("too-deep", `Replies are limited to ${maxDepth} levels`);
        parentId = parent.id;
        depth = parent.depth + 1;
      }
      const comment: Comment = {
        id: newId(), ...target, parentId, depth, authorId: actor.userId, body, mentions: extractMentions(body),
        createdAt: now(), status: "visible", flagCount: 0,
      };
      await store.insert(comment);
      return toView(actor, comment, false, 0, []);
    },

    /** The author may edit within editWindowMs; moderators may edit any time. editedAt records the change. */
    async edit(actor: Actor, id: string, body: string): Promise<CommentView> {
      const comment = await readable(actor, id);
      const text = cleanBody(body);
      const moderator = await can(actor, "moderate", comment);
      if (!moderator) {
        if (comment.authorId !== actor.userId || !(await can(actor, "post", comment))) throw new CommentError("forbidden", "Only the author can edit this comment");
        if (comment.deletedAt === undefined && now() - comment.createdAt > editWindowMs) throw new CommentError("edit-window-closed", "The edit window has closed");
      }
      if (comment.deletedAt !== undefined) throw new CommentError("deleted", "Comment was deleted");
      const updated = await store.updateBody(comment.id, { body: text, mentions: extractMentions(text), editedAt: now() });
      if (!updated) throw new CommentError("deleted", "Comment was deleted");
      return viewOne(actor, updated, moderator);
    },

    /** Soft delete by the author or a moderator: the body is cleared, replies stay so the thread reads on. */
    async remove(actor: Actor, id: string): Promise<CommentView> {
      const comment = await readable(actor, id);
      const moderator = await can(actor, "moderate", comment);
      if (!moderator && comment.authorId !== actor.userId) throw new CommentError("forbidden", "Only the author or a moderator can delete this comment");
      if (comment.deletedAt !== undefined) throw new CommentError("deleted", "Comment was already deleted");
      const updated = await store.softDelete(comment.id, now());
      if (!updated) throw new CommentError("deleted", "Comment was already deleted");
      return viewOne(actor, updated, moderator);
    },

    /** Top-level comments newest first, each with its first replies (oldest first) and replyCount. */
    async list(actor: Actor, query: CommentTarget & { cursor?: string | null; limit?: number }): Promise<CommentPage> {
      const target = checkTarget(query);
      const limit = pageLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      await requireAccess(actor, "read", target);
      const moderator = await can(actor, "moderate", target);
      const result = page(await store.listTopLevel(target, { cursor, limit: limit + 1 }), limit);
      return { comments: await views(actor, result.rows, moderator, true), nextCursor: result.nextCursor };
    },

    /** Direct replies to one comment, oldest first, each with its own replyCount. */
    async listReplies(actor: Actor, parentId: string, query: { cursor?: string | null; limit?: number } = {}): Promise<ReplyPage> {
      const limit = pageLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const parent = await readable(actor, parentId);
      const moderator = await can(actor, "moderate", parent);
      const result = page(await store.listReplies(parent.id, { cursor, limit: limit + 1 }), limit);
      return { replies: await views(actor, result.rows, moderator, false), nextCursor: result.nextCursor };
    },

    /** Toggles the actor's reaction; returns whether the actor now has it and the comment's reaction counts. */
    async react(actor: Actor, id: string, emoji: string): Promise<{ reacted: boolean; reactions: ReactionSummary[] }> {
      if (typeof emoji !== "string" || !allowedReactions.has(emoji)) throw new CommentError("invalid-emoji", "That reaction is not allowed");
      const comment = await readable(actor, id);
      await requireAccess(actor, "post", comment);
      if (comment.deletedAt !== undefined) throw new CommentError("deleted", "Comment was deleted");
      await store.toggleReaction(comment.id, actor.userId, emoji, now());
      const reactions = sortReactions((await store.reactions([comment.id], actor.userId)).get(comment.id));
      return { reacted: reactions.some((item) => item.emoji === emoji && item.reacted), reactions };
    },

    /** Each reader may flag a comment once; at flagThreshold flags a visible comment is hidden pending moderation. */
    async flag(actor: Actor, id: string, reason: string): Promise<{ flagged: true; hidden: boolean }> {
      const text = typeof reason === "string" ? reason.trim() : "";
      if (text.length === 0 || text.length > MAX_REASON) throw new CommentError("invalid-reason", `Reason must be 1 to ${MAX_REASON} characters`);
      const comment = await readable(actor, id);
      if (comment.deletedAt !== undefined) throw new CommentError("deleted", "Comment was deleted");
      const updated = await store.addFlag(comment.id, actor.userId, text, now(), flagThreshold);
      if (!updated) throw new CommentError("already-flagged", "You already flagged this comment");
      return { flagged: true, hidden: updated.status === "hidden" };
    },

    /** Moderators approve (visible, and no longer auto-hidden by flags) or hide a comment. */
    async moderate(actor: Actor, id: string, action: "approve" | "hide"): Promise<CommentView> {
      if (action !== "approve" && action !== "hide") throw new CommentError("invalid-action", "Action must be approve or hide");
      const comment = await readable(actor, id);
      await requireAccess(actor, "moderate", comment);
      const updated = await store.setStatus(comment.id, action === "approve" ? "approved" : "hidden");
      if (!updated) throw new CommentError("not-found", "Comment not found");
      return viewOne(actor, updated, true);
    },
  };
}

export type Comments = ReturnType<typeof createComments>;
