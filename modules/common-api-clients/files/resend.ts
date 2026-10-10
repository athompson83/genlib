// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedString, createHttpClient, credential, idempotencyKey, requireString, type TokenProvider, type TransportOptions } from "./http.js";

export interface TransactionalEmail {
  from: string;
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
}
export interface ResendOptions<Context> extends TransportOptions {
  getApiKey: TokenProvider;
  /** Exact approved and verified sender identity, kept in trusted server configuration. */
  from: string;
  /** Must authorize these exact recipients and message purpose for the authenticated context. */
  authorize: (context: Context, email: Readonly<TransactionalEmail>, signal: AbortSignal) => boolean | Promise<boolean>;
}
export interface SendEmailInput<Context> {
  context: Context;
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
  /** Persist one key per delivery event; the provider's deduplication window is finite. */
  idempotencyKey: string;
  signal?: AbortSignal;
}
function mailbox(value: unknown, sender = false): string {
  const address = boundedString(value, "email address", 320);
  const pattern = sender ? /^(?:[^<>\r\n]+ <)?[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+>?$/u : /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/u;
  if (!pattern.test(address) || /[\u0000-\u001f\u007f]/u.test(address) || (address.includes("<") !== address.endsWith(">"))) throw new ApiClientError("INVALID_INPUT");
  return address;
}

export function createResendClient<Context>(options: ResendOptions<Context>) {
  if (typeof options.getApiKey !== "function" || typeof options.authorize !== "function") throw new ApiClientError("INVALID_CONFIG");
  const from = mailbox(options.from, true);
  const authorize = options.authorize;
  const getKey = options.getApiKey;
  return Object.freeze({
    async sendEmail(input: SendEmailInput<Context>): Promise<{ id: string }> {
      if (!Array.isArray(input.to) || !input.to.length || input.to.length > 50) throw new ApiClientError("INVALID_INPUT");
      const to = Object.freeze(input.to.map(address => mailbox(address)));
      if (new Set(to.map(address => address.toLowerCase())).size !== to.length) throw new ApiClientError("INVALID_INPUT");
      const subject = boundedString(input.subject, "subject", 998);
      if (/[\r\n]/u.test(subject)) throw new ApiClientError("INVALID_INPUT");
      const text = boundedString(input.text, "text body", 100000);
      const email: Readonly<TransactionalEmail> = Object.freeze({ from, to, subject, text,
        ...(input.html === undefined ? {} : { html: boundedString(input.html, "HTML body", 100000) }),
      });
      const key = idempotencyKey(input.idempotencyKey);
      const context = input.context;
      const http = createHttpClient({ ...options, origin: "https://api.resend.com", headers: async signal => {
        if (await authorize(context, email, signal) !== true) throw new ApiClientError("DENIED");
        if (signal.aborted) throw new ApiClientError("ABORTED");
        return { authorization: `Bearer ${credential(await getKey(signal))}`, "content-type": "application/json", "idempotency-key": key };
      } });
      const response = await http.request("/emails", { method: "POST", body: JSON.stringify(email), signal: input.signal });
      return { id: requireString(response, "id") };
    },
  });
}
