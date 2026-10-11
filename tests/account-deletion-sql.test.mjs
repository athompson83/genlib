// SPDX-License-Identifier: Apache-2.0
// account-deletion on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, one open
// request per user is enforced by the partial unique index, concurrent runDue calls claim each due account once
// through a single conditional UPDATE ... FOR UPDATE SKIP LOCKED, and a crashed run resumes after its lease expires.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { AccountDeletionError, createAccountDeletion } from '../.build/modules/account-deletion/files/core.js';
import { createSqlAccountDeletionStore } from '../.build/modules/account-deletion/files/sql-store.js';

const DAY = 86_400_000;
const schema = readFileSync(new URL('../modules/account-deletion/files/schema.sql', import.meta.url), 'utf8');
const authorize = async (actor, _action, { self }) => self || actor.userId === 'admin';
const executor = db => ({ query: (text, params) => db.query(text, params) });
const code = expected => error => error instanceof AccountDeletionError && error.code === expected;

async function setup({ policy, ...extra } = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000_000;
  let counter = 0;
  const runs = [];
  const store = createSqlAccountDeletionStore(executor(db));
  const make = (handlers) => createAccountDeletion({
    store, authorize, revokeSessions: async () => {}, graceMs: 7 * DAY, leaseMs: 60_000, now: () => now,
    newId: () => `id-${String(++counter).padStart(4, '0')}`,
    policy: handlers ?? [
      { name: 'posts', action: 'delete', reason: 'Posts', run: async ({ userId }) => { await db.query('SELECT 1'); runs.push(['posts', userId]); } },
      { name: 'orders', action: 'retain', reason: 'Accounting records' },
      { name: 'user', action: 'delete', reason: 'Account', run: async ({ userId }) => { runs.push(['user', userId]); } },
    ],
    ...extra,
  });
  return { db, store, runs, make, deletion: make(policy), fresh: userId => ({ userId, authenticatedAt: now }), advance: ms => { now += ms; }, at: () => now };
}

test('schema applies and the SQL store keeps request, cancel, grace and completion behavior', async () => {
  const { db, deletion, fresh, advance, at, runs } = await setup();
  const first = await deletion.request(fresh('alice'), { userId: 'alice', reason: 'moving on' });
  const row = (await db.query('SELECT status, scheduled_for, completed_steps, attempts FROM account_deletions WHERE id = $1', [first.id])).rows[0];
  assert.deepEqual({ ...row, scheduled_for: Number(row.scheduled_for) }, { status: 'pending', scheduled_for: at() + 7 * DAY, completed_steps: [], attempts: 0 });
  await assert.rejects(deletion.request(fresh('alice'), { userId: 'alice' }), code('already-pending'));
  assert.equal(await deletion.isDisabled('alice'), true);
  const cancelled = await deletion.cancel(fresh('alice'), { userId: 'alice' });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(await deletion.isDisabled('alice'), false);
  // The partial unique index only covers open requests, so a new request is allowed after cancelling.
  const second = await deletion.request(fresh('alice'), { userId: 'alice' });
  await assert.rejects(deletion.request(fresh('admin'), { userId: 'alice' }), code('already-pending'));
  await assert.rejects(deletion.status(fresh('bob'), 'alice'), code('forbidden'));
  advance(7 * DAY);
  await assert.rejects(deletion.cancel(fresh('alice'), { userId: 'alice' }), code('too-late'));
  const result = await deletion.runDue();
  assert.deepEqual(result.completed, [second.id]);
  assert.deepEqual(runs, [['posts', 'alice'], ['user', 'alice']]);
  const done = await deletion.status(fresh('alice'), 'alice');
  assert.equal(done.status, 'completed');
  assert.equal(done.completedAt, at());
  assert.deepEqual(done.completedSteps, ['posts', 'orders', 'user']);
  assert.equal(done.claimToken, null);
  await assert.rejects(deletion.request(fresh('alice'), { userId: 'alice' }), code('already-deleted'));
  assert.throws(() => createSqlAccountDeletionStore(executor(db), { table: 'bad; drop table x' }), RangeError);
});

test('two concurrent runDue calls claim and execute each due account exactly once', async () => {
  const { deletion, fresh, advance, runs, db } = await setup();
  const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
  for (const user of users) await deletion.request(fresh(user), { userId: user });
  await deletion.request(fresh('later'), { userId: 'later' });
  advance(7 * DAY);
  await deletion.request(fresh('fresh'), { userId: 'fresh' }); // not yet due
  const [a, b] = await Promise.all([deletion.runDue({ limit: 10 }), deletion.runDue({ limit: 10 })]);
  assert.equal(a.claimed + b.claimed, 6);
  assert.equal(a.completed.length + b.completed.length, 6);
  assert.deepEqual([...a.completed, ...b.completed].sort(), [...new Set([...a.completed, ...b.completed])].sort(), 'no account completed twice');
  const userRuns = runs.filter(([step]) => step === 'user').map(([, user]) => user).sort();
  assert.deepEqual(userRuns, [...users, 'later'].sort());
  const { rows } = await db.query("SELECT user_id, status, attempts FROM account_deletions ORDER BY user_id");
  assert.deepEqual(rows.map(r => [r.user_id, r.status, r.attempts]), [
    ['fresh', 'pending', 0], ['later', 'completed', 1], ['u1', 'completed', 1], ['u2', 'completed', 1], ['u3', 'completed', 1], ['u4', 'completed', 1], ['u5', 'completed', 1],
  ]);
});

test('a crashed run resumes after the lease expires and skips completed steps', async () => {
  let release;
  const hang = new Promise(resolve => { release = resolve; });
  let crash = true;
  const runs = [];
  const policy = [
    { name: 'files', action: 'delete', reason: 'Uploads', run: async () => { runs.push('files'); } },
    { name: 'comments', action: 'anonymize', reason: 'Threads stay readable', run: async () => { runs.push('comments'); if (crash) { crash = false; await hang; } } },
    { name: 'user', action: 'delete', reason: 'Account', run: async () => { runs.push('user'); } },
  ];
  const { deletion, fresh, advance, store } = await setup({ policy });
  const request = await deletion.request(fresh('alice'), { userId: 'alice' });
  advance(7 * DAY);
  const stale = deletion.runDue();
  while (runs.length < 2) await new Promise(resolve => setTimeout(resolve, 1));
  let row = await store.findById(request.id);
  assert.equal(row.status, 'executing');
  assert.deepEqual(row.completedSteps, ['files']);
  assert.equal((await deletion.runDue()).claimed, 0, 'lease still held');
  advance(60_001);
  const resumed = await deletion.runDue();
  assert.deepEqual(resumed.completed, [request.id]);
  assert.deepEqual(runs, ['files', 'comments', 'comments', 'user']);
  release();
  assert.deepEqual((await stale).lost, [request.id]);
  row = await store.findById(request.id);
  assert.equal(row.status, 'completed');
  assert.equal(row.attempts, 2);
  assert.deepEqual(row.completedSteps, ['files', 'comments', 'user']);
});

test('a failed step is released with its error and retried after the delay', async () => {
  let fail = true;
  const policy = [
    { name: 'files', action: 'delete', reason: 'Uploads', run: async () => { if (fail) throw new Error('storage 503'); } },
    { name: 'user', action: 'delete', reason: 'Account', run: async () => {} },
  ];
  const { deletion, fresh, advance, store, at } = await setup({ policy, retryDelayMs: 30_000 });
  const request = await deletion.request(fresh('alice'), { userId: 'alice' });
  advance(7 * DAY);
  assert.deepEqual((await deletion.runDue()).failed, [{ id: request.id, step: 'files', error: 'storage 503' }]);
  const row = await store.findById(request.id);
  assert.equal(row.lastError, 'files: storage 503');
  assert.equal(row.claimExpiresAt, at() + 30_000);
  assert.equal((await deletion.runDue()).claimed, 0);
  fail = false;
  advance(30_000);
  assert.deepEqual((await deletion.runDue()).completed, [request.id]);
  assert.equal((await store.findById(request.id)).lastError, null);
});

test('lease renewal on PostgreSQL: a queued request whose lease expired is skipped by the first worker', async () => {
  const trace = [];
  let ctl;
  let nested = false;
  const step = name => ({
    name, action: 'delete', reason: 'Data',
    run: async ({ userId }) => {
      trace.push(`${ctl.worker}:${name}:${userId}`);
      ctl.advance(40_000);
      if (name === 's2' && userId === 'u1' && !nested) {
        nested = true;
        ctl.worker = 'B';
        assert.deepEqual((await ctl.deletion.runDue()).completed, ['id-0002']);
        ctl.worker = 'A';
      }
    },
  });
  ctl = await setup({ policy: [step('s1'), step('s2')] }); // leaseMs 60,000
  ctl.worker = 'A';
  await ctl.deletion.request(ctl.fresh('u1'), { userId: 'u1' });
  ctl.advance(1);
  await ctl.deletion.request(ctl.fresh('u2'), { userId: 'u2' });
  ctl.advance(7 * DAY);
  const a = await ctl.deletion.runDue({ limit: 2 });
  assert.deepEqual(trace, ['A:s1:u1', 'A:s2:u1', 'B:s1:u2', 'B:s2:u2']);
  assert.deepEqual(a.completed, ['id-0001']);
  assert.deepEqual(a.lost, ['id-0002']);
  const { rows } = await ctl.db.query('SELECT user_id, status, attempts FROM account_deletions ORDER BY user_id');
  assert.deepEqual(rows.map(r => [r.user_id, r.status, r.attempts]), [['u1', 'completed', 1], ['u2', 'completed', 2]]);
});

test('the unique index keeps a request racing completion from reopening a deleted account', async () => {
  const ctl = await setup({ graceMs: 0 });
  await ctl.deletion.request(ctl.fresh('alice'), { userId: 'alice' });
  await ctl.deletion.runDue();
  const real = ctl.store.findLatest;
  let stale = true;
  ctl.store.findLatest = async userId => { if (stale) { stale = false; return null; } return real(userId); };
  await assert.rejects(ctl.deletion.request(ctl.fresh('alice'), { userId: 'alice' }), code('already-deleted'));
  const { rows } = await ctl.db.query("SELECT status FROM account_deletions WHERE user_id = 'alice'");
  assert.deepEqual(rows.map(r => r.status), ['completed']);
});
