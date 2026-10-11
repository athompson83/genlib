// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getDefaultFont } from '@pdfme/common';
import { PDFDocument, PDFName, PDFDict } from '@pdfme/pdf-lib';
import { validateEstimate, validateReceipt, validatePackingSlip, validateReport, receiptView } from '../.build/documents.js';
import { createEstimateTemplate, createReceiptTemplate, createPackingSlipTemplate, createReportTemplate,
  estimateInputs, receiptInputs, packingSlipInputs, reportInputs,
  generateEstimatePdf, generateReceiptPdf, generatePackingSlipPdf, generateReportPdf } from '../.build/document-pdfs.js';
const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const estimate = await fixture('estimate'), receipt = await fixture('receipt'), packing = await fixture('packing-slip'), report = await fixture('report');

test('document variants validate their own dates, payments, shipment quantities and report columns', () => {
  validateEstimate(estimate); validateReceipt(receipt); validatePackingSlip(packing); validateReport(report);
  assert.throws(() => validateEstimate({ ...estimate, validUntil: '2026-09-01' }), /expiry/);
  assert.throws(() => validateReceipt({ ...receipt, payments: [...receipt.payments, receipt.payments[0]] }), /duplicate/);
  assert.throws(() => validateReceipt({ ...receipt, payments: [{ ...receipt.payments[0], amountMinor: receipt.totalMinor + 1 }] }), /exceed/);
  assert.equal(receiptView({ ...receipt, payments: [receipt.payments[0]] }).balance, '$164.00');
  assert.throws(() => validatePackingSlip({ ...packing, lines: [{ ...packing.lines[0], shippedQuantity: 13 }] }), /packing line/);
  assert.throws(() => validateReport({ ...report, rows: [{ ...report.rows[0], available: Infinity }] }), /cell/);
  assert.throws(() => validateReport({ ...report, columns: [{ key: '__proto__', label: 'Unsafe' }] }), /column/);
});

test('variant inputs preserve estimate expiry, settlement, price-free packing and report empty state', () => {
  assert.match(estimateInputs(estimate).parties, /Valid until: 2026-11-09/);
  assert.match(receiptInputs(receipt).settlement, /Remaining balance: \$0\.00/);
  const packed = packingSlipInputs(packing);
  assert.match(packed.summary, /Units remaining on this order: 2/);
  assert.doesNotMatch(JSON.stringify(packed), /price|paid|\$/i);
  assert.equal(JSON.parse(packed.lines)[0][3], '10');
  assert.equal(JSON.parse(reportInputs({ ...report, rows: [] }).rows)[0][0], 'No records for this report.');
  assert.match(JSON.stringify(reportInputs({ ...report, rows: [{ item: 'Range', received: 1500.5, shipped: 0, available: 0 }] }, 'de-DE')), /1\.500,5/);
});

test('all four factories generate real readable PDF containers with independent branding and template overrides', { timeout: 30_000 }, async () => {
  const profiles = [
    [estimate, createEstimateTemplate(), generateEstimatePdf], [receipt, createReceiptTemplate(), generateReceiptPdf],
    [packing, createPackingSlipTemplate(), generatePackingSlipPdf], [report, createReportTemplate(report.columns), generateReportPdf],
  ];
  for (const [document, template, generate] of profiles) {
    const bytes = await generate(document, { template });
    const parsed = await PDFDocument.load(bytes);
    assert.ok(parsed.getPageCount() >= 1); assert.equal(parsed.getPage(0).getWidth().toFixed(1), '595.3');
    assert.ok(bytes.length > 3000);
  }
  const first = createEstimateTemplate({ accentColor: '#673ab7' }), second = createEstimateTemplate();
  first.schemas[0][0].content = 'Local customization';
  assert.notEqual(second.schemas[0][0].content, first.schemas[0][0].content);
  assert.equal(first.schemas[0][0].fontColor, '#673ab7');
});

test('real pdfme report generation paginates dynamic rows with an explicitly supplied font map', { timeout: 30_000 }, async () => {
  // Reuse installed upstream font bytes at runtime; no third-party font is copied into Genlib.
  const font = { FixtureSans: { ...Object.values(getDefaultFont())[0], fallback: true, subset: true } };
  const rows = Array.from({ length: 90 }, (_, i) => ({ item: `Inventory record ${i + 1}`, received: i + 10, shipped: i, available: 10 }));
  const bytes = await generateReportPdf({ ...report, rows }, { font, branding: { fontName: 'FixtureSans', accentColor: '#215e38' } });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1, 'Dynamic rows must flow to additional PDF pages');
  const fonts = pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'), PDFDict);
  assert.ok(fonts.keys().length > 0, 'The generated document must contain embedded font resources');
});
