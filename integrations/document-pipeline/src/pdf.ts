// SPDX-License-Identifier: Apache-2.0
import { generate } from '@pdfme/generator';
import { checkTemplate, type Template, type Plugins, type Font } from '@pdfme/common';
import { text, table } from '@pdfme/schemas';
import { invoiceView, type InvoiceDocument } from './invoice.js';

export const invoicePlugins: Plugins = { text, table };
export function createInvoiceTemplate(): Template {
  const field = (name: string, y: number, height: number, fontSize = 12) => ({ ...structuredClone(text.propPanel.defaultSchema), name, type: 'text', position: { x: 15, y }, width: 180, height, fontSize });
  return { basePdf: { width: 210, height: 297, padding: [15, 15, 15, 15] }, schemas: [[
    field('heading', 18, 12, 22), field('parties', 34, 28),
    { ...structuredClone(table.propPanel.defaultSchema), name: 'lines', type: 'table', position: { x: 15, y: 67 }, width: 180, height: 45,
      head: ['Item', 'Quantity', 'Unit price', 'Line total'], headWidthPercentages: [45, 10, 22.5, 22.5] },
    field('totals', 120, 34),
  ]] };
}

export async function generateInvoicePdf(invoice: InvoiceDocument, options: { template?: Template; plugins?: Plugins; font?: Font; locale?: string } = {}): Promise<Uint8Array> {
  const view = invoiceView(invoice, options.locale), template = options.template ?? createInvoiceTemplate();
  checkTemplate(template);
  return generate({ template, plugins: options.plugins ?? invoicePlugins, options: options.font ? { font: options.font } : undefined,
    inputs: [{ heading: `Invoice ${view.id}`, parties: `${view.seller}\nBill to: ${view.customer}\nIssued: ${view.issuedOn}`,
      lines: JSON.stringify(view.lines.map(line => [line.description, String(line.quantity), line.unit, line.total])),
      totals: `Subtotal: ${view.subtotal}\nTax: ${view.tax}    Shipping: ${view.shipping}    Discount: ${view.discount}\nTotal: ${view.total}` }] });
}
