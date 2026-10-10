import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createFormValidator, SchemaForm } from '../.build/SchemaForm.js';
import { DraftSession, createHttpDocumentStore, migrateDocument, RevisionConflict } from '../.build/documents.js';
import { parsePageData, PublishedPage, safePageHref } from '../.build/PageEditor.js';
import { parsePhone, PhoneInput } from '../.build/ContactInput.js';
import { RadixActionDialog, AriaActionDialog } from '../.build/Primitives.js';

const readFixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

test('JSON Forms validator enforces conditional business field and nested email formats', async () => {
  const schema = await readFixture('contact.schema'), validate = createFormValidator(schema);
  assert.equal(validate({ name: 'Sam', email: 'sam@example.test' }).valid, true);
  assert.equal(validate({ name: 'Sam', email: 'sam@example.test', business: true }).valid, false);
  assert.equal(validate({ name: 'Sam', email: 'sam@example.test', contacts: ['invalid'] }).valid, false);
  const html = renderToStaticMarkup(React.createElement(SchemaForm, { schema, data: {}, onChange() {}, async onSubmit() {} }));
  assert.match(html, /<form/); assert.match(html, /Save/);
});

test('draft saving retains concurrent edits and advances the expected revision', async () => {
  let release, expected;
  const initial = { id: 'id', schemaVersion: 1, revision: '1', data: { title: 'initial' } };
  const session = new DraftSession(initial, {
    async load() { return initial; },
    async save(document, revision) { expected = revision; await new Promise(resolve => { release = resolve; }); return { ...document, revision: '2' }; },
  });
  session.edit({ title: 'first' }); const saving = session.save(); await Promise.resolve();
  assert.equal(session.save(), saving);
  session.edit({ title: 'newer' }); release();
  const saved = await saving;
  assert.equal(saved.data.title, 'first'); assert.equal(expected, '1');
  assert.equal(session.getSnapshot().document.data.title, 'newer');
  assert.equal(session.getSnapshot().document.revision, '2'); assert.equal(session.getSnapshot().dirty, true);
});

test('HTTP document store sends conditional revision and surfaces conflict without clearing edits', async () => {
  let request;
  const store = createHttpDocumentStore({ baseUrl: '/api/pages', parse: value => value, fetch: async (url, init) => { request = { url, ...init }; return new Response('', { status: 412 }); } });
  const initial = { id: 'a/b', schemaVersion: 1, revision: '"rev-1"', data: {} };
  const session = new DraftSession(initial, store); session.edit({ title: 'unsaved' });
  await assert.rejects(session.save(), RevisionConflict);
  assert.equal(request.url, '/api/pages/a%2Fb'); assert.equal(request.headers['If-Match'], '"rev-1"');
  assert.equal(session.getSnapshot().dirty, true); assert.equal(session.getSnapshot().saving, false);
  for (const baseUrl of ['https://remote.test/pages', '//remote.test/pages', '/api/../pages', '/api/%2e%2e/pages', '/api/pages?redirect=x']) {
    assert.throws(() => createHttpDocumentStore({ baseUrl, parse: value => value }), /same-origin/);
  }
  await assert.rejects(store.load('..'), /identifier/);
  const bounded = createHttpDocumentStore({ baseUrl: '/api/pages', parse: value => value, maxResponseBytes: 4,
    fetch: async () => new Response('12345') });
  await assert.rejects(bounded.load('page'), /byte limit/);
  const success = createHttpDocumentStore({ baseUrl: '/api/pages', parse: value => value,
    fetch: async () => Response.json({ ...initial, id: 'page', revision: '"rev-2"' }) });
  assert.equal((await success.load('page')).revision, '"rev-2"');
});

test('Puck registered blocks render escaped content and unsafe links are disabled', async () => {
  const page = await readFixture('page'); const data = parsePageData(page.data);
  data.content[1].props.text = '<script>alert(1)</script>';
  const html = renderToStaticMarkup(React.createElement(PublishedPage, { data }));
  assert.match(html, /About our team/); assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
  for (const href of ['javascript:alert(1)', '//evil.test', '/\\evil.test', 'http://insecure.test']) assert.equal(safePageHref(href), '#');
  assert.equal(safePageHref('/contact'), '/contact');
  assert.throws(() => parsePageData({ root: {}, content: [{ type: 'Unregistered', props: { id: 'x' } }] }));
  assert.throws(() => migrateDocument({ ...page, schemaVersion: 9 }, 1, {}, parsePageData));
});

test('phone parsing preserves raw input and validates entire input, with extension separate', () => {
  const phone = parsePhone('+1 202 555 0123 ext. 45');
  assert.equal(phone.e164, '+12025550123'); assert.equal(phone.extension, '45');
  assert.equal(parsePhone('Call me at +1 202 555 0123').valid, false);
  assert.equal(parsePhone('202-555-0123', 'US').e164, '+12025550123');
  assert.match(renderToStaticMarkup(React.createElement(PhoneInput, { label: 'Phone', value: '', onChange() {} })), /type="tel"/);
});

test('both accessible dialog implementations expose a button trigger in server markup', () => {
  for (const Component of [RadixActionDialog, AriaActionDialog]) {
    const html = renderToStaticMarkup(React.createElement(Component, { trigger: 'Edit contact', title: 'Contact details', description: 'Edit the contact.', children: 'Form' }));
    assert.match(html, /<button/); assert.match(html, /Edit contact/);
  }
});
