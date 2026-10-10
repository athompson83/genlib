// SPDX-License-Identifier: Apache-2.0
// Vector tests for the core capability recipes (csv-safe, money, signed-cursors, ics-events).
// Compiled with the same generated-tsconfig approach and strict flags as
// tests/marketing-capabilities.test.mjs, then imported as ES modules.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['csv-safe', 'money', 'signed-cursors', 'ics-events'];
const out = mkdtempSync(join(tmpdir(), 'genlib-core-caps-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.core.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;

test('core capability recipes are registered and routed', () => {
  const entries = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
  for (const n of names) assert.ok(entries.some((e) => e.path === `examples/recipes/${n}.ts`), n);
  assert.equal(findTop('csv', 'injection'), 'csv-safe');
  assert.equal(findTop('formula', 'injection'), 'csv-safe');
  assert.equal(findTop('split', 'payment', 'cents'), 'money-minor-units');
  assert.equal(findTop('signed', 'cursor'), 'signed-cursors');
  assert.equal(findTop('add', 'to', 'calendar'), 'ics-events');
  assert.equal(findTop('ics'), 'ics-events');
});

const CSV_ROWS = [['id', 'name', 'note'], ['1', 'Ada, Lovelace', 'said "hi"'], ['2', '=SUM(A1)', 'line1\nline2'], ['3', ' padded', '-5']];

test('csv-safe: writeCsv vector, neutralization and validation', async () => {
  const { writeCsv } = await load('csv-safe');
  assert.equal(writeCsv(CSV_ROWS),
    'id,name,note\r\n1,"Ada, Lovelace","said ""hi"""\r\n2,\'=SUM(A1),"line1\nline2"\r\n3," padded",\'-5\r\n');
  assert.equal(writeCsv([['=1']], false), '=1\r\n');
  assert.equal(writeCsv([]), '');
  assert.equal(writeCsv([['+1', '@x', '\tx', '\rx', 'a ']]), "'+1,'@x,'\tx,\"'\rx\",\"a \"\r\n");
  assert.throws(() => writeCsv([[1]]), TypeError);
  assert.throws(() => writeCsv(['a']), TypeError);
});

test('csv-safe: parseCsv vectors, errors and round trip', async () => {
  const { parseCsv, writeCsv, CsvSyntaxError } = await load('csv-safe');
  assert.deepEqual(parseCsv('a,b\r\n"x,1","say ""hi"""\n"multi\nline",\n'), [['a', 'b'], ['x,1', 'say "hi"'], ['multi\nline', '']]);
  assert.deepEqual(parseCsv('﻿a\n'), [['a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
  assert.deepEqual(parseCsv("'=1\r\n"), [["'=1"]]);
  assert.throws(() => parseCsv('a,"b'), (e) => e instanceof CsvSyntaxError && /unterminated/.test(e.message));
  assert.throws(() => parseCsv('a"b'), (e) => e instanceof CsvSyntaxError && /quote inside/.test(e.message));
  assert.throws(() => parseCsv('"a"x'), (e) => e instanceof CsvSyntaxError && /after closing quote/.test(e.message));
  assert.deepEqual(parseCsv(writeCsv(CSV_ROWS, false)), CSV_ROWS);
});

test('money: toMinor and formatMinor with the pinned exponent table', async () => {
  const m = await load('money');
  assert.equal(m.toMinor('12.34', 'USD'), 1234);
  assert.equal(m.toMinor('-0.5', 'USD'), -50);
  assert.equal(m.toMinor('1000', 'JPY'), 1000);
  assert.equal(m.toMinor('1.234', 'BHD'), 1234);
  assert.equal(m.toMinor('7', 'USD'), 700);
  for (const [amount, currency] of [['1.5', 'JPY'], ['12.345', 'USD'], ['1,000.00', 'USD'], ['.5', 'USD'], ['5.', 'USD'],
    ['1e3', 'USD'], [' 1', 'USD'], ['+1', 'USD'], ['12', 'XXX'], ['12', 'usd'], ['12', 'XAU']]) {
    assert.throws(() => m.toMinor(amount, currency), RangeError, `${amount} ${currency}`);
  }
  assert.throws(() => m.toMinor('99999999999999999999', 'USD'), RangeError);
  assert.equal(m.formatMinor(1234, 'USD'), '12.34');
  assert.equal(m.formatMinor(-5, 'USD'), '-0.05');
  assert.equal(m.formatMinor(500, 'JPY'), '500');
  assert.equal(m.formatMinor(1, 'BHD'), '0.001');
  assert.equal(m.formatMinor(0, 'EUR'), '0.00');
  assert.throws(() => m.formatMinor(1.5, 'USD'), RangeError);
  assert.throws(() => m.formatMinor(1, 'XXX'), RangeError);
});

test('money: applyRate half-even and allocate vectors', async () => {
  const m = await load('money');
  assert.equal(m.applyRate(1999, '0.0825'), 165);
  assert.equal(m.applyRate(25, '0.5'), 12);
  assert.equal(m.applyRate(35, '0.5'), 18);
  assert.equal(m.applyRate(-25, '0.5'), -12);
  assert.equal(m.applyRate(1000, '1.07'), 1070);
  assert.equal(m.applyRate(1, '0.123456789'), 0);
  assert.throws(() => m.applyRate(1, '0.1234567891'), RangeError);
  assert.throws(() => m.applyRate(1, '1e2'), RangeError);
  assert.deepEqual(m.allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(m.allocate(5, [3, 7]), [2, 3]);
  assert.deepEqual(m.allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(m.allocate(1000, [0, 1]), [0, 1000]);
  assert.throws(() => m.allocate(10, []), RangeError);
  assert.throws(() => m.allocate(10, [0, 0]), RangeError);
  assert.throws(() => m.allocate(10, [-1, 2]), RangeError);
});

const SECRET = new TextEncoder().encode('0123456789abcdef0123456789abcdef');
const CURSOR = 'djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc';
const VALUES = ['2026-10-01T12:00:00Z', '42'];

test('signed-cursors: vector token, expiry, tampering and secrets', async () => {
  const { encodeCursor, decodeCursor, CursorError } = await load('signed-cursors');
  const code = (c) => (e) => e instanceof CursorError && e.code === c && e.message.startsWith(c);
  assert.equal(await encodeCursor(VALUES, SECRET, 1790000000), CURSOR);
  assert.deepEqual(await decodeCursor(CURSOR, SECRET, 1789999999), VALUES);
  await assert.rejects(decodeCursor(CURSOR, SECRET, 1790000000), code('expired'));
  const last = CURSOR.at(-1);
  for (const replacement of ['A', 'd', '-']) {
    assert.notEqual(replacement, last);
    await assert.rejects(decodeCursor(CURSOR.slice(0, -1) + replacement, SECRET, 0), code('bad signature'), replacement);
  }
  const dot = CURSOR.lastIndexOf('.');
  await assert.rejects(decodeCursor(`${CURSOR.slice(0, dot - 1)}w${CURSOR.slice(dot)}`, SECRET, 0), code('bad signature'));
  await assert.rejects(decodeCursor(CURSOR.replace('.', ''), SECRET, 0), code('malformed'));
  await assert.rejects(decodeCursor(`${CURSOR}=`, SECRET, 0), code('malformed'));
  await assert.rejects(decodeCursor(`${CURSOR.slice(0, dot)}.`, SECRET, 0), code('malformed'));
  await assert.rejects(decodeCursor(`.${CURSOR.slice(dot + 1)}`, SECRET, 0), code('malformed'));
  await assert.rejects(decodeCursor(CURSOR.replace('dj', 'd+'), SECRET, 0), code('malformed'));
  const other = new TextEncoder().encode('fedcba9876543210fedcba9876543210');
  await assert.rejects(decodeCursor(CURSOR, other, 0), code('bad signature'));
  const short = SECRET.slice(0, 31);
  await assert.rejects(encodeCursor(VALUES, short, 1790000000), RangeError);
  await assert.rejects(decodeCursor(CURSOR, short, 0), RangeError);
  await assert.rejects(encodeCursor([], SECRET, 1), RangeError);
  await assert.rejects(encodeCursor(Array(17).fill('x'), SECRET, 1), RangeError);
  await assert.rejects(encodeCursor(['a\nb'], SECRET, 1), RangeError);
  await assert.rejects(encodeCursor(['a'], SECRET, 0), RangeError);
  const fresh = await encodeCursor(['x'], SECRET, 5);
  assert.deepEqual(await decodeCursor(fresh, SECRET, 4), ['x']);
});

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n'
  + 'BEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\n'
  + 'SUMMARY:Office hours\\; Q&A\\, live\r\n'
  + 'DESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n'
  + ' é\\, then more words so the second line also runs past seventy-four octets\r\n'
  + '  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\n'
  + 'BEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\n'
  + 'DTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const EVENT = {
  uid: 'evt-1@example.com', dtstamp: '2026-10-10T12:00:00Z', start: '2026-10-20T15:00:00Z', end: '2026-10-20T16:30:00Z',
  summary: 'Office hours; Q&A, live',
  description: 'Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again.',
  location: 'Room 4, Main St.', url: 'https://example.com/e/1',
};

test('ics-events: calendar vector, folding and validation', async () => {
  const { icsCalendar, foldLine } = await load('ics-events');
  const ics = icsCalendar([EVENT, { uid: 'evt-2@example.com', dtstamp: '2026-10-10T12:00:00Z', start: '2026-12-24', end: '2026-12-25', summary: 'Holiday' }],
    '-//Acme//Genlib//EN');
  assert.equal(ics, ICS);
  for (const line of ics.split('\r\n').slice(0, -1)) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.equal(foldLine('é'.repeat(40)), `${'é'.repeat(37)}\r\n ${'é'.repeat(3)}\r\n`);
  assert.equal(foldLine('a'.repeat(75)), `${'a'.repeat(75)}\r\n`);
  const calendar = (patch) => icsCalendar([{ ...EVENT, ...patch }], 'x');
  assert.throws(() => calendar({ end: EVENT.start }), /after start/);
  assert.throws(() => calendar({ start: '2026-10-20' }), /both/);
  assert.throws(() => calendar({ uid: '' }), /uid/);
  assert.throws(() => calendar({ url: 'ftp://x' }), /url/);
  assert.throws(() => calendar({ dtstamp: '2026-10-10' }), /dtstamp/);
  assert.throws(() => calendar({ summary: '' }), /summary/);
  assert.throws(() => calendar({ start: '2026-02-30T10:00:00Z' }), /start/);
  assert.match(calendar({ summary: 'a\r\nb\rc' }), /SUMMARY:a\\nb\\nc\r\n/);
});
