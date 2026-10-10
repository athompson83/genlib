// SPDX-License-Identifier: Apache-2.0
// Creates an AcroForm with the same library at test time, fills it, reads back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from '@cantoo/pdf-lib';
import { fillForm, listFields } from './pdfForms.ts';

async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const form = doc.getForm();
  form.createTextField('name').addToPage(page, { x: 50, y: 220, width: 200, height: 20 });
  form.createCheckBox('subscribe').addToPage(page, { x: 50, y: 180, width: 16, height: 16 });
  const plan = form.createDropdown('plan');
  plan.addOptions(['free', 'pro', 'team']);
  plan.select('free');
  plan.addToPage(page, { x: 50, y: 140, width: 120, height: 20 });
  return doc.save();
}

test('lists fields with kinds and options', async () => {
  const fields = await listFields(await makeForm());
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  assert.equal(byName.name.kind, 'text');
  assert.equal(byName.subscribe.kind, 'checkbox');
  assert.deepEqual(byName.plan.options, ['free', 'pro', 'team']);
});

test('fills text, checkbox and choice and reads them back', async () => {
  const out = await fillForm(await makeForm(), { name: 'Ada Lovelace', subscribe: true, plan: 'pro' });
  const byName = Object.fromEntries((await listFields(out)).map((f) => [f.name, f.value]));
  assert.equal(byName.name, 'Ada Lovelace');
  assert.equal(byName.subscribe, true);
  assert.deepEqual(byName.plan, ['pro']);
});

test('rejects unknown fields and invalid options', async () => {
  const src = await makeForm();
  await assert.rejects(fillForm(src, { nmae: 'typo' }));
  await assert.rejects(fillForm(src, { plan: 'enterprise' }), /not an option/);
});

test('flatten removes the interactive fields', async () => {
  const out = await fillForm(await makeForm(), { name: 'Grace Hopper' }, { flatten: true });
  assert.deepEqual(await listFields(out), []);
});
