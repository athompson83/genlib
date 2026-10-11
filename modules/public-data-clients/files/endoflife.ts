// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, record, array, string, strings, nullableString, boolean, type PublicDataOptions, type ReadOptions, type DataResult } from "./http.js";
export interface ProductRelease { name: string; label: string; releasedAt: string | null; isLts: boolean | null; isEol: boolean | null; eolFrom: string | null; isMaintained: boolean | null; latest: { name: string; date: string | null; link: string | null } | null }
export interface LifecycleProduct { name: string; label: string; aliases: string[]; category: string | null; policyUrl: string | null; generatedAt: string | null; lastModified: string | null; releases: ProductRelease[] }
function productName(value: string): string { const p = inputText(value, 100); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(p)) throw new PublicDataError("INVALID_INPUT"); return p; }
const nullableBoolean = (value: unknown) => value == null ? null : boolean(value);
function release(value: unknown): ProductRelease {
  const r = record(value), latest = r.latest == null ? null : record(r.latest);
  return { name: string(r.name), label: string(r.label), releasedAt: nullableString(r.releaseDate), isLts: nullableBoolean(r.isLts),
    isEol: nullableBoolean(r.isEol), eolFrom: nullableString(r.eolFrom), isMaintained: nullableBoolean(r.isMaintained),
    latest: latest ? { name: string(latest.name), date: nullableString(latest.date), link: nullableString(latest.link) } : null };
}
/** Secondary lifecycle evidence; never automatically executes API-supplied version commands. */
export function createEndOfLifeClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://endoflife.date", provider: "endoflife-date",
    source: "https://endoflife.date/docs/api/v1/", attribution: "endoflife.date and linked official product policies; confirm important support decisions with the provider." });
  function getProduct(name: string, read: ReadOptions = {}) {
    return http.request(`/api/v1/products/${productName(name)}/`, value => {
      const envelope = record(value), r = record(envelope.result), links = record(r.links ?? {});
      return { name: string(r.name), label: string(r.label), aliases: strings(r.aliases ?? [], 100), category: nullableString(r.category), policyUrl: nullableString(links.releasePolicy),
        generatedAt: nullableString(envelope.generated_at), lastModified: nullableString(envelope.last_modified), releases: array(r.releases, 10000).map(release) } satisfies LifecycleProduct;
    }, read);
  }
  return Object.freeze({ getProduct,
    async findRelease(product: string, name: string, read: ReadOptions = {}): Promise<DataResult<ProductRelease | null>> {
      const selected = inputText(name, 100), result = await getProduct(product, read);
      if (result.notModified) return result;
      return { ...result, data: result.data.releases.find(r => r.name === selected) ?? null };
    },
  });
}
