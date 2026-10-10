// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, applicationAgent, inputText, inputInteger, queryPath, record, array, string, strings, number, nullableString, nullableNumber, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface FoodProduct { code: string; name: string | null; brands: string | null; quantity: string | null; ingredientsText: string | null; allergens: string[]; nutritionGrade: string | null; nutritionPer100g: { energyKcal: number | null; fat: number | null; carbohydrates: number | null; sugars: number | null; proteins: number | null; salt: number | null }; imageUrl: string | null }
const fields = "code,product_name,brands,quantity,ingredients_text,allergens_tags,nutriscore_grade,nutriments,image_front_url";
function barcode(value: unknown): string { const code = inputText(value, 14); if (!/^\d{8,14}$/u.test(code)) throw new PublicDataError("INVALID_INPUT"); return code; }
function product(value: unknown): FoodProduct {
  const p = record(value), n = record(p.nutriments ?? {});
  return { code: barcode(p.code), name: nullableString(p.product_name), brands: nullableString(p.brands), quantity: nullableString(p.quantity),
    ingredientsText: nullableString(p.ingredients_text), allergens: strings(p.allergens_tags ?? [], 500), nutritionGrade: nullableString(p.nutriscore_grade),
    nutritionPer100g: { energyKcal: nullableNumber(n["energy-kcal_100g"]), fat: nullableNumber(n.fat_100g), carbohydrates: nullableNumber(n.carbohydrates_100g),
      sugars: nullableNumber(n.sugars_100g), proteins: nullableNumber(n.proteins_100g), salt: nullableNumber(n.salt_100g) }, imageUrl: nullableString(p.image_front_url) };
}
function tag(value: string | undefined): string | undefined {
  if (value === undefined) return undefined; const t = inputText(value, 100);
  if (!/^[a-z0-9][a-z0-9:-]*$/u.test(t)) throw new PublicDataError("INVALID_INPUT"); return t;
}
export function createOpenFoodFactsClient(options: PublicDataOptions & { userAgent: string }) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://world.openfoodfacts.org", provider: "open-food-facts",
    headers: { "user-agent": applicationAgent(options.userAgent) }, source: "https://openfoodfacts.github.io/openfoodfacts-server/api/",
    attribution: "Open Food Facts: database ODbL, contents DbCL; images CC BY-SA and applicable embedded rights." });
  return Object.freeze({
    getProduct(code: string, read: ReadOptions = {}) {
      const selected = barcode(code);
      return http.request(queryPath(`/api/v3/product/${selected}`, { fields }), value => {
        const r = record(value); if (r.status !== "success" && r.status !== "success_with_warnings") throw new PublicDataError("INVALID_RESPONSE");
        const item = product(r.product); if (item.code !== selected) throw new PublicDataError("INVALID_RESPONSE"); return item;
      }, read);
    },
    /** Structured taxonomy filters; this does not claim that v2 search supports arbitrary full-text queries. */
    search(input: ReadOptions & { categoryTag?: string; brandTag?: string; countryTag?: string; page?: number; pageSize?: number }) {
      const category = tag(input.categoryTag), brand = tag(input.brandTag), country = tag(input.countryTag);
      if (!category && !brand && !country) throw new PublicDataError("INVALID_INPUT");
      const page = inputInteger(input.page ?? 1, 1, 1000), pageSize = inputInteger(input.pageSize ?? 20, 1, 50);
      return http.request(queryPath("/api/v2/search", { categories_tags: category, brands_tags: brand, countries_tags: country, page, page_size: pageSize, fields }), value => {
        const r = record(value), count = number(r.count), items = array(r.products, pageSize).map(product);
        return { items, total: count, page, nextPage: page * pageSize < count ? page + 1 : null };
      }, input);
    },
  });
}
