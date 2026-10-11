// SPDX-License-Identifier: Apache-2.0
/** Medusa v2 monetary values are major currency units. These types deliberately do not call them cents. */
export interface Price { amount: number; currency: string }
export interface ProductVariant { id: string; title: string; price: Price | null; available?: boolean }
export interface Product { id: string; title: string; description: string; thumbnail: string | null; variants: ProductVariant[] }
export interface CartLine { id: string; variantId: string; title: string; quantity: number; unitPrice: number; total: number }
export interface Cart { id: string; regionId: string; currency: string; email?: string; paymentCollectionId?: string; lines: CartLine[]; subtotal: number; tax: number; shipping: number; discount: number; total: number }
export interface Address { first_name: string; last_name: string; address_1: string; city: string; postal_code: string; country_code: string; province?: string; phone?: string }
export interface ShippingOption { id: string; name: string; amount: number | null }
export interface PaymentSession { id: string; providerId: string; status: string; data: Record<string, unknown> }
export type CheckoutResult = { type: 'order'; orderId: string } | { type: 'cart'; cart: Cart; message: string };
export interface StorefrontService {
  products(query: { regionId: string; search?: string; offset?: number; limit?: number }, signal?: AbortSignal): Promise<{ products: Product[]; count: number }>;
  createCart(regionId: string): Promise<Cart>;
  getCart(id: string): Promise<Cart>;
  addItem(cartId: string, variantId: string, quantity: number): Promise<Cart>;
  updateItem(cartId: string, itemId: string, quantity: number): Promise<Cart>;
  removeItem(cartId: string, itemId: string): Promise<Cart>;
  setDetails(cartId: string, details: { email: string; shippingAddress: Address }): Promise<Cart>;
  shippingOptions(cartId: string): Promise<ShippingOption[]>;
  setShipping(cartId: string, optionId: string): Promise<Cart>;
  createPaymentSession(cartId: string, providerId: string): Promise<PaymentSession>;
  completeCart(cartId: string): Promise<CheckoutResult>;
}
export class StorefrontError extends Error {
  override name = 'StorefrontError';
  readonly status: number | null;
  readonly uncertain: boolean;
  constructor(message: string, status: number | null, uncertain = false) { super(message); this.status = status; this.uncertain = uncertain; }
}
export function money(price: Price, locale = 'en-US'): string {
  if (!Number.isFinite(price.amount) || !/^[a-z]{3}$/iu.test(price.currency)) throw new Error('Invalid price.');
  return new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency.toUpperCase() }).format(price.amount);
}
export function validateAddress(address: Address): void {
  for (const key of ['first_name', 'last_name', 'address_1', 'city', 'postal_code'] as const) if (!address[key]?.trim() || address[key].length > 200) throw new Error('Complete the shipping address.');
  if (!/^[a-z]{2}$/iu.test(address.country_code)) throw new Error('Use a two-letter country code.');
}
export function validateQuantity(quantity: number): void { if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Quantity must be between 1 and 999.'); }
