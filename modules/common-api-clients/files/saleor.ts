// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, createHttpClient, credential, requireRecord, requireString } from './http.js';
import type { TokenProvider, TransportOptions } from './http.js';

export interface SaleorClientOptions extends TransportOptions {
  /** Trusted server configuration, never a URL from an incoming request. */
  endpoint: string;
  /** Omit for the public storefront catalog. Keep privileged tokens server-side. */
  token?: TokenProvider;
}

export interface SaleorProduct {
  id: string;
  name: string;
  slug: string;
}

export interface SaleorProductPage {
  products: SaleorProduct[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

function product(value: unknown): SaleorProduct {
  return { id: requireString(value, 'id'), name: requireString(value, 'name'), slug: requireString(value, 'slug') };
}

function graphData(value: unknown): Record<string, unknown> {
  const result = requireRecord(value);
  // HTTP 200 can still be a failed GraphQL operation. Do not turn partial data into success.
  if (result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length > 0)) {
    throw new ApiClientError('INVALID_RESPONSE');
  }
  return requireRecord(result.data);
}

/** Small catalog client, not a commerce engine or payment-authority implementation. */
export function createSaleorClient(options: SaleorClientOptions) {
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*graphql\/?$/.test(endpoint.pathname)) throw new Error();
  } catch { throw new ApiClientError('INVALID_CONFIG'); }
  const http = createHttpClient({
    ...options, origin: endpoint.origin,
    headers: async signal => ({
      'content-type': 'application/json',
      ...(options.token ? { authorization: 'Bearer ' + credential(await options.token(signal)) } : {}),
    }),
  });
  const endpointPath = endpoint.pathname;

  return Object.freeze({
    async listProducts(input: { channel: string; first?: number; after?: string; signal?: AbortSignal }): Promise<SaleorProductPage> {
      const channel = boundedString(input.channel, 'channel', 200);
      const first = boundedInteger(input.first ?? 20, 1, 100);
      const after = input.after === undefined ? null : boundedString(input.after, 'cursor', 2048);
      const data = graphData(await http.request(endpointPath, {
        method: 'POST', signal: input.signal,
        body: JSON.stringify({
          query: 'query GenlibProducts($channel: String!, $first: Int!, $after: String) { products(channel: $channel, first: $first, after: $after) { edges { node { id name slug } } pageInfo { hasNextPage endCursor } } }',
          variables: { channel, first, after },
        }),
      }));
      const connection = requireRecord(data.products);
      const info = requireRecord(connection.pageInfo);
      if (!Array.isArray(connection.edges) || connection.edges.length > first || typeof info.hasNextPage !== 'boolean' ||
        (info.endCursor !== null && typeof info.endCursor !== 'string') || (info.hasNextPage && !info.endCursor)) {
        throw new ApiClientError('INVALID_RESPONSE');
      }
      return {
        products: connection.edges.map(edge => product(requireRecord(edge).node)),
        pageInfo: { hasNextPage: info.hasNextPage, endCursor: info.endCursor },
      };
    },

    async getProduct(input: { id: string; channel: string; signal?: AbortSignal }): Promise<SaleorProduct | null> {
      const data = graphData(await http.request(endpointPath, {
        method: 'POST', signal: input.signal,
        body: JSON.stringify({
          query: 'query GenlibProduct($id: ID!, $channel: String!) { product(id: $id, channel: $channel) { id name slug } }',
          variables: { id: boundedString(input.id, 'product ID', 2048), channel: boundedString(input.channel, 'channel', 200) },
        }),
      }));
      return data.product === null ? null : product(data.product);
    },
  });
}
