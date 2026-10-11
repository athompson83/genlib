// SPDX-License-Identifier: Apache-2.0
// short-links on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL store
// passes the core behaviors, and 20 concurrent resolves of a link with maxClicks 5 give exactly 5 redirects because
// the check and the increment are one conditional UPDATE.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ShortLinkError, createShortLinks } from '../.build/modules/short-links/files/core.js';
import { createSqlShortLinkStore } from '../.build/modules/short-links/files/sql-store.js';

const schema = readFileSync(new URL('../modules/short-links/files/schema.sql', import.meta.url), 'utf8');
const authorize = async (actor, action, { tenantId }) => (actor.userId === 'alice' && tenantId === 'acme') || (actor.userId === 'eve' && tenantId === 'globex');
const executor = db => ({ query: (text, params) => db.query(text, params) });
const code = expected => error => error instanceof ShortLinkError && error.code === expected;
const alice = { userId: 'alice' }, eve = { userId: 'eve' };

async function setup(extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  let counter = 0;
  const store = createSqlShortLinkStore(executor(db));
  const links = createShortLinks({ store, authorize, now: () => now, newId: () => `l-${String(++counter).padStart(4, '0')}`, blockHosts: ['sho.rt'], ...extra });
  return { db, links, advance: ms => { now += ms; }, at: () => now };
}

test('schema applies and the SQL store keeps the core behavior', async () => {
  const { db, links, advance, at } = await setup();
  const link = await links.create(alice, { tenantId: 'acme', url: 'https://Example.com/a', slug: 'launch' });
  const row = (await db.query('SELECT code, url, clicks, disabled, max_clicks FROM short_links WHERE id = $1', [link.id])).rows[0];
  assert.deepEqual(row, { code: 'launch', url: 'https://example.com/a', clicks: 0, disabled: false, max_clicks: null });
  await assert.rejects(links.create(eve, { tenantId: 'globex', url: 'https://e.com/', slug: 'launch' }), code('slug-taken'));
  assert.deepEqual(await links.resolve('launch'), { status: 302, url: 'https://example.com/a', linkId: link.id });
  assert.deepEqual(await links.stats(alice, link.id), { clicks: 1, lastClickAt: at() });
  await links.update(alice, link.id, { disabled: true });
  assert.deepEqual(await links.resolve('launch'), { status: 410, reason: 'disabled' });
  const updated = await links.update(alice, link.id, { disabled: false, url: 'https://example.com/b', expiresAt: at() + 1000 });
  assert.equal(updated.url, 'https://example.com/b');
  assert.equal(updated.expiresAt, at() + 1000);
  assert.equal((await links.resolve('launch')).status, 302);
  advance(1000);
  assert.deepEqual(await links.resolve('launch'), { status: 410, reason: 'expired' });
  assert.equal((await links.update(alice, link.id, { expiresAt: null })).expiresAt, null);
  assert.equal((await links.resolve('launch')).status, 302);
  await assert.rejects(links.get(eve, link.id), code('forbidden'));
  // Pagination newest first, with ties on created_at broken by id.
  for (let i = 0; i < 3; i++) await links.create(alice, { tenantId: 'acme', url: `https://example.com/${i}` });
  await links.create(eve, { tenantId: 'globex', url: 'https://globex.test/' });
  const page1 = await links.list(alice, { tenantId: 'acme', limit: 2 });
  assert.deepEqual(page1.links.map(l => l.url), ['https://example.com/2', 'https://example.com/1']);
  const page2 = await links.list(alice, { tenantId: 'acme', limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.links.map(l => l.url), ['https://example.com/0', 'https://example.com/b']);
  assert.equal(page2.nextCursor, null);
  await links.remove(alice, link.id);
  assert.deepEqual(await links.resolve('launch'), { status: 404, reason: 'not-found' });
  await assert.rejects(links.remove(alice, link.id), code('not-found'));
  assert.throws(() => createSqlShortLinkStore(executor(db), { table: 'bad; drop table x' }), RangeError);
});

test('generated-code collisions use ON CONFLICT and retry, then fail with exhausted', async () => {
  const { links } = await setup({ randomBytes: n => new Uint8Array(n).fill(9), maxAttempts: 2 });
  await links.create(alice, { tenantId: 'acme', url: 'https://example.com/1' });
  await assert.rejects(links.create(alice, { tenantId: 'acme', url: 'https://example.com/2' }), code('exhausted'));
});

test('20 concurrent resolves with maxClicks 5 give exactly 5 redirects', async () => {
  const { db, links } = await setup();
  const link = await links.create(alice, { tenantId: 'acme', url: 'https://example.com/', maxClicks: 5 });
  const results = await Promise.all(Array.from({ length: 20 }, () => links.resolve(link.code)));
  assert.equal(results.filter(r => r.status === 302).length, 5);
  assert.equal(results.filter(r => r.status === 410).length, 15);
  assert.equal((await db.query('SELECT clicks FROM short_links WHERE id = $1', [link.id])).rows[0].clicks, 5);
});
