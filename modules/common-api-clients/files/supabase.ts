// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, createHttpClient, credential, requireRecord, type TokenProvider, type TransportOptions } from "./http.js";

export interface SupabaseReadOptions extends TransportOptions {
  /** Trusted project origin, e.g. https://project-ref.supabase.co; never an incoming URL. */
  projectOrigin: string;
  /** This adapter deliberately accepts publishable keys only, not service-role or secret keys. */
  publishableKey: string;
  /** A caller-scoped user access token. Its signed claims are enforced by Supabase. */
  getAccessToken: TokenProvider;
  /** Explicit permitted table and column names. RLS still decides which rows may be read. */
  tables: Readonly<Record<string, readonly string[]>>;
}
export interface SupabaseReadInput {
  table: string;
  columns: readonly string[];
  equals?: Readonly<Record<string, string | number | boolean>>;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}
function identifier(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value)) throw new ApiClientError("INVALID_INPUT");
  return value;
}
const reservedFilters = new Set(["select", "order", "limit", "offset", "and", "or", "not", "columns", "on_conflict"]);

export function createSupabaseReadClient(options: SupabaseReadOptions) {
  const publishableKey = credential(options.publishableKey);
  if (!publishableKey.startsWith("sb_publishable_") || typeof options.getAccessToken !== "function" || !options.tables || Array.isArray(options.tables)) throw new ApiClientError("INVALID_CONFIG");
  const entries = Object.entries(options.tables);
  if (!entries.length || entries.length > 100) throw new ApiClientError("INVALID_CONFIG");
  const tables = new Map<string, ReadonlySet<string>>();
  for (const [table, columns] of entries) {
    if (!Array.isArray(columns) || !columns.length || columns.length > 100) throw new ApiClientError("INVALID_CONFIG");
    tables.set(identifier(table), new Set(columns.map(identifier)));
  }
  const getToken = options.getAccessToken;
  const http = createHttpClient({ ...options, origin: options.projectOrigin, headers: async signal => ({
    apikey: publishableKey, authorization: `Bearer ${credential(await getToken(signal))}`,
  }) });
  return Object.freeze({
    async readRows(input: SupabaseReadInput): Promise<Record<string, unknown>[]> {
      const table = identifier(input.table);
      const allowed = tables.get(table);
      if (!allowed || !Array.isArray(input.columns) || !input.columns.length || input.columns.length > 100) throw new ApiClientError("INVALID_INPUT");
      const columns = input.columns.map(identifier);
      if (new Set(columns).size !== columns.length || columns.some(column => !allowed.has(column))) throw new ApiClientError("INVALID_INPUT");
      const limit = boundedInteger(input.limit ?? 50, 1, 1000);
      const offset = boundedInteger(input.offset ?? 0, 0, 1000000);
      const query = new URLSearchParams({ select: columns.join(","), limit: String(limit), offset: String(offset) });
      if (input.equals !== undefined && (input.equals === null || typeof input.equals !== "object" || Array.isArray(input.equals))) throw new ApiClientError("INVALID_INPUT");
      const filters = Object.entries(input.equals ?? {});
      if (filters.length > 20) throw new ApiClientError("INVALID_INPUT");
      for (const [column, value] of filters) {
        if (reservedFilters.has(column) || !allowed.has(identifier(column)) || !["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) throw new ApiClientError("INVALID_INPUT");
        // Restrict to scalar eq; the caller cannot introduce operator, join, or OR syntax.
        const scalar = typeof value === "string" ? boundedString(value, "filter", 2048) : String(value);
        query.append(column, `eq.${scalar}`);
      }
      const rows = await http.request(`/rest/v1/${table}?${query}`, { signal: input.signal });
      if (!Array.isArray(rows) || rows.length > limit) throw new ApiClientError("INVALID_RESPONSE");
      return rows.map(value => {
        const row = requireRecord(value);
        if (columns.some(column => !Object.hasOwn(row, column))) throw new ApiClientError("INVALID_RESPONSE");
        return Object.fromEntries(columns.map(column => [column, row[column]]));
      });
    },
  });
}
