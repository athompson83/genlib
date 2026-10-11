// SPDX-License-Identifier: Apache-2.0
import { createPublicDataTransport, PublicDataError, inputText, queryPath, array, string, secret, type PublicDataOptions, type SecretProvider, type ReadOptions } from "./http.js";
export interface CensusTable { dataset: string; columns: string[]; rows: Record<string, string | null>[] }
/** Dataset includes its vintage, e.g. 2024/acs/acs5. Variable values stay strings (FIPS and suppression codes). */
export function createCensusClient(options: PublicDataOptions & { dataset: string; getApiKey: SecretProvider; allowedVariables: readonly string[] }) {
  const dataset = inputText(options.dataset, 200);
  if (!/^[0-9]{4}(?:\/[a-zA-Z0-9_-]+){1,6}$/u.test(dataset) || typeof options.getApiKey !== "function") throw new PublicDataError("INVALID_CONFIG");
  const getKey = options.getApiKey;
  if (!Array.isArray(options.allowedVariables) || options.allowedVariables.length < 1 || options.allowedVariables.length > 200) throw new PublicDataError("INVALID_CONFIG");
  const variables = new Set(options.allowedVariables.map(value => {
    const name = inputText(value, 80); if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(name)) throw new PublicDataError("INVALID_CONFIG"); return name;
  }));
  const http = createPublicDataTransport({ ...options, origin: options.origin ?? "https://api.census.gov", provider: "census",
    credentials: async signal => ({ query: { key: secret(await getKey(signal)) } }),
    source: "https://www.census.gov/data/developers.html",
    attribution: "This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau." });
  return Object.freeze({
    query(input: ReadOptions & { variables: readonly string[]; for: string; in?: string }) {
      if (!Array.isArray(input.variables) || input.variables.length < 1 || input.variables.length > 50 || new Set(input.variables).size !== input.variables.length || input.variables.some(v => !variables.has(v))) throw new PublicDataError("INVALID_INPUT");
      const geography = inputText(input.for, 150), within = input.in === undefined ? undefined : inputText(input.in, 300);
      // Preserve FIPS leading zeros. Only geography names, codes, wildcards and parent separators are accepted.
      if (!/^[A-Za-z][A-Za-z ]*:[0-9*,]+$/u.test(geography) || (within !== undefined && !/^[A-Za-z][A-Za-z0-9 :*,]*$/u.test(within))) throw new PublicDataError("INVALID_INPUT");
      const requested = [...input.variables];
      return http.request(queryPath(`/data/${dataset}`, { get: requested.join(","), for: geography, in: within }), value => {
        const table = array(value, 100001); if (table.length === 0) throw new PublicDataError("INVALID_RESPONSE");
        const columns = array(table[0], 100).map(string);
        if (new Set(columns).size !== columns.length || !requested.every(v => columns.includes(v))) throw new PublicDataError("INVALID_RESPONSE");
        const rows = table.slice(1).map(value => {
          const row = array(value, 100); if (row.length !== columns.length) throw new PublicDataError("INVALID_RESPONSE");
          // Object.fromEntries defines __proto__ as a data property rather than invoking a setter.
          return Object.fromEntries(columns.map((column, index) => [column, row[index] === null ? null : string(row[index])]));
        });
        return { dataset, columns, rows } satisfies CensusTable;
      }, input);
    },
  });
}
