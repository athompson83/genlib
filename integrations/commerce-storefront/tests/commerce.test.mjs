import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMedusaStorefront, parseCart } from '../.build/medusa.server.js';
import { createCheckout } from '../.build/checkout.js';
import { money, StorefrontError } from '../.build/model.js';
import { ProductCard, CartPanel } from '../.build/Storefront.js';
import { CheckoutPanel } from '../.build/CheckoutPanel.js';
const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const rawCart = await fixture('cart'), rawProducts = await fixture('products');
const config = { baseUrl: 'https://store.example.test', publishableApiKey: 'pk_test_fixture', allowedPaymentProviderIds: ['pp_test'], authorize: async () => true };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('Medusa core adapter sends regional pricing query and preserves v2 major currency units', async () => {
  let request;
  const service = createMedusaStorefront({ ...config, getCustomerToken: async () => 'customer-token-fixture', fetch: async (url, init) => { request = { url, ...init }; return json(rawProducts); } });
  const result = await service.products({ regionId: 'reg_us', search: 'notebook', limit: 20 });
  assert.equal(request.url.searchParams.get('region_id'), 'reg_us'); assert.equal(request.url.searchParams.get('fields'), '*variants.calculated_price,+variants.inventory_quantity');
  assert.equal(request.headers.Authorization, 'Bearer customer-token-fixture'); assert.equal(request.redirect, 'error');
  assert.equal(money(result.products[0].variants[0].price), '$12.50'); assert.equal(result.products[0].variants[1].available, false);
  const html = renderToStaticMarkup(React.createElement(ProductCard, { product: result.products[0], onAdd: async () => {} }));
  assert.match(html, /\$12\.50/); assert.match(html, /Add to cart/);
});

test('cart authorization runs before credential access or a network request', async () => {
  let credentials = 0, requests = 0;
  const service = createMedusaStorefront({ ...config, authorize: async () => false, getCustomerToken: async () => { credentials++; return ''; }, fetch: async () => { requests++; return json({ cart: rawCart }); } });
  await assert.rejects(service.getCart('cart_other'), error => error instanceof StorefrontError && error.status === 403);
  assert.equal(credentials, 0); assert.equal(requests, 0);
  await assert.rejects(service.addItem('cart_100', 'variant_blue', 0));
});

test('cart mutation routes use item identifiers and deletion parent response; totals come from server', async () => {
  const calls = [];
  const service = createMedusaStorefront({ ...config, fetch: async (url, init) => { calls.push({ url, ...init }); return json(init.method === 'DELETE' ? { parent: rawCart } : { cart: rawCart }); } });
  const cart = await service.updateItem('cart_100', 'item_100', 2); assert.equal(cart.total, 32);
  assert.equal(calls[0].url.pathname, '/store/carts/cart_100/line-items/item_100'); assert.equal(JSON.parse(calls[0].body).quantity, 2);
  await service.removeItem('cart_100', 'item_100'); assert.equal(calls[1].method, 'DELETE');
  const html = renderToStaticMarkup(React.createElement(CartPanel, { cart, busy: false, onQuantity: async () => {}, onRemove: async () => {}, onCheckout() {} }));
  assert.match(html, /\$32\.00/); assert.match(html, /Continue to checkout/);
});

test('lost or malformed mutation responses remain uncertain and are never automatically retried', async () => {
  let calls = 0;
  const service = createMedusaStorefront({ ...config, fetch: async () => { calls++; throw new Error('Connection reset'); } });
  await assert.rejects(service.addItem('cart_100', 'variant_blue', 1), error => error.uncertain === true); assert.equal(calls, 1);
  const malformed = createMedusaStorefront({ ...config, fetch: async () => json({ cart: {} }) });
  await assert.rejects(malformed.addItem('cart_100', 'variant_blue', 1), error => error.uncertain === true);
});

test('payment sessions reuse an existing collection and only configured providers can be used', async () => {
  const paths = [];
  const service = createMedusaStorefront({ ...config, fetch: async (url, init) => { paths.push(url.pathname); return json(init.method === 'GET' ? { cart: rawCart } : { payment_collection: { payment_sessions: [{ id: 'payses_100', provider_id: 'pp_test', status: 'pending', data: { test: true } }] } }); } });
  const session = await service.createPaymentSession('cart_100', 'pp_test'); assert.equal(session.id, 'payses_100');
  assert.deepEqual(paths, ['/store/carts/cart_100', '/store/payment-collections/paycol_100/payment-sessions']);
  await assert.rejects(service.createPaymentSession('cart_100', 'pp_disabled'), error => error.status === 403);
});

test('checkout requires reviewed shipping, coordinates explicit payment, and prevents duplicate completion', async () => {
  const cart = parseCart(rawCart), calls = [];
  const service = { async setDetails() { calls.push('details'); return cart; }, async shippingOptions() { return [{ id: 'ship_1', name: 'Standard', amount: 5 }]; },
    async setShipping() { calls.push('shipping'); return cart; }, async createPaymentSession() { calls.push('session'); return { id: 'session', providerId: 'pp_test', status: 'pending', data: {} }; },
    async completeCart() { calls.push('complete'); return { type: 'order', orderId: 'order_100' }; } };
  const checkout = createCheckout(service, cart);
  await assert.rejects(checkout.placeOrder('pp_test', async () => {}), /delivery/);
  await checkout.setDetails({ email: 'sam@example.test', shippingAddress: {} }); await checkout.chooseShipping('ship_1');
  const result = await checkout.placeOrder('pp_test', async () => { calls.push('authorize'); }); assert.equal(result.orderId, 'order_100');
  assert.deepEqual(calls, ['details', 'shipping', 'session', 'authorize', 'complete']);
  await assert.rejects(checkout.placeOrder('pp_test', async () => {}), /already been placed/);
  const html = renderToStaticMarkup(React.createElement(CheckoutPanel, { service, initialCart: cart, countries: [{ code: 'us', label: 'United States' }], paymentProviders: [{ id: 'pp_test', label: 'Test provider' }], authorizePayment: async () => {}, onOrder() {} }));
  assert.match(html, /Update delivery details/); assert.doesNotMatch(html, /Pay and place order/);
});

test('uncertain provider outcome blocks order completion and another attempt', async () => {
  const cart = parseCart(rawCart); let completed = 0;
  const service = { setDetails: async () => cart, shippingOptions: async () => [], setShipping: async () => cart, createPaymentSession: async () => ({ id: 'session', providerId: 'pp_test', status: 'pending', data: {} }), completeCart: async () => { completed++; return { type: 'order', orderId: 'order' }; } };
  const checkout = createCheckout(service, cart); await checkout.setDetails({ email: 'sam@example.test', shippingAddress: {} }); await checkout.chooseShipping('ship_1');
  await assert.rejects(checkout.placeOrder('pp_test', async () => { throw new Error('Network failure'); }), error => error.uncertain === true);
  assert.equal(completed, 0); assert.equal(checkout.isUncertain(), true);
  await assert.rejects(checkout.placeOrder('pp_test', async () => {}), error => error.uncertain === true);
});
