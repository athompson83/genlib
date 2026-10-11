// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, dateInput, queryPath, record, array, string, number, strings, type PublicDataOptions, type ReadOptions } from "./http.js";
export interface ReferenceRate { date: string; base: string; quote: string; rate: number; providers: string[] | null }
export interface RateSelection extends ReadOptions { date?: string; providers?: readonly string[] }
function currency(value: string): string {
  const result = inputText(value, 3).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(result)) throw new PublicDataError("INVALID_INPUT"); return result;
}
function providers(value: readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new PublicDataError("INVALID_INPUT");
  return value.map(v => { const p = inputText(v, 40); if (!/^[a-z0-9-]+$/u.test(p)) throw new PublicDataError("INVALID_INPUT"); return p; }).join(",");
}
function rate(value: unknown): ReferenceRate {
  const r = record(value), amount = number(r.rate);
  if (amount <= 0) throw new PublicDataError("INVALID_RESPONSE");
  return { date: dateInput(r.date), base: currency(string(r.base)), quote: currency(string(r.quote)), rate: amount,
    providers: r.providers === undefined ? null : strings(r.providers, 100) };
}
/** Returns reference rates, never a rounded transaction amount or a trade quote. */
export function createFrankfurterClient(options: PublicDataOptions = {}) {
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.frankfurter.dev", provider: "frankfurter",
    source: "https://frankfurter.dev/", attribution: "Frankfurter; retain the selected rate providers and their data terms." });
  return Object.freeze({
    getRate(base: string, quote: string, selection: RateSelection = {}) {
      const path = queryPath(`/v2/rate/${currency(base)}/${currency(quote)}`, {
        date: selection.date === undefined ? undefined : dateInput(selection.date), providers: providers(selection.providers), expand: "providers" });
      return http.request(path, rate, selection);
    },
    getRates(selection: RateSelection & { base: string; quotes: readonly string[]; from?: string; to?: string }) {
      if (!Array.isArray(selection.quotes) || selection.quotes.length < 1 || selection.quotes.length > 50) throw new PublicDataError("INVALID_INPUT");
      const from = selection.from === undefined ? undefined : dateInput(selection.from), to = selection.to === undefined ? undefined : dateInput(selection.to);
      if ((from === undefined) !== (to === undefined) || (from && to && from > to) || (selection.date !== undefined && from !== undefined)) throw new PublicDataError("INVALID_INPUT");
      return http.request(queryPath("/v2/rates", { base: currency(selection.base), quotes: selection.quotes.map(currency).join(","),
        date: selection.date === undefined ? undefined : dateInput(selection.date), from, to, providers: providers(selection.providers), expand: "providers" }),
      value => array(value).map(rate), selection);
    },
  });
}
