// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { money, StorefrontError, type Cart, type Product, type StorefrontService } from './model.js';

export function ProductCard({ product, onAdd, disabled = false }: { product: Product; onAdd: (variantId: string) => Promise<void>; disabled?: boolean }) {
  const [variantId, setVariant] = useState(product.variants.find(variant => variant.price && variant.available !== false)?.id ?? '');
  const variant = product.variants.find(value => value.id === variantId);
  return <article className="genlib-product">{product.thumbnail && <img src={product.thumbnail} alt="" loading="lazy" />}
    <h2>{product.title}</h2><p>{product.description}</p>
    <label>Option <select value={variantId} onChange={event => setVariant(event.target.value)} disabled={disabled}>
      <option value="">Choose an option</option>{product.variants.map(item => <option key={item.id} value={item.id} disabled={item.available === false || !item.price}>{item.title}{item.available === false ? ' — unavailable' : ''}</option>)}
    </select></label><p>{variant?.price ? money(variant.price) : 'Choose an available option for its price.'}</p>
    <button type="button" disabled={disabled || !variant?.price || variant.available === false} onClick={() => { if (variant) void onAdd(variant.id); }}>Add to cart</button>
  </article>;
}

export function CartPanel({ cart, busy, onQuantity, onRemove, onCheckout }: { cart: Cart | null; busy: boolean;
  onQuantity: (id: string, quantity: number) => Promise<void>; onRemove: (id: string) => Promise<void>; onCheckout: () => void }) {
  const format = (amount: number) => money({ amount, currency: cart!.currency });
  return <section className="genlib-cart" aria-label="Shopping cart" aria-busy={busy}><h2>Your cart</h2>
    {!cart?.lines.length ? <p>Your cart is empty.</p> : <><ul>{cart.lines.map(line => <li key={line.id}><span>{line.title}</span>
      <label>Quantity <input type="number" min={1} max={999} value={line.quantity} disabled={busy} onChange={event => { const quantity = Number(event.target.value); if (Number.isInteger(quantity) && quantity > 0 && quantity <= 999) void onQuantity(line.id, quantity); }} /></label>
      <span>{format(line.total)}</span><button type="button" disabled={busy} onClick={() => { void onRemove(line.id); }}>Remove {line.title}</button></li>)}</ul>
      <dl><dt>Subtotal</dt><dd>{format(cart.subtotal)}</dd><dt>Tax</dt><dd>{format(cart.tax)}</dd><dt>Shipping</dt><dd>{format(cart.shipping)}</dd><dt>Discount</dt><dd>{format(cart.discount)}</dd><dt>Total</dt><dd>{format(cart.total)}</dd></dl>
      <button type="button" disabled={busy} onClick={onCheckout}>Continue to checkout</button></>}
  </section>;
}

export function Storefront({ service, regionId, initialCart = null, onCartId, onCheckout }: {
  service: StorefrontService; regionId: string; initialCart?: Cart | null; onCartId: (id: string) => void; onCheckout: (cart: Cart) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]), [count, setCount] = useState(0), [page, setPage] = useState(0), [search, setSearch] = useState(''), [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false), [cart, setCart] = useState(initialCart), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const currentCart = useRef(cart), mutating = useRef(false);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    service.products({ regionId, search, offset: page * 20, limit: 20 }, abort.signal).then(result => { if (!abort.signal.aborted) { setProducts(result.products); setCount(result.count); } })
      .catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load products.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [service, regionId, page, search]);
  const mutate = async (action: (cart: Cart) => Promise<Cart>) => {
    if (mutating.current || uncertain) return; mutating.current = true; setBusy(true); setError('');
    try {
      if (!currentCart.current) { currentCart.current = await service.createCart(regionId); setCart(currentCart.current); onCartId(currentCart.current.id); }
      const saved = await action(currentCart.current); currentCart.current = saved; setCart(saved);
    } catch (error) {
      if (error instanceof StorefrontError && error.uncertain) setUncertain(true);
      setError(error instanceof StorefrontError && error.uncertain ? 'The change may have been saved. Reload your cart before making another change.' : error instanceof Error ? error.message : 'Unable to update cart.');
    } finally { mutating.current = false; setBusy(false); }
  };
  return <div className="genlib-storefront">{error && <p role="alert">{error}</p>}
    {uncertain && currentCart.current && <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); try { const restored = await service.getCart(currentCart.current!.id); currentCart.current = restored; setCart(restored); setUncertain(false); setError(''); }
      catch (error) { setError(error instanceof Error ? error.message : 'Unable to reload cart.'); } finally { setBusy(false); }
    }}>Reload cart</button>}
    <form role="search" onSubmit={event => { event.preventDefault(); setSearch(draft); setPage(0); }}><label>Find products <input value={draft} onChange={event => setDraft(event.target.value)} /></label><button type="submit">Search</button></form>
    <section aria-label="Products" aria-busy={loading}><div className="genlib-product-grid">{products.map(product => <ProductCard key={product.id} product={product} disabled={busy || uncertain} onAdd={variant => mutate(cart => service.addItem(cart.id, variant, 1))} />)}</div>
      {loading && <p role="status">Loading products…</p>}{!loading && !products.length && <p>No products found.</p>}
      <nav aria-label="Product pages"><button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span> Page {page + 1} </span><button disabled={loading || (page + 1) * 20 >= count} onClick={() => setPage(value => value + 1)}>Next</button></nav>
    </section>
    <CartPanel cart={cart} busy={busy || uncertain} onQuantity={(item, quantity) => mutate(cart => service.updateItem(cart.id, item, quantity))} onRemove={item => mutate(cart => service.removeItem(cart.id, item))} onCheckout={() => { if (cart) onCheckout(cart); }} />
  </div>;
}
