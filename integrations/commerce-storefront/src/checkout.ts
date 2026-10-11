// SPDX-License-Identifier: Apache-2.0
import { StorefrontError, type Address, type Cart, type PaymentSession, type StorefrontService } from './model.js';

/** Reusable checkout controller. Keep one instance for a checkout session; no effects on construction. */
export function createCheckout(service: StorefrontService, cart: Cart) {
  let current = cart, pending = false, uncertain = false, completed = false, detailsReady = false, shippingReady = false;
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    if (pending) throw new Error('Checkout already has a pending operation.');
    if (completed) throw new Error('This order has already been placed.');
    if (uncertain) throw new StorefrontError('Check the cart/order status before resuming checkout.', null, true);
    pending = true;
    try { return await action(); }
    catch (error) { if (error instanceof StorefrontError && error.uncertain) uncertain = true; throw error; }
    finally { pending = false; }
  };
  return {
    getCart: () => current,
    async setDetails(details: { email: string; shippingAddress: Address }) {
      return exclusive(async () => { current = await service.setDetails(current.id, details); detailsReady = true; shippingReady = false; return { cart: current, shippingOptions: await service.shippingOptions(current.id) }; });
    },
    async chooseShipping(optionId: string) {
      return exclusive(async () => { if (!detailsReady) throw new Error('Save delivery details first.'); current = await service.setShipping(current.id, optionId); shippingReady = true; return current; });
    },
    /** Call after the customer reviews the latest total and deliberately confirms the order. */
    async placeOrder(providerId: string, authorizePayment: (session: PaymentSession, cart: Cart) => Promise<void>) {
      return exclusive(async () => {
        if (!detailsReady || !shippingReady || !current.lines.length) throw new Error('Complete delivery details and shipping selection first.');
        const session = await service.createPaymentSession(current.id, providerId);
        try { await authorizePayment(session, current); }
        catch { uncertain = true; throw new StorefrontError('Payment outcome needs confirmation before checkout continues.', null, true); }
        const result = await service.completeCart(current.id);
        if (result.type === 'cart') { current = result.cart; shippingReady = false; }
        else completed = true;
        return result;
      });
    },
    /** Host must resolve any uncertain payment/order outcome before constructing a new controller. */
    isUncertain: () => uncertain,
  };
}
