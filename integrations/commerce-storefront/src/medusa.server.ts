// SPDX-License-Identifier: Apache-2.0
import { StorefrontError, validateAddress, validateQuantity, type Address, type Cart, type Product, type StorefrontService } from './model.js';

type ObjectValue = Record<string, unknown>;
function record(value: unknown): ObjectValue { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Medusa response.'); return value as ObjectValue; }
function text(value: unknown): string { if (typeof value !== 'string' || !value) throw new Error('Missing Medusa response field.'); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid Medusa amount or count.'); return value; }
function items(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('Missing Medusa collection.'); return value; }
function id(value: string): string { if (!/^[a-zA-Z0-9_-]{1,200}$/u.test(value)) throw new Error('Invalid resource identifier.'); return value; }
function imageUrl(value: unknown): string | null { if (typeof value !== 'string') return null; try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }

export function parseProduct(value: unknown): Product {
  const product = record(value);
  return { id: text(product.id), title: text(product.title), description: typeof product.description === 'string' ? product.description : '', thumbnail: imageUrl(product.thumbnail),
    variants: items(product.variants ?? []).map(value => {
      const variant = record(value), calculated = variant.calculated_price ? record(variant.calculated_price) : null;
      return { id: text(variant.id), title: typeof variant.title === 'string' ? variant.title : 'Standard',
        price: calculated && calculated.calculated_amount != null ? { amount: number(calculated.calculated_amount), currency: text(calculated.currency_code) } : null,
        available: variant.allow_backorder === true || variant.manage_inventory === false ? true : typeof variant.inventory_quantity === 'number' ? variant.inventory_quantity > 0 : undefined };
    }) };
}
export function parseCart(value: unknown): Cart {
  const cart = record(value);
  return { id: text(cart.id), regionId: text(cart.region_id), currency: text(cart.currency_code), email: typeof cart.email === 'string' ? cart.email : undefined,
    paymentCollectionId: cart.payment_collection ? text(record(cart.payment_collection).id) : undefined,
    lines: items(cart.items).map(value => { const line = record(value), quantity = number(line.quantity); validateQuantity(quantity);
      return { id: text(line.id), variantId: text(line.variant_id), title: text(line.title), quantity, unitPrice: number(line.unit_price), total: number(line.total) }; }),
    subtotal: number(cart.subtotal), tax: number(cart.tax_total), shipping: number(cart.shipping_total), discount: number(cart.discount_total), total: number(cart.total) };
}
function cartResponse(value: unknown, mutation: boolean): Cart {
  try { return parseCart(value); }
  catch { throw new StorefrontError('The store returned an invalid cart. Reload it before continuing.', null, mutation); }
}

/** Trusted server adapter. Use your authenticated routes/server actions to expose the narrow service to a browser. */
export function createMedusaStorefront(options: {
  baseUrl: string; publishableApiKey: string; allowedPaymentProviderIds: readonly string[]; getCustomerToken?: () => Promise<string | undefined>;
  authorize: (context: { action: 'catalog' | 'cart:create' | 'cart:read' | 'cart:write' | 'checkout'; cartId?: string }) => Promise<boolean>;
  fetch?: typeof fetch; timeoutMs?: number; allowLocalHttp?: boolean;
}): StorefrontService {
  const base = new URL(options.baseUrl), local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || !(base.protocol === 'https:' || (options.allowLocalHttp && local && base.protocol === 'http:'))) throw new Error('Use a trusted Medusa HTTPS origin.');
  if (!options.publishableApiKey || /[\r\n]/u.test(options.publishableApiKey)) throw new Error('Supply a publishable API key.');
  const timeout = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120_000) throw new Error('Invalid Medusa request timeout.');
  const request = async (path: string, context: Parameters<typeof options.authorize>[0], method = 'GET', body?: unknown, signal?: AbortSignal): Promise<ObjectValue> => {
    if (!await options.authorize(context)) throw new StorefrontError('This cart operation is not permitted.', 403);
    const token = await options.getCustomerToken?.();
    const headers: Record<string, string> = { Accept: 'application/json', 'x-publishable-api-key': options.publishableApiKey };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try { response = await (options.fetch ?? fetch)(new URL(path, base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) }); }
    catch { throw new StorefrontError(method === 'GET' ? 'Unable to reach the store.' : 'The store response was not received. Check the cart or order status before retrying.', null, method !== 'GET'); }
    if (!response.ok) { await response.body?.cancel(); throw new StorefrontError(`The store could not complete this request (${response.status}).`, response.status, method !== 'GET' && response.status >= 500); }
    const reader = response.body?.getReader(); if (!reader) throw new StorefrontError('The store returned an empty response.', response.status, method !== 'GET');
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 2_097_152) throw new Error('Response too large.'); chunks.push(chunk.value); }
      const bytes = new Uint8Array(size); let position = 0; for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
      return record(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { await reader.cancel(); throw new StorefrontError('The store returned an invalid response.', response.status, method !== 'GET'); }
    finally { reader.releaseLock(); }
  };
  const cartRequest = async (cartId: string, suffix = '', method = 'GET', body?: unknown) => cartResponse((await request(`/store/carts/${id(cartId)}${suffix}`, { action: method === 'GET' ? 'cart:read' : 'cart:write', cartId }, method, body)).cart, method !== 'GET');
  return {
    async products(query, signal) {
      const offset = query.offset ?? 0, limit = query.limit ?? 20;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid product pagination.');
      const params = new URLSearchParams({ region_id: id(query.regionId), offset: String(offset), limit: String(limit), fields: '*variants.calculated_price,+variants.inventory_quantity' });
      if (query.search) params.set('q', query.search.slice(0, 200));
      const result = await request(`/store/products?${params}`, { action: 'catalog' }, 'GET', undefined, signal);
      return { products: items(result.products).map(parseProduct), count: number(result.count) };
    },
    async createCart(regionId) { return cartResponse((await request('/store/carts', { action: 'cart:create' }, 'POST', { region_id: id(regionId) })).cart, true); },
    getCart: cartId => cartRequest(cartId),
    async addItem(cartId, variantId, quantity) { validateQuantity(quantity); return cartRequest(cartId, '/line-items', 'POST', { variant_id: id(variantId), quantity }); },
    async updateItem(cartId, itemId, quantity) { validateQuantity(quantity); return cartRequest(cartId, `/line-items/${id(itemId)}`, 'POST', { quantity }); },
    async removeItem(cartId, itemId) {
      const result = await request(`/store/carts/${id(cartId)}/line-items/${id(itemId)}`, { action: 'cart:write', cartId }, 'DELETE');
      return cartResponse(result.parent ?? result.cart, true);
    },
    async setDetails(cartId, details: { email: string; shippingAddress: Address }) {
      validateAddress(details.shippingAddress);
      if (details.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(details.email)) throw new Error('Enter an email address.');
      return cartRequest(cartId, '', 'POST', { email: details.email, shipping_address: { ...details.shippingAddress, country_code: details.shippingAddress.country_code.toLowerCase() } });
    },
    async shippingOptions(cartId) {
      const result = await request(`/store/shipping-options?${new URLSearchParams({ cart_id: id(cartId) })}`, { action: 'cart:read', cartId });
      return items(result.shipping_options).map(value => { const option = record(value); return { id: text(option.id), name: text(option.name), amount: option.amount == null ? null : number(option.amount) }; });
    },
    setShipping: (cartId, optionId) => cartRequest(cartId, '/shipping-methods', 'POST', { option_id: id(optionId) }),
    async createPaymentSession(cartId, providerId) {
      if (!options.allowedPaymentProviderIds.includes(providerId)) throw new StorefrontError('This payment provider is not enabled.', 403);
      try {
      let collectionId = (await cartRequest(cartId)).paymentCollectionId;
      if (!collectionId) {
        const result = await request('/store/payment-collections', { action: 'checkout', cartId }, 'POST', { cart_id: id(cartId) });
        collectionId = text(record(result.payment_collection).id);
      }
      const prepared = await request(`/store/payment-collections/${id(collectionId)}/payment-sessions`, { action: 'checkout', cartId }, 'POST', { provider_id: id(providerId) });
      const sessions = items(record(prepared.payment_collection).payment_sessions).map(record);
      const session = sessions.find(value => value.provider_id === providerId); if (!session) throw new StorefrontError('The payment provider did not create a session.', null, true);
      return { id: text(session.id), providerId, status: text(session.status), data: record(session.data ?? {}) };
      } catch (error) { if (error instanceof StorefrontError) throw error; throw new StorefrontError('Payment session status is uncertain.', null, true); }
    },
    async completeCart(cartId) {
      const result = await request(`/store/carts/${id(cartId)}/complete`, { action: 'checkout', cartId }, 'POST', {});
      if (result.type === 'order') {
        try { return { type: 'order', orderId: text(record(result.order).id) }; }
        catch { throw new StorefrontError('Order status is unknown. Check it before trying again.', null, true); }
      }
      if (result.type === 'cart') return { type: 'cart', cart: cartResponse(result.cart, true), message: 'The order could not be completed. Review payment and delivery details.' };
      throw new StorefrontError('Order status is unknown. Check it before trying again.', null, true);
    },
  };
}
