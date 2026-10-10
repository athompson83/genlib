// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, requireRecord, type TokenProvider, type TransportOptions } from "./http.js";

export interface AuthorizedAIRequest {
  model: string;
  input: string;
  maxOutputTokens: number;
}
export interface AIClientOptions<Context> extends TransportOptions {
  getApiKey: TokenProvider;
  /** A model tested and enabled for this account, held in trusted server configuration. */
  model: string;
  maxOutputTokens: number;
  /** Additional input bound; 1–100000 characters, default 20000. Transport also caps bytes. */
  maxInputCharacters?: number;
  /** Trusted project instructions; input content is always sent separately. */
  instructions?: string;
  /** Check authenticated tenant, use case, data disclosure, and available budget before a paid call. */
  authorize: (context: Context, request: Readonly<AuthorizedAIRequest>, signal: AbortSignal) => boolean | Promise<boolean>;
}
export interface AIInput<Context> {
  context: Context;
  input: string;
  signal?: AbortSignal;
}
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}
export function readTokenUsage(value: unknown): TokenUsage | null {
  if (value === undefined || value === null) return null;
  const usage = requireRecord(value);
  if (!Number.isSafeInteger(usage.input_tokens) || Number(usage.input_tokens) < 0 || !Number.isSafeInteger(usage.output_tokens) || Number(usage.output_tokens) < 0) throw new ApiClientError("INVALID_RESPONSE");
  return { inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number };
}
export function validateAIOptions<Context>(options: AIClientOptions<Context>, minimumTokens: number) {
  if (typeof options.getApiKey !== "function" || typeof options.authorize !== "function") throw new ApiClientError("INVALID_CONFIG");
  return Object.freeze({
    model: boundedString(options.model, "model", 200),
    maxOutputTokens: boundedInteger(options.maxOutputTokens, minimumTokens, 32768),
    maxInputCharacters: boundedInteger(options.maxInputCharacters ?? 20000, 1, 100000),
    ...(options.instructions === undefined ? {} : { instructions: boundedString(options.instructions, "instructions", 20000) }),
  });
}
