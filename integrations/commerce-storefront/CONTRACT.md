# Medusa core storefront

Original Apache-2.0 source implements an editable product/cart UI and explicit checkout around the Medusa Store API. The profile uses **Medusa MIT core only**. Its original HTTP adapter does not vendor Medusa or require the full Medusa server/SDK in the browser.

## Install and runtime

```sh
npm ci --ignore-scripts
npm test
```

Run in this directory. Local verification used Node 24.19.0 and React/ReactDOM 19.3.0. React 18.3 and 19 fit declared peers; only 19 was executed. The lock is for build/test dependencies; React remains an application peer. Import `src/styles.css` and customize the pack's tokens/classes, labels, locale, country/provider choices and navigation callbacks. Keep `medusa.server.ts` on the trusted server and React UI entrypoints in the client boundary.

## Server service contract

`createMedusaStorefront` returns the narrow `StorefrontService` used by the UI. Configure a trusted HTTPS origin, publishable API key, optional refreshed customer-token callback, **required authorization callback**, and an explicit payment-provider allowlist. Only explicit localhost development may use HTTP. Authorization runs before credentials and network requests for every operation; it receives action and cart ID. Supply an authenticated route/server-action bridge with tenant/customer/cart ownership checks, request validation and CSRF protection where applicable. Do not pass the server object or token callback into a browser bundle.

The adapter uses fixed Store API routes, validated identifiers, bounded pagination/search, timeouts, response limits and redirect rejection. It does not expose admin endpoints. Product queries request regional calculated prices and inventory fields. **Medusa v2 prices are major units:** an amount of `12.5` displays as 12.50 in a two-decimal currency and must not be divided by 100. Inventory availability remains unknown when the response lacks a quantity; the backend decides whether adding/ordering succeeds. See [product listing](https://docs.medusajs.com/resources/storefront-development/products/list), [inventory fields](https://docs.medusajs.com/resources/storefront-development/products/inventory) and [Medusa price units](https://docs.medusajs.com/resources/lint/rules/prices-in-major-units).

Cart operations create/read carts, add/update/remove line items, save contact/address details, select a server-provided shipping option, create a payment session and complete a cart. Totals come from the backend; local arithmetic does not decide tax, shipping, discounts or inventory. Removal uses line-item identity and the returned parent cart. Existing payment collections are reused. The receiving server must associate a newly created guest cart with the authenticated guest session before later ownership checks succeed.

## Components and checkout

`ProductCard` provides variant selection and an add action. `CartPanel` renders quantities, removal and authoritative totals. `Storefront` supplies search/pagination, superseded-request cancellation, serialized cart mutations and callbacks for persisting the cart ID and opening checkout. Supply `initialCart` from application session state. Remount/key these stateful components when tenant, customer or region changes; changing a prop is not a cart migration policy.

`createCheckout` is a reusable controller. It requires delivery details, a successful shipping selection, review of the resulting cart total and an explicit `placeOrder` action. `CheckoutPanel` renders that flow with contact/address fields, server shipping options and a payment-provider selector. Supply the allowed countries/providers, `authorizePayment(session, cart)` and `onOrder(orderId)`. The payment callback must execute the selected provider's real authorized SDK/challenge flow; a no-op callback is not a working checkout. See [Medusa checkout](https://docs.medusajs.com/resources/storefront-development/guides/express-checkout).

Only a deliberate order action creates a payment session, invokes payment authorization and completes the cart. Completion is serialized and cannot repeat after a successful order. A returned incomplete cart is shown for review. Lost/invalid mutation responses, server failures or an uncertain payment callback outcome block automatic retry: reload/reconcile cart and provider/order status in the host before creating another controller. Retrying a payment blindly can duplicate effects. No real purchase, session or outbound message is used as a test.

## Verification and adoption limits

This pack is **experimental for live Medusa/payment acceptance**. Seven tests use deterministic HTTP fixtures and real React server rendering to check regional major-unit prices, authorization before credentials, exact cart routes, response uncertainty, payment collection reuse, explicit checkout ordering and duplicate/unknown-outcome prevention. No live Medusa backend, payment SDK challenge, purchase, refund, customer email or stock-concurrency scenario was run. Run these application profiles using disposable authorized test accounts/providers before launch; server fixture success does not establish checkout acceptance.

The original adapters/styles are Apache-2.0. React retains MIT terms. The [Medusa license](https://github.com/medusajs/medusa/blob/develop/LICENSE) distinguishes MIT core from Enterprise Edition; the resource binding and recipe cover core. Enterprise features, Medusa Cloud, provider SDKs/services, storefront images and other assets retain independent terms. Review Store API changes and response fixtures when updating the backend version. The profile does not decide tax/legal policy or payment-provider compliance.
