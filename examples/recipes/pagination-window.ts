// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: page-number pagination math: page count, offsets and the page-button window with gaps. Original
// source; copy and adapt. pageWindow() follows MUI's usePagination: `boundaries` pages at each end, `siblings`
// pages on each side of the current page and a gap, represented as null (render it as an ellipsis), where pages are
// skipped. A gap never hides a single page (that page is shown instead) and small totals list every page once.
// Limits: perPage 1..1000, total >= 0, current 1..totalPages, siblings 0..5, boundaries 1..5; violations throw
// RangeError. For keyset/cursor pagination over changing data use the cursor-pagination recipe instead.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart pagination-window modules.

/** One entry of a page window: a 1-based page number, or null for a gap (ellipsis). */
export type PageItem = number | null;

const isInt = (n: number): boolean => Number.isSafeInteger(n);

/** Number of pages for totalItems (at least 1). */
export function pageCount(totalItems: number, perPage: number): number {
  if (!isInt(totalItems) || totalItems < 0 || !isInt(perPage) || perPage < 1 || perPage > 1000) {
    throw new RangeError("total must be >= 0 and perPage 1..1000");
  }
  return Math.max(1, Math.ceil(totalItems / perPage));
}

/** Zero-based offset of the first item on a 1-based page. */
export function pageOffset(page: number, perPage: number): number {
  if (!isInt(page) || page < 1 || !isInt(perPage) || perPage < 1 || perPage > 1000) {
    throw new RangeError("page must be >= 1 and perPage 1..1000");
  }
  return (page - 1) * perPage;
}

const range = (a: number, b: number): number[] => (b >= a ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : []);

/** Page numbers to show around the current page, with null for each gap. */
export function pageWindow(current: number, totalPages: number, siblings = 1, boundaries = 1): PageItem[] {
  const t = totalPages;
  if (![current, t, siblings, boundaries].every(isInt) || t < 1 || current < 1 || current > t ||
    siblings < 0 || siblings > 5 || boundaries < 1 || boundaries > 5) throw new RangeError("window arguments out of range");
  const start = range(1, Math.min(boundaries, t));
  const end = range(Math.max(t - boundaries + 1, boundaries + 1), t);
  const sStart = Math.max(Math.min(current - siblings, t - boundaries - siblings * 2 - 1), boundaries + 2);
  const sEnd = Math.min(Math.max(current + siblings, boundaries + siblings * 2 + 2), end.length ? (end[0] ?? 0) - 2 : t - 1);
  const items: PageItem[] = [...start];
  if (sStart > boundaries + 2) items.push(null);
  else if (boundaries + 1 < t - boundaries) items.push(boundaries + 1);
  items.push(...range(sStart, sEnd));
  if (sEnd < t - boundaries - 1) items.push(null);
  else if (t - boundaries > boundaries) items.push(t - boundaries);
  items.push(...end);
  const seen = new Set<number>();
  const out: PageItem[] = [];
  for (const x of items) {
    if (x === null) out.push(x);
    else if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}
