// SPDX-License-Identifier: Apache-2.0
import { ApiClientError, boundedInteger, boundedString, createHttpClient, credential, idempotencyKey, requireRecord, requireString, type TokenProvider, type TransportOptions } from "./http.js";

export interface CheckoutProduct {
  priceId: string;
  mode: "payment" | "subscription";
  maxQuantity?: number;
}
export interface AuthorizedPurchase {
  productKey: string;
  quantity: number;
  /** An opaque order identifier resolved by the authenticated application, not a client user ID. */
  referenceId: string;
}
export interface StripeCheckoutOptions<Context> extends TransportOptions {
  getSecretKey: TokenProvider;
  /** Pin to the Stripe version tested by the receiving project. */
  apiVersion: string;
  /** Server-owned prices and mode. Client JSON cannot introduce price IDs or amounts. */
  products: Readonly<Record<string, CheckoutProduct>>;
  successUrl: string;
  cancelUrl: string;
  /** Authenticate context and authorize this order, product, quantity, and tenant. */
  authorize: (context: Context, purchase: Readonly<AuthorizedPurchase>, signal: AbortSignal) => boolean | Promise<boolean>;
}
export interface CreateCheckoutInput<Context> {
  context: Context;
  productKey: string;
  quantity?: number;
  referenceId: string;
  /** Reuse the same persisted key for the same order attempt. Never generate a new one on retry. */
  idempotencyKey: string;
  signal?: AbortSignal;
}
export interface CheckoutSession {
  id: string;
  url: string | null;
}

function returnUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || /[\u0000-\u0020\\]/u.test(value)) throw new Error();
    return value;
  } catch { throw new ApiClientError("INVALID_CONFIG"); }
}

export function createStripeCheckoutClient<Context>(options: StripeCheckoutOptions<Context>) {
  if (typeof options.getSecretKey !== "function" || typeof options.authorize !== "function" || !options.products || Array.isArray(options.products)) throw new ApiClientError("INVALID_CONFIG");
  const apiVersion = boundedString(options.apiVersion, "Stripe version", 80);
  if (!/^\d{4}-\d{2}-\d{2}(?:\.[A-Za-z0-9_-]+)?$/u.test(apiVersion)) throw new ApiClientError("INVALID_CONFIG");
  const products = new Map<string, Required<CheckoutProduct>>();
  const entries = Object.entries(options.products);
  if (!entries.length || entries.length > 1000) throw new ApiClientError("INVALID_CONFIG");
  for (const [key, product] of entries) {
    boundedString(key, "product key", 100);
    if (!product || !/^price_[A-Za-z0-9]+$/u.test(product.priceId) || !["payment", "subscription"].includes(product.mode)) throw new ApiClientError("INVALID_CONFIG");
    products.set(key, Object.freeze({ priceId: product.priceId, mode: product.mode, maxQuantity: boundedInteger(product.maxQuantity ?? 1, 1, 999) }));
  }
  const successUrl = returnUrl(options.successUrl);
  const cancelUrl = returnUrl(options.cancelUrl);
  const authorize = options.authorize;
  const getKey = options.getSecretKey;
  return Object.freeze({
    async createCheckoutSession(input: CreateCheckoutInput<Context>): Promise<CheckoutSession> {
      const productKey = boundedString(input.productKey, "product key", 100);
      const product = products.get(productKey);
      if (!product) throw new ApiClientError("INVALID_INPUT");
      const quantity = boundedInteger(input.quantity ?? 1, 1, product.maxQuantity);
      const referenceId = boundedString(input.referenceId, "reference", 200);
      const key = idempotencyKey(input.idempotencyKey);
      const purchase = Object.freeze({ productKey, quantity, referenceId });
      const context = input.context;
      const body = new URLSearchParams({
        mode: product.mode, "line_items[0][price]": product.priceId,
        "line_items[0][quantity]": String(quantity), success_url: successUrl,
        cancel_url: cancelUrl, client_reference_id: referenceId,
      }).toString();
      const http = createHttpClient({ ...options, origin: "https://api.stripe.com", headers: async signal => {
        if (await authorize(context, purchase, signal) !== true) throw new ApiClientError("DENIED");
        if (signal.aborted) throw new ApiClientError("ABORTED");
        return {
          authorization: `Bearer ${credential(await getKey(signal))}`,
          "stripe-version": apiVersion, "idempotency-key": key,
          "content-type": "application/x-www-form-urlencoded",
        };
      } });
      const response = requireRecord(await http.request("/v1/checkout/sessions", { method: "POST", body, signal: input.signal }));
      if (response.url !== null && typeof response.url !== "string") throw new ApiClientError("INVALID_RESPONSE");
      if (typeof response.url === "string") {
        try {
          const url = new URL(response.url);
          if (url.protocol !== "https:" || url.origin !== "https://checkout.stripe.com" || url.username || url.password) throw new Error();
        } catch { throw new ApiClientError("INVALID_RESPONSE"); }
      }
      return { id: requireString(response, "id"), url: response.url as string | null };
    },
  });
}
