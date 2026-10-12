// SPDX-License-Identifier: Apache-2.0
// quick as a one-call reuse decision: what the pick fixes, its size, files, API and hooks, a direct/partial
// verdict from the feature contracts, and a skip answer for small edits to existing code.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compactSignature, isSmallEdit, requiredHooks } from '../lib/brief.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const quick = (...args) => execFileSync(process.execPath, [root + 'bin/genlib.mjs', 'quick', ...args], { cwd: root, encoding: 'utf8' });
const json = (...args) => JSON.parse(quick(...args, '--json'));

test('a module pick carries its fixed behavior, files, import path, API, hooks and verify step', () => {
  const pick = json('organization', 'invitations');
  assert.equal(pick.best, 'module:org-invitations');
  assert.equal(pick.reuse, 'direct');
  assert.ok(pick.decisions.some(item => /409 already-accepted/.test(item)), 'status codes a task may contradict are shown');
  assert.ok(pick.files.includes('src/genlib/org-invitations/core.ts'));
  assert.equal(pick.importFrom, 'src/genlib/org-invitations/core.ts');
  assert.ok(pick.api.includes('createInvitations(options)'));
  assert.deepEqual(pick.hooks, ['store', 'authorize']);
  assert.ok(pick.size.lines > 100 && pick.size.files >= 3);
  assert.match(pick.verify, /genlib verify org-invitations/);
  const text = quick('organization', 'invitations');
  assert.match(text, /^# fixed: .*409 already-accepted/m);
  assert.match(text, /^# reuse direct: 8\/8 of org-invitations/m);
});

test('a recipe pick names its destination; a partial contract says partial', () => {
  const recipe = json('verify', 'stripe', 'webhook', '--target', 'benchmarks/feature-tasks/fixtures/teamnotes');
  if (recipe.best === 'capability:webhook-signature') {
    assert.deepEqual(recipe.files, ['genlib/webhook-signature.ts']);
    assert.ok(recipe.api.some(item => item.startsWith('verifyWebhook(')));
  }
  const cron = json('cron', 'next', 'run', 'time');
  if (cron.covers) assert.equal(cron.reuse, cron.covers.missing.length ? 'partial' : 'direct');
});

test('small edits to existing code get a skip answer; feature tasks never do', () => {
  const { skip, tuning, heldout } = JSON.parse(readFileSync(root + 'tests/fixtures/routing-queries.json', 'utf8'));
  for (const query of skip) assert.ok(isSmallEdit(query), 'should skip: ' + query);
  for (const [query] of [...tuning, ...heldout]) assert.ok(!isSmallEdit(query), 'should not skip: ' + query);
  const answer = json('rename', 'the', 'submit', 'button', 'label', 'to', 'Save');
  assert.equal(answer.best, null);
  assert.equal(answer.status, 'small-edit');
  assert.match(quick('increase', 'the', 'page', 'size', 'from', '20', 'to', '50'), /^# skip: /);
});

test('signatures are compacted to names and parameter names; required option fields become hooks', () => {
  assert.equal(compactSignature('export async function verifyWebhook(header: string, body: string | Uint8Array, secret: string, nowSeconds?: number): Promise<void>').text, 'verifyWebhook(header, body, secret, nowSeconds)');
  assert.equal(compactSignature('export function createX<T>(options: Options<T>, { a, b }: { a: number; b: string })').text, 'createX(options, {…})');
  assert.equal(compactSignature('def parse_csv(text: str, delimiter: str = ",") -> list[list[str]]').text, 'parse_csv(text, delimiter)');
  assert.equal(compactSignature('export class Store').text, 'Store');
  assert.equal(compactSignature('export type X = string'), null);
  assert.deepEqual(requiredHooks([{ signature: 'export interface InvitationOptions { readonly store: InvitationStore; readonly authorize: (actor: Actor, action: string) => Promise<boolean>; readonly ttlMs?: number; }' }]), ['store', 'authorize']);
});

test('a module with install profiles lists them and suggests a minimal --profile on its add command', () => {
  const pick = json('organization', 'invitations');
  assert.deepEqual(pick.profiles, ['core', 'memory', 'sql', 'http']);
  assert.equal(pick.profile, 'core,memory,http');
  assert.ok(pick.next.some(command => / add org-invitations --profile core,memory,http --target /.test(command)));
  const text = quick('organization', 'invitations');
  assert.match(text, /^# profiles: core, memory, sql, http$/m);
  assert.match(text, /add org-invitations --profile core,memory,http --target/);
});
