import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { validateInvoice, invoiceView } from '../.build/invoice.js';
import { generateInvoicePdf, createInvoiceTemplate } from '../.build/pdf.js';
import { renderInvoiceEmail } from '../.build/email.js';
import { exportInvoiceCsv, exportInvoiceWorkbook, importCsv } from '../.build/spreadsheet.js';
import { createGotenbergConverter } from '../.build/gotenberg.js';
import { compileTypstInvoice } from '../.build/typst.js';

const invoice = JSON.parse(await readFile(new URL('../fixtures/invoice.json', import.meta.url), 'utf8'));

test('one invoice model validates totals, safe integers, currencies and dates', () => {
  assert.equal(invoiceView(invoice).total, '$314.00');
  assert.throws(() => validateInvoice({ ...invoice, totalMinor: 1 }));
  assert.throws(() => validateInvoice({ ...invoice, issuedOn: '2026-02-30' }));
  assert.throws(() => validateInvoice({ ...invoice, id: 'bad\r\nBcc: test@example.test' }));
});

test('actual pdfme generates a PDF from configurable text/table template and invoice inputs', { timeout: 30_000 }, async () => {
  const template = createInvoiceTemplate(); assert.equal(template.schemas[0].find(field => field.name === 'lines').type, 'table');
  const bytes = await generateInvoicePdf(invoice, { template });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-'); assert.ok(bytes.length > 3_000);
});

test('supported React Email package produces escaped HTML and a usable plain-text alternative', async () => {
  const result = await renderInvoiceEmail({ ...invoice, customer: '<script>alert(1)</script>' });
  assert.match(result.html, /&lt;script&gt;/); assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.text, /Invoice INV-2026-0042/i); assert.match(result.text, /\$314\.00/); assert.match(result.text, /Implementation review\s+2\s+\$250\.00/); assert.equal(result.subject, 'Invoice INV-2026-0042');
});

test('ExcelJS workbook round trip preserves integer money and PapaParse handles quoted multiline CSV', async () => {
  const bytes = await exportInvoiceWorkbook(invoice); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(bytes));
  assert.equal(workbook.getWorksheet('Invoice').getCell('C2').value, 12500); assert.equal(workbook.getWorksheet('Invoice').getCell('D7').value, 31400);
  const imported = importCsv('name,quantity\r\n"Line one\nLine two",2\r\nBad,nope', ['name', 'quantity'], row => {
    const quantity = Number(row.quantity); if (!Number.isInteger(quantity)) throw new Error('Invalid quantity'); return { ...row, quantity };
  });
  assert.equal(imported.rows[0].name, 'Line one\nLine two'); assert.equal(imported.errors.length, 1);
  const dangerous = { ...invoice, lines: [{ ...invoice.lines[0], description: '=HYPERLINK("https://example.test")' }, invoice.lines[1]] };
  assert.match(exportInvoiceCsv(dangerous), /'=HYPERLINK/);
  assert.throws(() => importCsv('name,name\na,b', ['name'], value => value), /Duplicate/);
  assert.throws(() => importCsv('name\na\nb', ['name'], value => value, { maxRows: 1 }), /row limit/);
});

test('Gotenberg transport validates filenames, fixed routes, response types and bounded PDF bytes', async () => {
  let request;
  const converter = createGotenbergConverter({ baseUrl: 'http://gotenberg.internal:3000', fetch: async (url, init) => {
    request = { url, ...init }; return new Response('%PDF-1.7\nfixture', { headers: { 'Content-Type': 'application/pdf' } });
  } });
  const bytes = await converter('html', [{ name: 'index.html', data: new Blob(['<p>Invoice</p>']) }]);
  assert.equal(request.url.pathname, '/forms/chromium/convert/html'); assert.equal(request.redirect, 'error');
  assert.equal(request.body.get('files').name, 'index.html'); assert.ok(bytes.length > 5);
  await assert.rejects(converter('html', [{ name: '../index.html', data: new Blob() }]));
  const wrongType = createGotenbergConverter({ baseUrl: 'https://gotenberg.example.test', fetch: async () => new Response('not pdf') });
  await assert.rejects(wrongType('office', [{ name: 'report.docx', data: new Blob() }]), /not return a PDF/);
  const oversized = createGotenbergConverter({ baseUrl: 'https://gotenberg.example.test', maxOutputBytes: 4, fetch: async () => new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }) });
  await assert.rejects(oversized('office', [{ name: 'report.docx', data: new Blob() }]), /limit/);
});

test('Typst process boundary passes literal JSON data, uses fixed arguments and cleans private working directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'genlib-typst-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'controlled-compiler');
  // This fixture tests process invocation/cleanup only; it is not a Typst compiler or rendering evidence.
  await writeFile(executable, `#!/usr/bin/env node\nconst fs=require('node:fs');\nconst args=process.argv.slice(2);\nif(args[0]!=='compile'||args[1]!=='--root'||args[3]!=='--input'||args[4]!=='invoice=invoice.json')process.exit(2);\nconst input=JSON.parse(fs.readFileSync('invoice.json','utf8'));\nfs.writeFileSync('invoice.pdf','%PDF-1.7\\n'+process.cwd()+'\\n'+input.id);\n`, { mode: 0o700 });
  const result = Buffer.from(await compileTypstInvoice({ ...invoice, id: 'literal-$(not-a-command)' }, { executable })).toString();
  assert.match(result, /literal-\$\(not-a-command\)/);
  const work = result.split('\n')[1]; await assert.rejects(access(work));
  await assert.rejects(compileTypstInvoice(invoice, { executable: join(directory, 'missing') }), /ENOENT/);
});
