/** Pure cart model. Server must reprice and revalidate inventory before checkout. */
export type CartLine = Readonly<{ productId: string; variantId: string; quantity: number }>;
export type PricedLine = CartLine & Readonly<{ unitMinor: number; currency: string }>;
const validId = (v: string): boolean => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
export function updateCart(lines: readonly CartLine[], productId: string, variantId: string, quantity: number, maxQuantity = 99): CartLine[] {
  if (!validId(productId) || !validId(variantId)) throw new Error("Invalid identifier");
  if (!Number.isSafeInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 10000) throw new Error("Invalid limit");
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > maxQuantity) throw new Error("Invalid quantity");
  const key = (line: CartLine) => line.productId === productId && line.variantId === variantId;
  const result = lines.filter(line => !key(line));
  if (quantity) result.push({ productId, variantId, quantity });
  return result;
}
export function cartSubtotal(lines: readonly PricedLine[]): { minor: number; currency: string } {
  const [first] = lines;
  if (!first) return { minor: 0, currency: "" };
  const currency = first.currency;
  let minor = 0;
  for (const line of lines) {
    if (!/^[A-Z]{3}$/.test(line.currency) || line.currency !== currency) throw new Error("Currency mismatch");
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitMinor) || line.unitMinor < 0) throw new Error("Invalid amount");
    const amount = line.quantity * line.unitMinor;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(minor + amount)) throw new Error("Amount overflow");
    minor += amount;
  }
  return { minor, currency };
}
