/** Invoice preview math only. Legal/tax compliance and invoice numbering are application responsibilities. */
export interface InvoiceLine { description: string; quantity: number; unitMinor: number }
export function invoiceTotals(lines: readonly InvoiceLine[], taxBasisPoints = 0): { subtotalMinor: number; taxMinor: number; totalMinor: number } {
  if (!Number.isSafeInteger(taxBasisPoints) || taxBasisPoints < 0 || taxBasisPoints > 10000) throw new Error("Invalid tax rate");
  let subtotalMinor = 0;
  for (const line of lines) {
    if (!line.description.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
      !Number.isSafeInteger(line.unitMinor) || line.unitMinor < 0) throw new Error("Invalid invoice line");
    const amount = line.quantity * line.unitMinor;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(subtotalMinor + amount)) throw new Error("Amount overflow");
    subtotalMinor += amount;
  }
  // Exact half-up rounding in bigint: subtotal * basis points can exceed 2^53 before the division.
  const taxMinor = Number((BigInt(subtotalMinor) * BigInt(taxBasisPoints) + 5000n) / 10000n);
  const totalMinor = subtotalMinor + taxMinor;
  if (!Number.isSafeInteger(taxMinor) || !Number.isSafeInteger(totalMinor)) throw new Error("Amount overflow");
  return { subtotalMinor, taxMinor, totalMinor };
}
