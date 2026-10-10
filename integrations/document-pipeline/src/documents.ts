// SPDX-License-Identifier: Apache-2.0
import { formatMinor, invoiceView, validateInvoice, type InvoiceDocument } from './invoice.js';

export interface EstimateDocument extends InvoiceDocument { validUntil: string; terms?: string }
export interface ReceiptPayment { id: string; paidOn: string; method: string; amountMinor: number; reference?: string }
export interface ReceiptDocument extends InvoiceDocument { invoiceId?: string; payments: ReceiptPayment[] }
export interface PackingSlipLine { id: string; sku: string; description: string; orderedQuantity: number; shippedQuantity: number }
/** Shipping documents intentionally contain no prices or payment details. */
export interface PackingSlipDocument {
  id: string; orderId: string; shippedOn: string; sender: string; recipient: string;
  lines: PackingSlipLine[]; carrier?: string; trackingReference?: string; notes?: string;
}
export type ReportCell = string | number | boolean | null;
export interface ReportColumn { key: string; label: string; width?: number }
export interface ReportDocument {
  id: string; title: string; generatedOn: string; preparedBy: string; summary: string;
  columns: ReportColumn[]; rows: Record<string, ReportCell>[];
  period?: { start: string; end: string }; notes?: string;
}

function text(value: unknown, label: string, max = 200, multiline = false): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u : /[\u0000-\u001f]/u).test(value)) throw new Error(`Invalid ${label}.`);
}
function optionalText(value: unknown, label: string, max = 200, multiline = false) { if (value !== undefined) text(value, label, max, multiline); }
function date(value: string, label: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${label}.`);
}
function quantity(value: number, minimum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000) throw new Error(`Invalid ${label}.`);
}

export function validateEstimate(document: EstimateDocument): void {
  validateInvoice(document); date(document.validUntil, 'estimate expiry');
  if (document.validUntil < document.issuedOn) throw new Error('Estimate expiry precedes its issue date.');
  optionalText(document.terms, 'estimate terms', 2_000, true);
}
export function estimateView(document: EstimateDocument, locale = 'en-US') {
  validateEstimate(document);
  return { ...invoiceView(document, locale), validUntil: document.validUntil, terms: document.terms ?? '' };
}

export function validateReceipt(document: ReceiptDocument): void {
  validateInvoice(document); optionalText(document.invoiceId, 'invoice reference');
  if (!Array.isArray(document.payments) || document.payments.length < 1 || document.payments.length > 100) throw new Error('A receipt needs 1–100 payment records.');
  const ids = new Set<string>(); let paid = 0;
  for (const payment of document.payments) {
    text(payment.id, 'payment identity'); text(payment.method, 'payment method'); date(payment.paidOn, 'payment date');
    optionalText(payment.reference, 'payment reference');
    if (ids.has(payment.id) || payment.paidOn > document.issuedOn || !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0) throw new Error('Invalid or duplicate receipt payment.');
    ids.add(payment.id); paid += payment.amountMinor;
    if (!Number.isSafeInteger(paid) || paid > document.totalMinor) throw new Error('Receipt payments exceed the document total.');
  }
}
export function receiptView(document: ReceiptDocument, locale = 'en-US') {
  validateReceipt(document);
  const paidMinor = document.payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const format = (amount: number) => formatMinor(amount, document.currency, document.minorDigits, locale);
  return { ...invoiceView(document, locale), invoiceId: document.invoiceId ?? '', paidMinor,
    paid: format(paidMinor), balance: format(document.totalMinor - paidMinor),
    payments: document.payments.map(payment => ({ ...payment, amount: format(payment.amountMinor) })) };
}

export function validatePackingSlip(document: PackingSlipDocument): void {
  text(document.id, 'packing slip identity'); text(document.orderId, 'order reference'); date(document.shippedOn, 'shipping date');
  text(document.sender, 'sender', 2_000, true); text(document.recipient, 'recipient', 2_000, true);
  optionalText(document.carrier, 'carrier'); optionalText(document.trackingReference, 'tracking reference'); optionalText(document.notes, 'packing notes', 2_000, true);
  if (!Array.isArray(document.lines) || document.lines.length < 1 || document.lines.length > 200) throw new Error('Packing slips need 1–200 lines.');
  const ids = new Set<string>(); let shipped = 0;
  for (const line of document.lines) {
    text(line.id, 'packing line identity'); text(line.sku, 'SKU'); text(line.description, 'item description', 1_000, true);
    quantity(line.orderedQuantity, 1, 'ordered quantity'); quantity(line.shippedQuantity, 0, 'shipped quantity');
    if (ids.has(line.id) || line.shippedQuantity > line.orderedQuantity) throw new Error('Invalid or duplicate packing line.');
    ids.add(line.id); shipped += line.shippedQuantity;
  }
  if (!shipped) throw new Error('A packing slip must ship at least one item.');
}
export function packingSlipView(document: PackingSlipDocument) {
  validatePackingSlip(document);
  return { ...structuredClone(document), shippedUnits: document.lines.reduce((sum, line) => sum + line.shippedQuantity, 0),
    remainingUnits: document.lines.reduce((sum, line) => sum + line.orderedQuantity - line.shippedQuantity, 0) };
}

export function validateReportColumns(columns: readonly ReportColumn[]): void {
  if (!Array.isArray(columns) || columns.length < 1 || columns.length > 8) throw new Error('Reports require 1–8 columns.');
  const keys = new Set<string>();
  for (const column of columns) {
    text(column.key, 'report column key', 80); text(column.label, 'report column label', 100);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/u.test(column.key) || ['constructor', 'prototype', '__proto__'].includes(column.key) || keys.has(column.key) ||
        (column.width !== undefined && (!Number.isFinite(column.width) || column.width <= 0 || column.width > 100))) throw new Error('Invalid or duplicate report column.');
    keys.add(column.key);
  }
}
export function validateReport(document: ReportDocument): void {
  text(document.id, 'report identity'); text(document.title, 'report title'); date(document.generatedOn, 'report date');
  text(document.preparedBy, 'report author'); text(document.summary, 'report summary', 2_000, true); optionalText(document.notes, 'report notes', 2_000, true);
  if (document.period) { date(document.period.start, 'period start'); date(document.period.end, 'period end');
    if (document.period.end < document.period.start) throw new Error('Report period is reversed.'); }
  validateReportColumns(document.columns);
  if (!Array.isArray(document.rows) || document.rows.length > 200) throw new Error('Reports allow at most 200 rows.');
  const keys = new Set(document.columns.map(column => column.key));
  for (const row of document.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !keys.has(key))) throw new Error('Unexpected report row fields.');
    for (const column of document.columns) {
      if (!Object.hasOwn(row, column.key)) throw new Error('Report row is missing a configured field.');
      const cell = row[column.key];
      if (!(cell === null || typeof cell === 'boolean' || (typeof cell === 'number' && Number.isFinite(cell)) ||
          (typeof cell === 'string' && cell.length <= 1_000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(cell)))) throw new Error('Invalid report cell.');
    }
  }
}
export function reportView(document: ReportDocument, locale = 'en-US') {
  validateReport(document);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 12 });
  return { ...structuredClone(document), table: document.rows.map(row => document.columns.map(column => {
    const value = row[column.key]; return value === null ? '' : typeof value === 'number' ? number.format(value) : String(value);
  })) };
}
