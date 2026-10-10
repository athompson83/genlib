// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedString, createHttpClient, credential, requireRecord, requireString } from "./http.js";
import { readTokenUsage, validateAIOptions, type AIClientOptions, type AIInput, type TokenUsage } from "./ai-core.js";

export interface OpenAITextResponse {
  id: string;
  status: string;
  text: string;
  refusals: string[];
  incompleteReason: string | null;
  usage: TokenUsage | null;
}
export function createOpenAIClient<Context>(options: AIClientOptions<Context>) {
  const config = validateAIOptions(options, 16);
  const authorize = options.authorize;
  const getKey = options.getApiKey;
  return Object.freeze({
    /** Non-streaming text only. No tools, background jobs, conversation storage, or automatic retries. */
    async createResponse(input: AIInput<Context>): Promise<OpenAITextResponse> {
      const request = Object.freeze({ model: config.model, input: boundedString(input.input, "input", config.maxInputCharacters), maxOutputTokens: config.maxOutputTokens });
      const context = input.context;
      const http = createHttpClient({ ...options, origin: "https://api.openai.com", headers: async signal => {
        if (await authorize(context, request, signal) !== true) throw new ApiClientError("DENIED");
        if (signal.aborted) throw new ApiClientError("ABORTED");
        return { authorization: `Bearer ${credential(await getKey(signal))}`, "content-type": "application/json" };
      } });
      const data = requireRecord(await http.request("/v1/responses", {
        method: "POST", signal: input.signal,
        body: JSON.stringify({ model: config.model, input: request.input,
          max_output_tokens: config.maxOutputTokens, store: false, stream: false,
          ...(config.instructions === undefined ? {} : { instructions: config.instructions }),
        }),
      }));
      if (!Array.isArray(data.output)) throw new ApiClientError("INVALID_RESPONSE");
      const text: string[] = [];
      const refusals: string[] = [];
      // output_text is an SDK convenience; REST requires walking output message content.
      for (const output of data.output) {
        const item = requireRecord(output);
        if (item.type !== "message") continue;
        if (!Array.isArray(item.content)) throw new ApiClientError("INVALID_RESPONSE");
        for (const content of item.content) {
          const block = requireRecord(content);
          if (block.type === "output_text") text.push(requireString(block, "text"));
          else if (block.type === "refusal") refusals.push(requireString(block, "refusal"));
        }
      }
      const incompleteReason = data.incomplete_details == null ? null : requireString(data.incomplete_details, "reason");
      return { id: requireString(data, "id"), status: requireString(data, "status"), text: text.join("\n"), refusals,
        incompleteReason, usage: readTokenUsage(data.usage) };
    },
  });
}
