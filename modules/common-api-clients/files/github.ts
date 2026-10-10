// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, createHttpClient, credential, pathSegment, requireRecord, requireString, type TokenProvider, type TransportOptions } from "./http.js";

export interface GitHubOptions extends TransportOptions {
  /** User access token with repository metadata permission; scope this resolver to one tenant/user. */
  getAccessToken: TokenProvider;
  /** Explicitly pin a supported GitHub API date, e.g. 2026-03-10 after testing it. */
  apiVersion: string;
}
export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}
export interface RepositoryListOptions {
  perPage?: number;
  maxPages?: number;
  visibility?: "all" | "public" | "private";
  signal?: AbortSignal;
}

function repository(value: unknown): GitHubRepository {
  const record = requireRecord(value);
  if (!Number.isSafeInteger(record.id) || Number(record.id) < 1 || typeof record.private !== "boolean") throw new ApiClientError("INVALID_RESPONSE");
  return {
    id: record.id as number, name: requireString(record, "name"),
    fullName: requireString(record, "full_name"), private: record.private,
    defaultBranch: requireString(record, "default_branch"), htmlUrl: requireString(record, "html_url"),
  };
}

export function createGitHubClient(options: GitHubOptions) {
  const apiVersion = boundedString(options.apiVersion, "API version", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(apiVersion) || typeof options.getAccessToken !== "function") throw new ApiClientError("INVALID_CONFIG");
  const getToken = options.getAccessToken;
  const http = createHttpClient({ ...options, origin: "https://api.github.com", headers: async signal => ({
    authorization: `Bearer ${credential(await getToken(signal))}`,
    accept: "application/vnd.github+json", "x-github-api-version": apiVersion,
    "user-agent": "genlib-common-api-clients/0.1.0",
  }) });
  return Object.freeze({
    async getRepository(owner: string, name: string, signal?: AbortSignal): Promise<GitHubRepository> {
      return repository(await http.request(`/repos/${pathSegment(owner)}/${pathSegment(name)}`, { signal }));
    },
    async listRepositories(input: RepositoryListOptions = {}) {
      const perPage = boundedInteger(input.perPage ?? 30, 1, 100);
      const maxPages = boundedInteger(input.maxPages ?? 3, 1, 10);
      const visibility = input.visibility ?? "all";
      const signal = input.signal;
      if (!["all", "public", "private"].includes(visibility)) throw new ApiClientError("INVALID_INPUT");
      const repositories: GitHubRepository[] = [];
      let pagesFetched = 0;
      let possiblyMore = false;
      for (let page = 1; page <= maxPages; page += 1) {
        const query = new URLSearchParams({ per_page: String(perPage), page: String(page), sort: "full_name", direction: "asc", visibility });
        const result = await http.request(`/user/repos?${query}`, { signal });
        if (!Array.isArray(result) || result.length > perPage) throw new ApiClientError("INVALID_RESPONSE");
        repositories.push(...result.map(repository));
        pagesFetched += 1;
        possiblyMore = result.length === perPage;
        if (!possiblyMore) break;
      }
      return { repositories, pagesFetched, possiblyMore };
    },
  });
}
