import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyEdits, normalizeQuery, parseCellInput } from '../.build/model.js';
import { createLocalSearch } from '../.build/search.js';
import { alignTimeSeries } from '../.build/series.js';
import { TanStackTable } from '../.build/TanStackTable.js';

const rows = JSON.parse(await readFile(new URL('../fixtures/inventory.json', import.meta.url), 'utf8'));
const columns = [
  { key: 'name', label: 'Product', kind: 'text', editable: true },
  { key: 'stock', label: 'Stock', kind: 'number', editable: true, validate: value => value < 0 ? 'Stock cannot be negative.' : undefined },
  { key: 'active', label: 'Active', kind: 'boolean', editable: true },
];

test('batch edit preflight is atomic, typed and conditional on revision', () => {
  const edits = [{ id: 'p1', expectedVersion: '1', changes: { stock: '8', active: 'false' } }];
  const updated = applyEdits(rows, columns, edits);
  assert.equal(updated[0].stock, 8); assert.equal(updated[0].active, false); assert.equal(rows[0].stock, 4);
  assert.throws(() => applyEdits(rows, columns, [...edits, { id: 'p2', expectedVersion: '3', changes: { stock: -1 } }]), /negative/);
  assert.equal(rows[0].stock, 4);
  assert.throws(() => applyEdits(rows, columns, [{ id: 'p1', expectedVersion: 'stale', changes: { stock: 8 } }]), /conflict/);
  assert.throws(() => applyEdits(rows, columns, [{ id: 'p1', expectedVersion: '1', changes: { version: 'overwrite' } }]), /not editable/);
  assert.throws(() => parseCellInput('', columns[1]));
});

test('query validation bounds pagination and only allows configured sorting columns', () => {
  assert.deepEqual(normalizeQuery({}, columns), { page: 0, pageSize: 25, search: '', sort: [] });
  assert.throws(() => normalizeQuery({ pageSize: 50_000 }, columns));
  assert.throws(() => normalizeQuery({ sort: [{ field: 'private', descending: false }] }, columns));
});

test('actual MiniSearch supports prefix/fuzzy lookup, replacement and removal', () => {
  const search = createLocalSearch(rows, ['name', 'category']);
  assert.equal(search.search('noteb')[0].id, 'p1');
  assert.equal(search.search('botle')[0].id, 'p3');
  search.upsert({ ...rows[0], name: 'Green journal' });
  assert.equal(search.search('journal')[0].id, 'p1');
  assert.equal(search.search('notebook').length, 0);
  search.remove('p3'); assert.equal(search.search('bottle').length, 0);
});

test('uPlot series alignment sorts timestamps, replaces duplicates, and preserves gaps', () => {
  assert.deepEqual(alignTimeSeries([{ time: 2, values: { cpu: 5 } }, { time: 1, values: { cpu: null, memory: 4 } }, { time: 2, values: { cpu: 6 } }], ['cpu', 'memory']), [[1, 2], [null, 6], [4, null]]);
  assert.throws(() => alignTimeSeries([{ time: 0, values: { cpu: NaN } }], ['cpu']));
  assert.throws(() => alignTimeSeries([{ time: 1e30, values: {} }], ['cpu']));
});

test('real TanStack v9 renders semantic columns and only the configured page', () => {
  const html = renderToStaticMarkup(React.createElement(TanStackTable, { rows, columns, caption: 'Inventory', pageSize: 2 }));
  assert.match(html, /<caption>Inventory<\/caption>/); assert.match(html, /Blue notebook/); assert.match(html, /Red pencil/);
  assert.doesNotMatch(html, /Reusable water bottle/); assert.match(html, /Page 1 of 2/); assert.match(html, /aria-sort="none"/);
});
