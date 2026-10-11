import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exportCalendar } from '../.build/ical.js';
import { parseInstant, parseDateOnly, toDisplayEvents, validateEvents } from '../.build/events.js';
import { moveNodes, renameNode, removeNodes, insertNode } from '../.build/tree-model.js';
const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

test('actual ical-generator preserves all-day exclusive ends, UTC instants and stable UIDs', async () => {
  const events = await fixture('events');
  const text = exportCalendar(events, { name: 'Team calendar', domain: 'example.test' });
  assert.match(text, /DTSTART;VALUE=DATE:20261010/); assert.match(text, /DTEND;VALUE=DATE:20261012/);
  assert.match(text, /DTSTART:20261025T003000Z/); assert.match(text, /DTEND:20261025T013000Z/);
  assert.match(text, /UID:clock-change@example.test/); assert.match(text, /SEQUENCE:3/);
  assert.equal(exportCalendar(events, { name: 'Team calendar', domain: 'example.test' }), text);
});

test('ambiguous instants, calendar rollovers, reverse ranges and duplicate events are rejected', async () => {
  assert.throws(() => parseDateOnly('2026-02-30')); assert.throws(() => parseInstant('2026-10-25T01:30:00'));
  const events = await fixture('events');
  assert.throws(() => validateEvents([events[0], events[0]]));
  assert.throws(() => validateEvents([{ ...events[0], end: events[0].start }]));
  const displayed = toDisplayEvents(events);
  assert.equal(displayed[0].start.getDate(), 10);
  assert.equal(displayed[1].end.getTime() - displayed[1].start.getTime(), 60 * 60 * 1000);
});

test('Arborist pre-removal indexes reorder without jumping the adjacent row', async () => {
  const nodes = await fixture('files');
  const moved = moveNodes(nodes, ['a'], 'reports', 2);
  assert.deepEqual(moved[0].children.map(node => node.id), ['b', 'a', 'c']);
  assert.deepEqual(nodes[0].children.map(node => node.id), ['a', 'b', 'c']);
  const multiple = moveNodes(nodes, ['a', 'b'], 'reports', 3);
  assert.deepEqual(multiple[0].children.map(node => node.id), ['c', 'a', 'b']);
  const crossFolder = moveNodes(nodes, ['a'], 'archive', 0);
  assert.equal(crossFolder[1].children[0].id, 'a'); assert.equal(crossFolder[0].children.length, 2);
});

test('tree operations reject cycles, duplicate names and path-like names; create/delete preserve identity', async () => {
  const nodes = await fixture('files');
  assert.throws(() => moveNodes(nodes, ['reports'], 'reports', 0));
  assert.throws(() => renameNode(nodes, 'a', 'February.pdf'));
  assert.throws(() => renameNode(nodes, 'a', '../outside'));
  assert.throws(() => moveNodes(nodes, ['reports', 'a'], 'archive', 0));
  const inserted = insertNode(nodes, { id: 'd', name: 'April.pdf', kind: 'file' }, 'reports', 3);
  assert.equal(inserted[0].children.at(-1).id, 'd');
  assert.deepEqual(removeNodes(inserted, ['reports']).map(node => node.id), ['archive']);
});
