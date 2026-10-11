// SPDX-License-Identifier: Apache-2.0
// Short links (URL shortener) for multi-tenant apps, framework-neutral. The receiving application
// supplies persistence and authorization through the interfaces below. Destinations are parsed with
// the WHATWG URL parser and checked against allowed schemes, embedded credentials and blocked hosts
// (put your own short domain there to prevent redirect loops). Random codes use rejection sampling
// over a 57-character alphabet without look-alikes, so every character is equally likely.

export interface ShortLink {
  readonly id: string;
  readonly tenantId: string;
  /** Globally unique: the redirect route resolves a code without knowing the tenant. */
  readonly code: string;
  /** Normalized destination (URL.href). */
  readonly url: string;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly maxClicks: number | null;
  readonly clicks: number;
  readonly lastClickAt: number | null;
  readonly disabled: boolean;
}

export interface LinkCursor { readonly createdAt: number; readonly id: string }

export interface ShortLinkPatch {
  readonly url?: string;
  readonly expiresAt?: number | null;
  readonly disabled?: boolean;
}

export interface ShortLinkStore {
  /** Inserts the link and returns true, or returns false when `code` is already taken (unique index). */
  insert(link: ShortLink): Promise<boolean>;
  findById(id: string): Promise<ShortLink | null>;
  findByCode(code: string): Promise<ShortLink | null>;
  /** One tenant's links, newest first: (createdAt, id) strictly before `before`, at most `limit`. */
  list(tenantId: string, page: { before: LinkCursor | null; limit: number }): Promise<ShortLink[]>;
  /** Applies the patch and returns the updated link, or null when it no longer exists. */
  update(id: string, patch: ShortLinkPatch): Promise<ShortLink | null>;
  /** Deletes the link; false when it did not exist. */
  delete(id: string): Promise<boolean>;
  /**
   * ONE atomic conditional step: when the link with `code` is enabled, unexpired at `at` and below
   * maxClicks, increment clicks, set lastClickAt and return {id, url}; otherwise change nothing and
   * return null. Checking and incrementing separately lets concurrent resolves exceed maxClicks.
   */
  recordClick(code: string, at: number): Promise<{ id: string; url: string } | null>;
}

export interface Actor { readonly userId: string }
export type ShortLinkAction = "create" | "manage" | "read";

/** A click event. Contains no IP address, user agent or full referrer URL. */
export interface ClickEvent {
  readonly linkId: string;
  readonly at: number;
  readonly referrerHost?: string;
  readonly country?: string;
}

export interface ShortLinkOptions {
  readonly store: ShortLinkStore;
  /** Decide whether `actor` may perform `action` in `tenantId`. Return false to deny. */
  readonly authorize: (actor: Actor, action: ShortLinkAction, target: Readonly<{ tenantId: string }>) => Promise<boolean>;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly newId?: () => string;
  /** Length of generated codes. Default 7 (57^7, about 1.95e12 codes); 4 to 32. */
  readonly codeLength?: number;
  /** Generated-code insert attempts before failing with `exhausted`. Default 5; 1 to 20. */
  readonly maxAttempts?: number;
  /** Destination schemes, with the colon, as URL.protocol reports them. Default ['https:', 'http:']. */
  readonly allowedSchemes?: readonly string[];
  /** Hostnames refused as destinations, including their subdomains. Always include your own short domain. */
  readonly blockHosts?: readonly string[];
  /** Optional safe-browsing check; return false to refuse the destination with `unsafe-destination`. */
  readonly isSafeDestination?: (url: URL) => Promise<boolean>;
  /** Custom slugs that may not be claimed (compared case-insensitively). Default RESERVED_SLUGS. */
  readonly reservedSlugs?: readonly string[];
  /** Longest accepted destination URL in characters. Default 2048. */
  readonly maxUrlLength?: number;
  /** When true (default) expired, disabled and used-up links resolve as 410 gone; when false, as 404. */
  readonly reportGone?: boolean;
  /** Receives each counted click after the counter is incremented. Errors are swallowed so redirects never fail. */
  readonly onClick?: (event: ClickEvent) => void | Promise<void>;
}

export type ShortLinkErrorCode =
  | "forbidden" | "invalid-tenant" | "invalid-url" | "scheme-not-allowed" | "credentials-not-allowed"
  | "blocked-host" | "unsafe-destination" | "invalid-slug" | "reserved-slug" | "slug-taken" | "exhausted"
  | "invalid-expiry" | "invalid-max-clicks" | "invalid-patch" | "not-found" | "invalid-cursor" | "invalid-limit"
  | "bad-request" | "too-large";

export class ShortLinkError extends Error {
  constructor(readonly code: ShortLinkErrorCode, message: string) {
    super(message);
    this.name = "ShortLinkError";
  }
}

/** Base62 without the look-alikes 0 O l 1 I: 57 characters. */
export const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Largest multiple of 57 that fits in a byte; bytes at or above it are discarded (no modulo bias). */
export const ACCEPT_BELOW = 256 - (256 % ALPHABET.length);

export const RESERVED_SLUGS: readonly string[] = [
  "api", "admin", "login", "logout", "signin", "signup", "register", "auth", "oauth", "account", "settings",
  "dashboard", "app", "static", "assets", "public", "www", "help", "support", "about", "terms", "privacy",
  "security", "status", "health", "metrics", "robots.txt", "favicon.ico", "sitemap.xml", "well-known", ".well-known",
];

const TENANT = /^[\w.:-]{1,128}$/;
const SLUG = /^[A-Za-z0-9_-]{3,64}$/;
const CODE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TIME = 8_640_000_000_000_000;

/** Draws `length` characters from ALPHABET by rejection sampling over random bytes. */
export function randomCode(length: number, randomBytes: (length: number) => Uint8Array): string {
  let code = "";
  // A sampling bug or a broken random source must not spin forever.
  for (let rounds = 0; code.length < length; rounds++) {
    if (rounds > 64) throw new Error("Random source keeps returning rejected bytes");
    for (const byte of randomBytes(length - code.length + 8)) {
      if (byte >= ACCEPT_BELOW) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.+$/, "");
}

/** Resolve outcome for the redirect route. */
export type ResolveResult =
  | { readonly status: 302; readonly url: string; readonly linkId: string }
  | { readonly status: 404 | 410; readonly reason: "not-found" | "expired" | "disabled" | "max-clicks" };

function encodeCursor(cursor: LinkCursor): string {
  return btoa(JSON.stringify([cursor.createdAt, cursor.id])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string | null | undefined): LinkCursor | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  try {
    if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (cursor.length % 4)) % 4);
    const value: unknown = JSON.parse(atob(padded));
    if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || typeof value[1] !== "string") throw new Error("shape");
    return { createdAt: value[0] as number, id: value[1] as string };
  } catch {
    throw new ShortLinkError("invalid-cursor", "Invalid cursor");
  }
}

export function createShortLinks(options: ShortLinkOptions) {
  const codeLength = options.codeLength ?? 7;
  if (!Number.isInteger(codeLength) || codeLength < 4 || codeLength > 32) throw new RangeError("codeLength must be 4 to 32");
  const maxAttempts = options.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new RangeError("maxAttempts must be 1 to 20");
  const schemes = new Set((options.allowedSchemes ?? ["https:", "http:"]).map((scheme) => scheme.toLowerCase()));
  if (schemes.size === 0) throw new RangeError("Allow at least one scheme");
  for (const scheme of ["javascript:", "data:", "file:", "vbscript:", "blob:"]) {
    if (schemes.has(scheme)) throw new RangeError(`${scheme} destinations are never allowed`);
  }
  const blocked = (options.blockHosts ?? []).map(normalizeHost).filter(Boolean);
  const reserved = new Set((options.reservedSlugs ?? RESERVED_SLUGS).map((slug) => slug.toLowerCase()));
  const maxUrlLength = options.maxUrlLength ?? 2048;
  const reportGone = options.reportGone ?? true;
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { store } = options;

  async function allowed(actor: Actor, action: ShortLinkAction, tenantId: string): Promise<void> {
    if (!(await options.authorize(actor, action, { tenantId }))) throw new ShortLinkError("forbidden", "Not allowed");
  }

  /** Parses and checks a destination; returns the normalized href. */
  async function destination(raw: unknown): Promise<string> {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > maxUrlLength) throw new ShortLinkError("invalid-url", "Invalid URL");
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new ShortLinkError("invalid-url", "Invalid URL");
    }
    if (!schemes.has(url.protocol)) throw new ShortLinkError("scheme-not-allowed", "URL scheme not allowed");
    if (url.username !== "" || url.password !== "") throw new ShortLinkError("credentials-not-allowed", "URLs with credentials are not allowed");
    const host = normalizeHost(url.hostname);
    if (host === "") throw new ShortLinkError("invalid-url", "URL needs a host");
    if (blocked.some((item) => host === item || host.endsWith("." + item))) throw new ShortLinkError("blocked-host", "Destination host is blocked");
    if (url.href.length > maxUrlLength) throw new ShortLinkError("invalid-url", "URL too long");
    if (options.isSafeDestination && !(await options.isSafeDestination(url))) throw new ShortLinkError("unsafe-destination", "Destination failed the safety check");
    return url.href;
  }

  function expiry(value: unknown, at: number): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || (value as number) <= at || (value as number) > MAX_TIME) throw new ShortLinkError("invalid-expiry", "expiresAt must be a future epoch-millisecond time");
    return value as number;
  }

  async function load(id: unknown): Promise<ShortLink> {
    if (typeof id !== "string" || !CODE.test(id)) throw new ShortLinkError("not-found", "Link not found");
    const link = await store.findById(id);
    if (!link) throw new ShortLinkError("not-found", "Link not found");
    return link;
  }

  return {
    /**
     * Creates a short link. With `slug`, claims that exact code (slug-taken when any tenant holds it);
     * otherwise generates a random code and retries on collision up to maxAttempts.
     */
    async create(actor: Actor, input: { tenantId: string; url: string; slug?: string; expiresAt?: number | null; maxClicks?: number | null }): Promise<ShortLink> {
      if (typeof input.tenantId !== "string" || !TENANT.test(input.tenantId)) throw new ShortLinkError("invalid-tenant", "Invalid tenant id");
      await allowed(actor, "create", input.tenantId);
      const at = now();
      const expiresAt = expiry(input.expiresAt, at);
      const maxClicks = input.maxClicks ?? null;
      if (maxClicks !== null && (!Number.isSafeInteger(maxClicks) || maxClicks < 1 || maxClicks > 1_000_000_000)) {
        throw new ShortLinkError("invalid-max-clicks", "maxClicks must be a whole number from 1 to 1,000,000,000");
      }
      const slug = input.slug;
      if (slug !== undefined) {
        if (typeof slug !== "string" || !SLUG.test(slug)) throw new ShortLinkError("invalid-slug", "Slug must be 3-64 letters, digits, '_' or '-'");
        if (reserved.has(slug.toLowerCase())) throw new ShortLinkError("reserved-slug", "That slug is reserved");
      }
      const url = await destination(input.url);
      const base = { id: "", tenantId: input.tenantId, url, createdBy: actor.userId, createdAt: at, expiresAt, maxClicks, clicks: 0, lastClickAt: null, disabled: false };
      if (slug !== undefined) {
        const link: ShortLink = { ...base, id: newId(), code: slug };
        if (!(await store.insert(link))) throw new ShortLinkError("slug-taken", "That slug is already taken");
        return link;
      }
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = randomCode(codeLength, randomBytes);
        // A generated code could spell a reserved word; skip it rather than shadow a route.
        if (reserved.has(code.toLowerCase())) continue;
        const link: ShortLink = { ...base, id: newId(), code };
        if (await store.insert(link)) return link;
      }
      throw new ShortLinkError("exhausted", "Could not find a free code; try again or raise codeLength");
    },

    /**
     * Counts a click and returns the destination, for the redirect route. The count and the
     * enabled/expiry/maxClicks checks are one store step, so maxClicks is never exceeded.
     * `context.referrer` is reduced to its host; never pass the client IP.
     */
    async resolve(code: string, context: { referrer?: string | null; country?: string | null } = {}): Promise<ResolveResult> {
      if (typeof code !== "string" || !CODE.test(code)) return { status: 404, reason: "not-found" };
      const at = now();
      const hit = await store.recordClick(code, at);
      if (hit) {
        if (options.onClick) {
          let referrerHost: string | undefined;
          try {
            if (context.referrer) referrerHost = normalizeHost(new URL(context.referrer).hostname) || undefined;
          } catch { /* ignore an unparsable referrer */ }
          const country = typeof context.country === "string" && /^[A-Za-z]{2}$/.test(context.country) ? context.country.toUpperCase() : undefined;
          const event: ClickEvent = {
            linkId: hit.id, at, ...(referrerHost === undefined ? {} : { referrerHost }), ...(country === undefined ? {} : { country }),
          };
          try {
            await options.onClick(event);
          } catch { /* analytics must not break redirects */ }
        }
        return { status: 302, url: hit.url, linkId: hit.id };
      }
      const link = await store.findByCode(code);
      if (!link) return { status: 404, reason: "not-found" };
      const gone = reportGone ? 410 : 404;
      if (link.disabled) return { status: gone, reason: "disabled" };
      if (link.expiresAt !== null && link.expiresAt <= at) return { status: gone, reason: "expired" };
      return { status: gone, reason: "max-clicks" };
    },

    async get(actor: Actor, id: string): Promise<ShortLink> {
      const link = await load(id);
      await allowed(actor, "read", link.tenantId);
      return link;
    },

    /** Newest first, keyset-paginated; limit 1 to 100 (default 20). */
    async list(actor: Actor, query: { tenantId: string; cursor?: string | null; limit?: number }): Promise<{ links: ShortLink[]; nextCursor: string | null }> {
      if (typeof query.tenantId !== "string" || !TENANT.test(query.tenantId)) throw new ShortLinkError("invalid-tenant", "Invalid tenant id");
      const limit = query.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ShortLinkError("invalid-limit", "limit must be 1 to 100");
      const before = decodeCursor(query.cursor);
      await allowed(actor, "read", query.tenantId);
      const rows = await store.list(query.tenantId, { before, limit: limit + 1 });
      const links = rows.slice(0, limit);
      const last = links[links.length - 1];
      return { links, nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null };
    },

    async update(actor: Actor, id: string, patch: ShortLinkPatch): Promise<ShortLink> {
      const link = await load(id);
      await allowed(actor, "manage", link.tenantId);
      if (!patch || typeof patch !== "object") throw new ShortLinkError("invalid-patch", "Expected a patch object");
      const keys = Object.keys(patch);
      if (keys.length === 0 || keys.some((key) => !["url", "expiresAt", "disabled"].includes(key))) {
        throw new ShortLinkError("invalid-patch", "Patch may change url, expiresAt and disabled only");
      }
      const next: { url?: string; expiresAt?: number | null; disabled?: boolean } = {};
      if (patch.url !== undefined) next.url = await destination(patch.url);
      if ("expiresAt" in patch) next.expiresAt = expiry(patch.expiresAt, now());
      if (patch.disabled !== undefined) {
        if (typeof patch.disabled !== "boolean") throw new ShortLinkError("invalid-patch", "disabled must be true or false");
        next.disabled = patch.disabled;
      }
      const updated = await store.update(link.id, next);
      if (!updated) throw new ShortLinkError("not-found", "Link not found");
      return updated;
    },

    async remove(actor: Actor, id: string): Promise<void> {
      const link = await load(id);
      await allowed(actor, "manage", link.tenantId);
      if (!(await store.delete(link.id))) throw new ShortLinkError("not-found", "Link not found");
    },

    async stats(actor: Actor, id: string): Promise<{ clicks: number; lastClickAt: number | null }> {
      const link = await load(id);
      await allowed(actor, "read", link.tenantId);
      return { clicks: link.clicks, lastClickAt: link.lastClickAt };
    },
  };
}

export type ShortLinks = ReturnType<typeof createShortLinks>;
