// SPDX-License-Identifier: Apache-2.0
// URL slugs, framework-neutral: titles become lowercase URL-safe slugs, each slug is unique within a scope (one
// tenant's collection, for example "tenant-42:posts"), reserved words and route names are refused, and renames keep
// the old slugs so they resolve to a permanent redirect to the current one. Uniqueness is enforced by the store (a
// unique (scope, slug) key) and the core retries on conflict, so concurrent creates of one title get distinct slugs.
// Old slugs stay owned by their entity forever (until it is removed), so another entity cannot take over a redirect.

export interface SlugRecord {
  readonly scope: string;
  readonly slug: string;
  readonly entityId: string;
  readonly createdAt: number;
  /** Set when the slug stopped being the entity's current slug; it then redirects to the current one. */
  readonly retiredAt?: number;
}

export type InsertOutcome = "inserted" | "slug-taken" | "entity-exists";
export type RenameOutcome = "renamed" | "unchanged" | "slug-taken" | "not-found" | "conflict";

export interface SlugStore {
  /** Which of `slugs` already exist (current or retired) in the scope. */
  takenAmong(scope: string, slugs: readonly string[]): Promise<readonly string[]>;
  /**
   * Inserts a current slug. Must be atomic against a unique (scope, slug) key and a unique current slug per
   * (scope, entityId): "slug-taken" when the slug exists, "entity-exists" when the entity already has a current slug.
   */
  insert(record: SlugRecord): Promise<InsertOutcome>;
  /**
   * Makes `slug` the entity's current slug and retires the previous one, atomically. Reclaims the slug when it is one
   * of the entity's own retired slugs. "slug-taken" when another entity owns it, "not-found" when the entity has no
   * current slug, "conflict" when a concurrent rename interfered (the caller retries).
   */
  rename(scope: string, entityId: string, slug: string, now: number): Promise<RenameOutcome>;
  /** The entity owning `slug` (current or retired) and that entity's current slug, or null. */
  lookup(scope: string, slug: string): Promise<{ entityId: string; current: string } | null>;
  /** Every slug of the entity, oldest first. */
  history(scope: string, entityId: string): Promise<SlugRecord[]>;
  /** Deletes every slug of the entity (current and retired), freeing them; returns how many were deleted. */
  remove(scope: string, entityId: string): Promise<number>;
}

export type SlugErrorCode =
  | "invalid-scope" | "invalid-entity" | "invalid-slug" | "reserved-slug" | "slug-taken"
  | "entity-exists" | "not-found" | "conflict" | "slug-unavailable";

export class SlugError extends Error {
  readonly code: SlugErrorCode;
  constructor(code: SlugErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SlugError";
  }
}

export interface SlugifyOptions {
  /** Maximum length in code points (default 80). Longer slugs are cut at a word boundary. */
  readonly maxLength?: number;
  readonly separator?: "-" | "_";
  /** Keep letters and digits of any script (Cyrillic, CJK ...) instead of reducing to ASCII a-z0-9. */
  readonly unicode?: boolean;
  /** Returned when nothing usable remains (default "item"); "" returns an empty string instead. */
  readonly fallback?: string;
}

/** Route names and words a public slug must not take. Extend it: `reserved: [...DEFAULT_RESERVED_SLUGS, "posts"]`. */
export const DEFAULT_RESERVED_SLUGS: readonly string[] = [
  "new", "edit", "delete", "create", "update", "api", "admin", "administrator", "dashboard", "settings", "account",
  "login", "logout", "signin", "signout", "signup", "register", "auth", "oauth", "callback", "search", "feed", "rss",
  "sitemap", "robots", "static", "assets", "public", "_next", "www", "app", "help", "support", "about", "terms",
  "privacy", "null", "undefined", "index",
];

// Transliterations of U+00C0..U+017F in code-point order (the shared Genlib slug table); "" means none (× and ÷).
const TABLE: readonly string[] = (
  "A|A|A|A|A|A|AE|C|E|E|E|E|I|I|I|I|D|N|O|O|O|O|O||O|U|U|U|U|Y|TH|ss|a|a|a|a|a|a|ae|c|e|e|e|e|" +
  "i|i|i|i|d|n|o|o|o|o|o||o|u|u|u|u|y|th|y|A|a|A|a|A|a|C|c|C|c|C|c|C|c|D|d|D|d|E|e|E|e|E|e|E|e|" +
  "E|e|G|g|G|g|G|g|G|g|H|h|H|h|I|i|I|i|I|i|I|i|I|i|IJ|ij|J|j|K|k|q|L|l|L|l|L|l|L|l|L|l|N|n|N|n|" +
  "N|n|n|N|n|O|o|O|o|O|o|OE|oe|R|r|R|r|R|r|S|s|S|s|S|s|S|s|T|t|T|t|T|t|U|u|U|u|U|u|U|u|U|u|U|u|" +
  "W|w|Y|y|Y|Z|z|Z|z|Z|z|s"
).split("|");

const APOSTROPHES = new Set([0x27, 0x2019, 0x02bc]);
const ASCII_WORD = /^[a-z0-9]$/;
const UNICODE_WORD = /^[\p{L}\p{N}]$/u;
const MARK = /^\p{M}$/u;
const MARKS = /\p{M}+/gu;
// eslint-disable-next-line no-control-regex
const ASCII = /^[\u0000-\u007f]*$/;
const MAX_ID = 255;

function codePoints(value: string): string[] {
  return Array.from(value);
}

/** Joins words with `sep` while the result fits `max` code points; a single overlong first word is hard-cut. */
function fitWords(words: readonly string[], sep: string, max: number): string {
  let out = "";
  let length = 0;
  for (const word of words) {
    const add = codePoints(word).length + (out ? 1 : 0);
    if (length + add > max) break;
    out = out ? out + sep + word : word;
    length += add;
  }
  if (!out && words.length > 0) out = codePoints(words[0] ?? "").slice(0, max).join("");
  return out;
}

/** What one lowercase, compatibility-normalized character becomes before word classification. */
function fold(ch: string, unicode: boolean): string {
  const cp = ch.codePointAt(0) ?? 0;
  const table = cp >= 0xc0 && cp <= 0x17f ? TABLE[cp - 0xc0] : undefined;
  if (table !== undefined && table !== "") return table.toLowerCase();
  // Decompose and drop marks (ạ -> a). When that does not give ASCII and other scripts are kept, keep the
  // character itself (й stays й, not и).
  const stripped = ch.normalize("NFKD").replace(MARKS, "").toLowerCase();
  return unicode && !ASCII.test(stripped) ? ch : stripped;
}

function rawWords(text: string, unicode: boolean): string[] {
  const result: string[] = [];
  let current = "";
  // Whether the last character kept in `current` is non-ASCII: only then may a combining mark follow it, so a
  // mark never re-attaches to a Latin letter that a later pass would transliterate.
  let markable = false;
  const breakWord = () => { if (current) { result.push(current.normalize("NFC")); current = ""; } markable = false; };
  // Compose first (e + U+0301 -> é, which the table then folds) so decomposed and composed input agree.
  for (const char of text.normalize("NFC")) {
    const cp = char.codePointAt(0) ?? 0;
    if (APOSTROPHES.has(cp)) continue; // "don't" -> "dont"
    if (char === "&") { breakWord(); result.push("and"); continue; }
    // Compatibility forms first (ᴭ -> Æ, ℏ -> ħ, 𝚤 -> ı, ﬁ -> fi), then lowercase (ẞ -> ß), then the table.
    for (const lower of char.normalize("NFKC").toLowerCase()) {
      for (const ch of MARK.test(lower) ? lower : fold(lower, unicode)) {
        if (ASCII_WORD.test(ch)) { current += ch; markable = false; }
        else if (MARK.test(ch)) { if (unicode && markable) current += ch; } // marks never split a word
        else if (unicode && UNICODE_WORD.test(ch)) { current += ch; markable = true; }
        else breakWord();
      }
    }
  }
  breakWord();
  return result;
}

/** Words of `text`; re-folded until stable so that slugify(slugify(x)) === slugify(x) always holds. */
function words(text: string, unicode: boolean): string[] {
  let result = rawWords(text, unicode);
  for (let pass = 0; pass < 4; pass++) {
    const again = rawWords(result.join(" "), unicode);
    if (again.join(" ") === result.join(" ")) return result;
    result = again;
  }
  return result;
}

/** Lowercase, URL-safe slug of `text`. Deterministic; does not check uniqueness. */
export function slugify(text: string, options: SlugifyOptions = {}): string {
  const sep = options.separator ?? "-";
  if (sep !== "-" && sep !== "_") throw new RangeError('separator must be "-" or "_"');
  const max = options.maxLength ?? 80;
  if (!Number.isInteger(max) || max < 1) throw new RangeError("maxLength must be a positive integer");
  const slug = fitWords(words(typeof text === "string" ? text : "", options.unicode === true), sep, max);
  return slug || (options.fallback ?? "item");
}

/** True when `slug` is exactly what slugify would produce for it (non-empty, lowercase, single separators). */
export function isCanonicalSlug(slug: string, options: Omit<SlugifyOptions, "fallback"> = {}): boolean {
  return typeof slug === "string" && slug !== "" && slugify(slug, { ...options, fallback: "" }) === slug;
}

/**
 * Builds a scope from a tenant id and a collection name without ambiguity (each part is percent-encoded, so
 * "a:b" + "c" and "a" + "b:c" never collide). Take the tenant from trusted server context, never from the URL.
 */
export function slugScope(tenantId: string, collection: string): string {
  return `${encodeURIComponent(checkId(tenantId, "invalid-scope"))}:${encodeURIComponent(checkId(collection, "invalid-scope"))}`;
}

export interface UrlSlugsOptions {
  readonly store: SlugStore;
  /** Default 80 code points; 8 to 200. */
  readonly maxLength?: number;
  readonly separator?: "-" | "_";
  readonly unicode?: boolean;
  /** Slug used when a title has no usable characters (default "item"); it gets suffixes like any other. */
  readonly fallback?: string;
  /** Replaces DEFAULT_RESERVED_SLUGS. Compared case-insensitively against whole slugs. */
  readonly reserved?: Iterable<string>;
  /** Insert/rename attempts before failing with "conflict" (default 50). */
  readonly maxAttempts?: number;
  /** Highest numeric suffix tried before "slug-unavailable" (default 10,000). */
  readonly maxSuffix?: number;
  readonly now?: () => number;
}

export interface WriteOptions {
  /**
   * Treat the text as a user-chosen slug: it must already be canonical (else invalid-slug), and reserved or taken
   * slugs are refused instead of getting a suffix.
   */
  readonly exact?: boolean;
}

export type ResolveResult =
  | { readonly status: "ok"; readonly entityId: string; readonly slug: string }
  | { readonly status: "redirect"; readonly entityId: string; readonly slug: string; readonly from: string }
  | { readonly status: "not-found" };

const WINDOW = 50;

function checkId(value: unknown, code: "invalid-scope" | "invalid-entity"): string {
  // eslint-disable-next-line no-control-regex
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ID || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SlugError(code, code === "invalid-scope" ? "Invalid slug scope" : "Invalid entity id");
  }
  return value;
}

export function createUrlSlugs(options: UrlSlugsOptions) {
  const { store } = options;
  const max = options.maxLength ?? 80;
  if (!Number.isInteger(max) || max < 8 || max > 200) throw new RangeError("maxLength must be 8 to 200");
  const sep = options.separator ?? "-";
  if (sep !== "-" && sep !== "_") throw new RangeError('separator must be "-" or "_"');
  const unicode = options.unicode === true;
  const shape = { maxLength: max, separator: sep, unicode } as const;
  const fallback = options.fallback ?? "item";
  if (!isCanonicalSlug(fallback, shape)) throw new RangeError("fallback must itself be a canonical slug");
  const reserved = new Set([...(options.reserved ?? DEFAULT_RESERVED_SLUGS)].map((word) => word.trim().toLowerCase()));
  const maxAttempts = options.maxAttempts ?? 50;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) throw new RangeError("maxAttempts must be 1 to 1000");
  const maxSuffix = options.maxSuffix ?? 10_000;
  if (!Number.isInteger(maxSuffix) || maxSuffix < 2) throw new RangeError("maxSuffix must be an integer of at least 2");
  const now = options.now ?? Date.now;

  const toSlug = (text: string): string => slugify(text, { ...shape, fallback });

  /** base for n = 1, else the base cut at a word boundary so `base-n` fits maxLength. */
  function candidate(base: string, n: number): string {
    if (n === 1) return base;
    const suffix = `${sep}${n}`;
    const head = fitWords(base.split(sep), sep, max - suffix.length);
    return `${head || fallback}${suffix}`;
  }

  /** First non-reserved candidate that is free in the scope or already owned by the entity. */
  async function pick(scope: string, base: string, own: ReadonlySet<string>): Promise<string> {
    for (let start = 1; start <= maxSuffix; start += WINDOW) {
      const batch: string[] = [];
      for (let n = start; n < start + WINDOW && n <= maxSuffix; n++) {
        const slug = candidate(base, n);
        if (!reserved.has(slug) && !batch.includes(slug)) batch.push(slug);
      }
      const taken = new Set(await store.takenAmong(scope, batch));
      const free = batch.find((slug) => !taken.has(slug) || own.has(slug));
      if (free !== undefined) return free;
    }
    throw new SlugError("slug-unavailable", "No free slug for this title");
  }

  function exactSlug(text: string): string {
    // A user-chosen slug must already be canonical; it is never silently rewritten (pass it through slugify first).
    if (typeof text !== "string" || !isCanonicalSlug(text, shape)) throw new SlugError("invalid-slug", "Not a valid slug: use lowercase letters, digits and single separators");
    const slug = text;
    if (reserved.has(slug)) throw new SlugError("reserved-slug", "This slug is reserved");
    return slug;
  }

  return {
    /** The slug a title would get before uniqueness (configured length, separator and fallback). */
    slugify: toSlug,

    isReserved: (slug: string): boolean => reserved.has(String(slug).toLowerCase()),

    /**
     * Gives `entityId` its first slug in `scope`. A taken or reserved slug gets the first free numeric suffix
     * (post, post-2, post-3 ...) unless `exact` is set, in which case it is refused.
     */
    async create(scope: string, entityId: string, title: string, write: WriteOptions = {}): Promise<{ slug: string }> {
      checkId(scope, "invalid-scope");
      checkId(entityId, "invalid-entity");
      const base = write.exact ? exactSlug(title) : toSlug(title);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const slug = write.exact ? base : await pick(scope, base, new Set());
        const outcome = await store.insert({ scope, slug, entityId, createdAt: now() });
        if (outcome === "inserted") return { slug };
        if (outcome === "entity-exists") throw new SlugError("entity-exists", "This entity already has a slug; rename it instead");
        if (write.exact) throw new SlugError("slug-taken", "This slug is already in use");
        // slug-taken: a concurrent writer won this candidate; pick again.
      }
      throw new SlugError("conflict", "Could not allocate a slug; try again");
    },

    /**
     * Changes the entity's slug. The old slug is kept and redirects to the new one; renaming back to one of the
     * entity's own old slugs reclaims it. Returns the current slug, the previous one and whether it changed.
     */
    async rename(scope: string, entityId: string, title: string, write: WriteOptions = {}): Promise<{ slug: string; previous: string; changed: boolean }> {
      checkId(scope, "invalid-scope");
      checkId(entityId, "invalid-entity");
      const base = write.exact ? exactSlug(title) : toSlug(title);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const history = await store.history(scope, entityId);
        const current = history.find((record) => record.retiredAt === undefined)?.slug;
        if (current === undefined) {
          if (history.length === 0) throw new SlugError("not-found", "This entity has no slug");
          continue; // mid-rename by another writer
        }
        const own = new Set(history.map((record) => record.slug));
        const reclaim = own.has(base) && !reserved.has(base);
        const slug = write.exact || base === current || reclaim ? base : await pick(scope, base, own);
        if (slug === current) return { slug, previous: current, changed: false };
        const outcome = await store.rename(scope, entityId, slug, now());
        if (outcome === "renamed") return { slug, previous: current, changed: true };
        if (outcome === "unchanged") return { slug, previous: slug, changed: false };
        if (outcome === "not-found") throw new SlugError("not-found", "This entity has no slug");
        if (outcome === "slug-taken" && write.exact) throw new SlugError("slug-taken", "This slug is already in use");
        // slug-taken (auto) or conflict: re-read and try again.
      }
      throw new SlugError("conflict", "Could not rename; try again");
    },

    /**
     * Resolves a slug from a URL: "ok" for the current slug, "redirect" (to the current slug, never to another old
     * one, so chains collapse and cannot loop) for an old or differently cased slug, otherwise "not-found".
     */
    async resolve(scope: string, slug: string): Promise<ResolveResult> {
      checkId(scope, "invalid-scope");
      if (typeof slug !== "string" || slug.length === 0 || slug.length > max * 4) return { status: "not-found" };
      const lower = slug.normalize("NFC").toLowerCase();
      if (!isCanonicalSlug(lower, shape)) return { status: "not-found" };
      const found = await store.lookup(scope, lower);
      if (!found) return { status: "not-found" };
      if (found.current === slug) return { status: "ok", entityId: found.entityId, slug: found.current };
      return { status: "redirect", entityId: found.entityId, slug: found.current, from: slug };
    },

    /** The entity's current slug, or null. */
    async current(scope: string, entityId: string): Promise<string | null> {
      const history = await store.history(checkId(scope, "invalid-scope"), checkId(entityId, "invalid-entity"));
      return history.find((record) => record.retiredAt === undefined)?.slug ?? null;
    },

    /** Every slug the entity has had in the scope, oldest first. */
    history(scope: string, entityId: string): Promise<SlugRecord[]> {
      return store.history(checkId(scope, "invalid-scope"), checkId(entityId, "invalid-entity"));
    },

    /** Deletes the entity's slugs (call when the entity is deleted); its old URLs then return not-found. */
    remove(scope: string, entityId: string): Promise<number> {
      return store.remove(checkId(scope, "invalid-scope"), checkId(entityId, "invalid-entity"));
    },
  };
}

export type UrlSlugs = ReturnType<typeof createUrlSlugs>;
