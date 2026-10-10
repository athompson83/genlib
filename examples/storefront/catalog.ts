export type Product = Readonly<{ id: string; title: string; category: string; active: boolean; priceMinor: number; currency: string; tags?: readonly string[] }>;
export type CatalogFilter = Readonly<{ query?: string; category?: string; tags?: readonly string[]; sort?: "title" | "price-asc" | "price-desc"; limit?: number }>;
/** Client-side filtering only; upstream authorization, stock and pricing remain authoritative. */
export function filterCatalog(products: readonly Product[], filter: CatalogFilter = {}): Product[] {
  const limit = filter.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid limit");
  const q = (filter.query ?? "").trim().toLocaleLowerCase();
  const result = products.filter(p => p.active && (!filter.category || p.category === filter.category) &&
    (!q || p.title.toLocaleLowerCase().includes(q)) &&
    (!filter.tags?.length || filter.tags.every(tag => p.tags?.includes(tag))));
  const sort = filter.sort ?? "title";
  if (!["title", "price-asc", "price-desc"].includes(sort)) throw new Error("Invalid sort");
  result.sort((a,b) => sort === "title" ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id) :
    (sort === "price-asc" ? a.priceMinor-b.priceMinor : b.priceMinor-a.priceMinor) || a.id.localeCompare(b.id));
  return result.slice(0,limit);
}
