// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: URL slugs and collision-free unique slugs. Original source; copy and adapt.

export interface SlugOptions {
  /** Maximum slug length in UTF-16 code units (default 80). */
  maxLength?: number;
  separator?: "-" | "_";
  /** Keep letters and digits from any script instead of reducing to ASCII a-z0-9. */
  unicode?: boolean;
  /** Returned when nothing usable remains, for example for emoji-only input (default "item"). */
  fallback?: string;
}

const SPECIAL: Record<string, string> = { "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ł": "l", "þ": "th", "&": " and " };

function trimSeparators(value: string, sep: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === sep) start++;
  while (end > start && value[end - 1] === sep) end--;
  return value.slice(start, end);
}

/** Lowercase, accent-free, separator-joined slug. Deterministic; does not guarantee uniqueness. */
export function slugify(input: string, options: SlugOptions = {}): string {
  const sep = options.separator ?? "-";
  const max = options.maxLength ?? 80;
  if (!Number.isInteger(max) || max < 1) throw new RangeError("maxLength must be a positive integer");
  const lowered = input.toLowerCase().replace(/[ßæœøđłþ&]/g, (ch) => SPECIAL[ch] ?? ch);
  const stripped = lowered.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/['\u2019]/g, "");
  const pattern = options.unicode ? /[^\p{L}\p{N}]+/gu : /[^a-z0-9]+/g;
  const joined = trimSeparators(stripped.replace(pattern, sep), sep);
  const slug = trimSeparators(Array.from(joined).slice(0, max).join("").slice(0, max), sep);
  return slug || (options.fallback ?? "item");
}

/**
 * Returns `desired`'s slug or the first free `slug-2`, `slug-3`, ... variant.
 * `taken` may be a set/list or a predicate. This is only a pre-check: enforce a
 * database unique constraint and retry on conflict, because two writers can race.
 */
export function uniqueSlug(
  desired: string,
  taken: Iterable<string> | ((slug: string) => boolean),
  options: SlugOptions & { maxAttempts?: number } = {},
): string {
  const sep = options.separator ?? "-";
  const max = options.maxLength ?? 80;
  const attempts = options.maxAttempts ?? 10_000;
  const isTaken = typeof taken === "function" ? taken : ((set: Set<string>) => (s: string) => set.has(s))(new Set(taken));
  const base = slugify(desired, options);
  if (!isTaken(base)) return base;
  for (let n = 2; n <= attempts + 1; n++) {
    const suffix = `${sep}${n}`;
    if (suffix.length >= max) break;
    const head = trimSeparators(base.slice(0, max - suffix.length), sep) || (options.fallback ?? "item");
    const candidate = `${head}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error("No unique slug available within maxAttempts/maxLength");
}
