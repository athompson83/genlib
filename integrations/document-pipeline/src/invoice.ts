// SPDX-License-Identifier: Apache-2.0
export interface InvoiceLine { id: string; description: string; quantity: number; unitMinor: number }
export interface InvoiceDocument {
  id: string; issuedOn: string; seller: string; customer: string;
  currency: string; minorDigits: 0 | 2 | 3; lines: InvoiceLine[];
  taxMinor: number; shippingMinor: number; discountMinor: number; totalMinor: number;
}
function moneyInteger(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Amounts must be nonnegative safe integers in minor units.'); }
export function validateInvoice(invoice: InvoiceDocument): void {
  if (!invoice.id || invoice.id.length > 200 || /[\u0000-\u001f]/u.test(invoice.id) || !invoice.seller || invoice.seller.length > 2_000 ||
      !invoice.customer || invoice.customer.length > 2_000 || !/^[A-Z]{3}$/u.test(invoice.currency) || ![0, 2, 3].includes(invoice.minorDigits)) throw new Error('Invalid invoice identity or currency.');
  const date = new Date(`${invoice.issuedOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(invoice.issuedOn) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== invoice.issuedOn) throw new Error('Invalid invoice date.');
  if (!invoice.lines.length || invoice.lines.length > 200) throw new Error('Invoice must contain 1–200 lines.');
  const ids = new Set<string>(); let subtotal = 0;
  for (const line of invoice.lines) {
    if (!line.id || ids.has(line.id) || !line.description || line.description.length > 1_000 || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error('Invalid invoice line.');
    ids.add(line.id); moneyInteger(line.unitMinor); moneyInteger(line.quantity * line.unitMinor); subtotal += line.quantity * line.unitMinor;
  }
  for (const amount of [subtotal, invoice.taxMinor, invoice.shippingMinor, invoice.discountMinor, invoice.totalMinor]) moneyInteger(amount);
  const expected = subtotal + invoice.taxMinor + invoice.shippingMinor - invoice.discountMinor;
  if (!Number.isSafeInteger(expected) || expected !== invoice.totalMinor) throw new Error('Invoice totals are inconsistent.');
}
export function formatMinor(amount: number, currency: string, digits: number, locale = 'en-US'): string {
  moneyInteger(amount); return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount / 10 ** digits);
}
export function invoiceView(invoice: InvoiceDocument, locale = 'en-US') {
  validateInvoice(invoice);
  const format = (amount: number) => formatMinor(amount, invoice.currency, invoice.minorDigits, locale);
  return { id: invoice.id, issuedOn: invoice.issuedOn, seller: invoice.seller, customer: invoice.customer,
    lines: invoice.lines.map(line => ({ ...line, unit: format(line.unitMinor), total: format(line.quantity * line.unitMinor) })),
    subtotal: format(invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitMinor, 0)),
    tax: format(invoice.taxMinor), shipping: format(invoice.shippingMinor), discount: format(invoice.discountMinor), total: format(invoice.totalMinor) };
}
