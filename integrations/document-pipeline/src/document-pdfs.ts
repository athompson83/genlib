// SPDX-License-Identifier: Apache-2.0
import { generate } from '@pdfme/generator';
import { checkTemplate, type Template, type Plugins, type Font } from '@pdfme/common';
import { text, table } from '@pdfme/schemas';
import { invoicePlugins } from './pdf.js';
import { estimateView, receiptView, packingSlipView, reportView, validateReportColumns,
  type EstimateDocument, type ReceiptDocument, type PackingSlipDocument, type ReportDocument, type ReportColumn } from './documents.js';

export interface DocumentBranding { accentColor?: string; textColor?: string; fontName?: string }
export interface DocumentPdfOptions { template?: Template; plugins?: Plugins; font?: Font; locale?: string; branding?: DocumentBranding }

function brand(input: DocumentBranding) {
  const accentColor = input.accentColor ?? '#174b8f', textColor = input.textColor ?? '#17212b';
  if (![accentColor, textColor].every(color => /^#[0-9a-f]{6}$/iu.test(color)) ||
      (input.fontName !== undefined && (!input.fontName || input.fontName.length > 200))) throw new Error('Invalid document branding.');
  return { accentColor, textColor, fontName: input.fontName };
}
function field(name: string, y: number, height: number, branding: DocumentBranding, size = 11) {
  const style = brand(branding), defaults = structuredClone(text.propPanel.defaultSchema);
  return { ...defaults, name, type: 'text', position: { x: 15, y }, width: 180, height, fontSize: size,
    fontColor: size > 16 ? style.accentColor : style.textColor, ...(style.fontName ? { fontName: style.fontName } : {}) };
}
function grid(name: string, y: number, headers: string[], widths: number[], branding: DocumentBranding) {
  const style = brand(branding), defaults = structuredClone(table.propPanel.defaultSchema);
  return { ...defaults, name, type: 'table', position: { x: 15, y }, width: 180, height: 35,
    showHead: true, repeatHead: true, head: headers, headWidthPercentages: widths,
    headStyles: { ...defaults.headStyles, fontSize: 10, backgroundColor: style.accentColor,
      padding: { top: 2, right: 2, bottom: 2, left: 2 }, ...(style.fontName ? { fontName: style.fontName } : {}) },
    bodyStyles: { ...defaults.bodyStyles, fontSize: 10, fontColor: style.textColor,
      padding: { top: 2, right: 2, bottom: 2, left: 2 }, ...(style.fontName ? { fontName: style.fontName } : {}) } };
}
const page = (schemas: Template['schemas'][number]): Template => ({ basePdf: { width: 210, height: 297, padding: [15, 15, 15, 15] }, schemas: [schemas] });

export function createEstimateTemplate(branding: DocumentBranding = {}): Template {
  return page([field('heading', 18, 12, branding, 22), field('parties', 34, 28, branding),
    grid('lines', 67, ['Item', 'Quantity', 'Unit price', 'Line total'], [45, 10, 22.5, 22.5], branding),
    field('totals', 110, 24, branding), field('terms', 140, 30, branding)]);
}
export function createReceiptTemplate(branding: DocumentBranding = {}): Template {
  return page([field('heading', 18, 12, branding, 22), field('parties', 34, 28, branding),
    grid('lines', 67, ['Item', 'Quantity', 'Unit price', 'Line total'], [45, 10, 22.5, 22.5], branding),
    grid('payments', 110, ['Paid on', 'Method', 'Reference', 'Amount'], [20, 25, 30, 25], branding),
    field('settlement', 153, 30, branding)]);
}
export function createPackingSlipTemplate(branding: DocumentBranding = {}): Template {
  return page([field('heading', 18, 12, branding, 22), field('shipment', 34, 18, branding), field('addresses', 58, 28, branding),
    grid('lines', 91, ['SKU', 'Item', 'Ordered', 'Shipped'], [20, 50, 15, 15], branding),
    field('summary', 134, 18, branding), field('notes', 158, 30, branding)]);
}
export function createReportTemplate(columns: readonly ReportColumn[], branding: DocumentBranding = {}): Template {
  validateReportColumns(columns);
  const weights = columns.map(column => column.width ?? 1), total = weights.reduce((sum, weight) => sum + weight, 0);
  return page([field('heading', 18, 12, branding, 22), field('context', 34, 18, branding), field('summary', 58, 25, branding),
    grid('rows', 88, columns.map(column => column.label), weights.map(weight => weight / total * 100), branding),
    field('notes', 131, 30, branding)]);
}
async function render(template: Template, inputs: Record<string, string>, options: DocumentPdfOptions) {
  checkTemplate(template);
  return generate({ template, inputs: [inputs], plugins: options.plugins ?? invoicePlugins, options: options.font ? { font: options.font } : undefined });
}
const lineValues = (lines: { description: string; quantity: number; unit: string; total: string }[]) => JSON.stringify(lines.map(line => [line.description, String(line.quantity), line.unit, line.total]));

export function estimateInputs(document: EstimateDocument, locale?: string): Record<string, string> {
  const view = estimateView(document, locale);
  return { heading: `Estimate ${view.id}`, parties: `${view.seller}\nPrepared for: ${view.customer}\nIssued: ${view.issuedOn}    Valid until: ${view.validUntil}`,
    lines: lineValues(view.lines), totals: `Subtotal: ${view.subtotal}\nTax: ${view.tax}    Shipping: ${view.shipping}    Discount: ${view.discount}\nEstimated total: ${view.total}`,
    terms: view.terms ? `Terms\n${view.terms}` : '' };
}
export function receiptInputs(document: ReceiptDocument, locale?: string): Record<string, string> {
  const view = receiptView(document, locale);
  return { heading: `Receipt ${view.id}`, parties: `${view.seller}\nReceived from: ${view.customer}\nIssued: ${view.issuedOn}${view.invoiceId ? `    Invoice: ${view.invoiceId}` : ''}`,
    lines: lineValues(view.lines), payments: JSON.stringify(view.payments.map(payment => [payment.paidOn, payment.method, payment.reference ?? '', payment.amount])),
    settlement: `Document total: ${view.total}\nPayment received: ${view.paid}\nRemaining balance: ${view.balance}` };
}
export function packingSlipInputs(document: PackingSlipDocument): Record<string, string> {
  const view = packingSlipView(document);
  return { heading: `Packing slip ${view.id}`, shipment: `Order: ${view.orderId}    Shipped: ${view.shippedOn}\n${[view.carrier, view.trackingReference].filter(Boolean).join(' — ')}`,
    addresses: `From: ${view.sender}\nShip to: ${view.recipient}`,
    lines: JSON.stringify(view.lines.map(line => [line.sku, line.description, String(line.orderedQuantity), String(line.shippedQuantity)])),
    summary: `Units shipped: ${view.shippedUnits}\nUnits remaining on this order: ${view.remainingUnits}`, notes: view.notes ?? '' };
}
export function reportInputs(document: ReportDocument, locale?: string): Record<string, string> {
  const view = reportView(document, locale);
  return { heading: view.title, context: `${view.id}    Generated: ${view.generatedOn}    Prepared by: ${view.preparedBy}${view.period ? `\nPeriod: ${view.period.start} to ${view.period.end}` : ''}`,
    summary: view.summary, rows: JSON.stringify(view.table.length ? view.table : [view.columns.map((_, index) => index === 0 ? 'No records for this report.' : '')]),
    notes: view.notes ?? '' };
}
export async function generateEstimatePdf(document: EstimateDocument, options: DocumentPdfOptions = {}) {
  return render(options.template ?? createEstimateTemplate(options.branding), estimateInputs(document, options.locale), options);
}
export async function generateReceiptPdf(document: ReceiptDocument, options: DocumentPdfOptions = {}) {
  return render(options.template ?? createReceiptTemplate(options.branding), receiptInputs(document, options.locale), options);
}
export async function generatePackingSlipPdf(document: PackingSlipDocument, options: DocumentPdfOptions = {}) {
  return render(options.template ?? createPackingSlipTemplate(options.branding), packingSlipInputs(document), options);
}
export async function generateReportPdf(document: ReportDocument, options: DocumentPdfOptions = {}) {
  return render(options.template ?? createReportTemplate(document.columns, options.branding), reportInputs(document, options.locale), options);
}
