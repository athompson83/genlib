// SPDX-License-Identifier: Apache-2.0
// Generates a two-page PDF with pdf-lib at test time and checks unpdf extraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { extract } from './pdfText.ts';

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Cookbook Fixture');
  doc.setAuthor('Genlib');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('Hello from page one', { x: 50, y: 250, font, size: 14 });
  doc.addPage([400, 300]).drawText('Second page text', { x: 50, y: 250, font, size: 14 });
  return doc.save();
}

test('extracts per-page text and metadata', async () => {
  const result = await extract(await makePdf());
  assert.equal(result.pageCount, 2);
  assert.match(result.pages[0], /Hello from page one/);
  assert.match(result.pages[1], /Second page text/);
  assert.doesNotMatch(result.pages[0], /Second page/);
  assert.equal(result.metadata.title, 'Cookbook Fixture');
  assert.equal(result.metadata.author, 'Genlib');
});
