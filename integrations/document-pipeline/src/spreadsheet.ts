// SPDX-License-Identifier: Apache-2.0
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { validateInvoice, type InvoiceDocument } from './invoice.js';

/** Prefix formula-like text on CSV export; spreadsheet formulas are never accepted from user input. */
export function spreadsheetText(value: string): string { return /^[\s]*[=+\-@\t\r]/u.test(value) ? `'${value}` : value; }
export function exportInvoiceCsv(invoice: InvoiceDocument): string {
  validateInvoice(invoice);
  return Papa.unparse(invoice.lines.map(line => ({ id: spreadsheetText(line.id), description: spreadsheetText(line.description), quantity: line.quantity,
    unit_minor: line.unitMinor, line_minor: line.unitMinor * line.quantity, currency: invoice.currency })), { newline: '\r\n', escapeFormulae: true });
}

export async function exportInvoiceWorkbook(invoice: InvoiceDocument): Promise<Uint8Array> {
  validateInvoice(invoice);
  const book = new ExcelJS.Workbook(); book.creator = invoice.seller;
  const sheet = book.addWorksheet('Invoice', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [{ header: 'Item', key: 'description', width: 48 }, { header: 'Quantity', key: 'quantity', width: 12 },
    { header: `Unit (${invoice.currency}, minor units)`, key: 'unit', width: 26 }, { header: `Total (${invoice.currency}, minor units)`, key: 'total', width: 26 }];
  for (const line of invoice.lines) sheet.addRow({ description: spreadsheetText(line.description), quantity: line.quantity, unit: line.unitMinor, total: line.quantity * line.unitMinor });
  for (const [label, value] of [['Tax', invoice.taxMinor], ['Shipping', invoice.shippingMinor], ['Discount', -invoice.discountMinor], ['Total', invoice.totalMinor]]) sheet.addRow({ description: label, total: value });
  sheet.getRow(1).font = { bold: true }; sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: invoice.lines.length + 1, column: 4 } };
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export interface CsvImportResult<T> { rows: T[]; errors: { row: number; message: string }[] }
/** Caller validator decides domain types. PapaParse handles CSV syntax; dynamic typing stays off. */
export function importCsv<T>(text: string, requiredHeaders: string[], parseRow: (row: Record<string, string>, rowNumber: number) => T,
  limits: { maxBytes?: number; maxRows?: number } = {}): CsvImportResult<T> {
  const maxBytes = limits.maxBytes ?? 5_000_000, maxRows = limits.maxRows ?? 10_000;
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('CSV input byte limit exceeded.');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false,
    transformHeader: header => header.trim().replace(/^\uFEFF/u, ''), preview: maxRows + 1 });
  if (parsed.data.length > maxRows) throw new Error('CSV row limit exceeded.');
  const fields = parsed.meta.fields ?? [];
  if (requiredHeaders.some(header => !fields.includes(header))) throw new Error('Required CSV columns are missing.');
  if (parsed.meta.renamedHeaders && Object.keys(parsed.meta.renamedHeaders).length) throw new Error('Duplicate CSV headers.');
  const errors = parsed.errors.map(error => ({ row: (error.row ?? 0) + 2, message: error.message }));
  const rows: T[] = [];
  parsed.data.forEach((row, index) => {
    if (errors.some(error => error.row === index + 2)) return;
    try { rows.push(parseRow(row, index + 2)); }
    catch (error) { errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Invalid row.' }); }
  });
  return { rows, errors };
}
