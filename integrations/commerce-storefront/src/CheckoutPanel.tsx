// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { createCheckout } from './checkout.js';
import { money, type Address, type Cart, type PaymentSession, type ShippingOption, type StorefrontService } from './model.js';

export function CheckoutPanel({ service, initialCart, countries, paymentProviders, authorizePayment, onOrder }: {
  service: StorefrontService; initialCart: Cart; countries: { code: string; label: string }[];
  paymentProviders: { id: string; label: string }[];
  /** Mount/confirm the selected provider's authorized SDK flow, including any customer challenge. */
  authorizePayment: (session: PaymentSession, cart: Cart) => Promise<void>;
  onOrder: (orderId: string) => void;
}) {
  const [checkout] = useState(() => createCheckout(service, initialCart));
  const [cart, setCart] = useState(initialCart), [shipping, setShipping] = useState<ShippingOption[]>([]), [selectedShipping, setSelectedShipping] = useState('');
  const [provider, setProvider] = useState(paymentProviders[0]?.id ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to continue checkout.'); } finally { setBusy(false); } };
  return <section className="genlib-checkout" aria-label="Checkout" aria-busy={busy}><h2>Delivery and payment</h2>
    {error && <p role="alert">{error}</p>}
    <form onChange={() => { setReady(false); setSelectedShipping(''); }} onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const field = (name: string) => String(data.get(name) ?? '');
      const shippingAddress: Address = { first_name: field('first_name'), last_name: field('last_name'), address_1: field('address_1'), city: field('city'), postal_code: field('postal_code'), country_code: field('country_code'), province: field('province') };
      void run(async () => { const result = await checkout.setDetails({ email: field('email'), shippingAddress }); setCart(result.cart); setShipping(result.shippingOptions); setReady(true); });
    }}><fieldset disabled={busy || checkout.isUncertain()}><legend>Contact and address</legend>
      <label>Email <input name="email" type="email" autoComplete="email" defaultValue={cart.email} required /></label>
      {([['first_name', 'First name', 'given-name'], ['last_name', 'Last name', 'family-name'], ['address_1', 'Street address', 'address-line1'], ['city', 'City', 'address-level2'], ['postal_code', 'Postal code', 'postal-code']] as const).map(([name, label, complete]) => <label key={name}>{label}<input name={name} autoComplete={complete} required maxLength={200} /></label>)}
      <label>State or province <input name="province" autoComplete="address-level1" maxLength={200} /></label>
      <label>Country <select name="country_code" autoComplete="country" required>{countries.map(country => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
      <button type="submit">Update delivery details</button>
    </fieldset></form>
    {ready && <fieldset disabled={busy || checkout.isUncertain()}><legend>Shipping method</legend>{shipping.map(option => <label key={option.id}>
      <input type="radio" name="shipping-option" checked={selectedShipping === option.id} onChange={() => { void run(async () => { setCart(await checkout.chooseShipping(option.id)); setSelectedShipping(option.id); }); }} />
      {option.name}{option.amount === null ? '' : ` — ${money({ amount: option.amount, currency: cart.currency })}`}</label>)}</fieldset>}
    {selectedShipping && <><p>Total: <strong>{money({ amount: cart.total, currency: cart.currency })}</strong></p>
      <label>Payment method <select disabled={busy || checkout.isUncertain()} value={provider} onChange={event => setProvider(event.target.value)}>{paymentProviders.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button type="button" disabled={busy || !provider || checkout.isUncertain()} onClick={() => { void run(async () => {
        const result = await checkout.placeOrder(provider, authorizePayment);
        if (result.type === 'order') onOrder(result.orderId);
        else { setCart(result.cart); setSelectedShipping(''); setError(result.message); }
      }); }}>Pay and place order</button></>}
  </section>;
}
