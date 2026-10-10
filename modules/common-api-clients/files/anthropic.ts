// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedString, createHttpClient, credential, requireRecord, requireString } from "./http.js";
import { readTokenUsage, validateAIOptions, type AIClientOptions, type AIInput, type TokenUsage } from "./ai-core.js";

export interface AnthropicOptions<Context> extends AIClientOptions<Context> {
  /** Explicit version header; documented stable Messages version is 2023-06-01. */
  apiVersion: string;
}
export interface AnthropicTextResponse {
  id: string;
  text: string;
  /** Inspect max_tokens/refusal before treating the response as complete. */
  stopReason: string | null;
  usage: TokenUsage | null;
}
export function createAnthropicClient<Context>(options: AnthropicOptions<Context>) {
  const config = validateAIOptions(options, 1);
  const apiVersion = boundedString(options.apiVersion, "API version", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(apiVersion)) throw new ApiClientError("INVALID_CONFIG");
  const authorize = options.authorize;
  const getKey = options.getApiKey;
  return Object.freeze({
    /** One Messages request with a text user message and no tools or automatic retry. */
    async createMessage(input: AIInput<Context>): Promise<AnthropicTextResponse> {
      const request = Object.freeze({ model: config.model, input: boundedString(input.input, "input", config.maxInputCharacters), maxOutputTokens: config.maxOutputTokens });
      const context = input.context;
      const http = createHttpClient({ ...options, origin: "https://api.anthropic.com", headers: async signal => {
        if (await authorize(context, request, signal) !== true) throw new ApiClientError("DENIED");
        if (signal.aborted) throw new ApiClientError("ABORTED");
        return { "x-api-key": credential(await getKey(signal)), "anthropic-version": apiVersion, "content-type": "application/json" };
      } });
      const data = requireRecord(await http.request("/v1/messages", {
        method: "POST", signal: input.signal,
        body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: request.input }],
          max_tokens: config.maxOutputTokens, stream: false,
          ...(config.instructions === undefined ? {} : { system: config.instructions }),
        }),
      }));
      if (!Array.isArray(data.content) || (data.stop_reason !== null && typeof data.stop_reason !== "string")) throw new ApiClientError("INVALID_RESPONSE");
      const text: string[] = [];
      for (const content of data.content) {
        const block = requireRecord(content);
        if (block.type === "text") text.push(requireString(block, "text"));
      }
      return { id: requireString(data, "id"), text: text.join("\n"), stopReason: data.stop_reason as string | null, usage: readTokenUsage(data.usage) };
    },
  });
}
