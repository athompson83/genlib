// SPDX-License-Identifier: Apache-2.0
// scheduled-tasks on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL store
// keeps the core behaviors (save/keep next run, run history, retries, onFailure, overlap slots, lease recovery,
// catch-up) and concurrent instances run each occurrence exactly once. PGlite runs one connection, so concurrency
// here interleaves statements on that connection; contention across connections needs a multi-connection server.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createScheduler } from '../.build/modules/scheduled-tasks/files/core.js';
import { createSqlSchedulerStore } from '../.build/modules/scheduled-tasks/files/sql-store.js';

const schema = readFileSync(new URL('../modules/scheduled-tasks/files/schema.sql', import.meta.url), 'utf8');
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const at = text => Date.parse(text);
const yieldMicrotasks = async (n = 5) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
// PGlite answers on its own schedule, so wait for a condition instead of counting microtasks.
async function until(condition, label) {
  for (let i = 0; i < 2000; i++) { if (await condition()) return; await new Promise(resolve => setImmediate(resolve)); }
  throw new Error('timed out waiting for ' + label);
}

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  const store = createSqlSchedulerStore({ query: (text, params) => db.query(text, params) });
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const make = (id, handlers, extra = {}) => {
    let n = 0;
    return createScheduler({ store, instanceId: id, handlers, now: () => clock.now, newId: () => `${id}-${++n}`, timers: false, ...extra });
  };
  return { db, store, clock, make };
}

test('schema applies and the SQL store keeps schedules, history, retries and onFailure', async () => {
  const { db, clock, make } = await setup();
  const calls = [];
  const failures = [];
  let fail = 0;
  const scheduler = make('w1', {
    job: ctx => { calls.push([iso(ctx.scheduledFor), ctx.attempt, ctx.payload]); },
    flaky: () => { fail++; throw new Error('flaky ' + fail); },
  }, { onFailure: info => { failures.push(info); } });
  const saved = await scheduler.save({ id: 'ny', cron: '30 2 * * *', handler: 'job', timeZone: 'America/New_York', payload: 'text payload' });
  assert.deepEqual([saved.timeZone, iso(saved.nextRunAt), saved.payload, saved.overlap, saved.catchUp], ['America/New_York', '2026-10-11T06:30:00Z', 'text payload', 'skip', 'latest']);
  assert.equal(iso((await scheduler.save({ id: 'ny', cron: '30 2 * * *', handler: 'job', timeZone: 'America/New_York', payload: { a: [1, 2] } })).nextRunAt), '2026-10-11T06:30:00Z');
  assert.deepEqual((await scheduler.get('ny')).payload, { a: [1, 2] });
  await assert.rejects(scheduler.save({ id: 'bad', cron: '0 0 30 2 *', handler: 'job' }), { code: 'never-runs' });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM scheduled_tasks')).rows[0].n, 1);

  clock.now = at('2026-10-11T06:30:10Z');
  assert.equal((await scheduler.tick()).succeeded, 1);
  assert.deepEqual(calls, [['2026-10-11T06:30:00Z', 1, { a: [1, 2] }]]);
  const [run] = await scheduler.runs('ny');
  assert.deepEqual([run.status, run.attempt, run.error, run.leaseOwner], ['succeeded', 1, null, null]);
  assert.equal(iso((await scheduler.get('ny')).nextRunAt), '2026-10-12T06:30:00Z');

  await scheduler.save({ id: 'f', cron: '* * * * *', handler: 'flaky', maxAttempts: 2, retryBaseMs: 5000 });
  clock.now = at('2026-10-11T06:31:00Z');
  assert.equal((await scheduler.tick()).retried, 1);
  let [flaky] = await scheduler.runs('f');
  assert.deepEqual([flaky.status, flaky.attempt, flaky.error, flaky.nextAttemptAt - clock.now], ['pending', 1, 'flaky 1', 5000]);
  clock.now += 5000;
  const summary = await scheduler.tick();
  assert.equal(summary.failed, 1);
  flaky = (await scheduler.runs('f')).find(r => r.id === flaky.id);
  assert.deepEqual([flaky.status, flaky.attempt, flaky.error], ['failed', 2, 'flaky 2']);
  assert.deepEqual([failures.length, failures[0].run.id, failures[0].error], [1, flaky.id, 'flaky 2']);

  assert.equal(await scheduler.remove('f'), true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM scheduled_task_runs WHERE schedule_id = 'f'")).rows[0].n, 0);
  assert.throws(() => createSqlSchedulerStore({ query: async () => ({ rows: [] }) }, { table: 'x; drop' }), RangeError);
});

test('three concurrent instances on PGlite run each occurrence exactly once', async () => {
  const { db, clock, make } = await setup();
  const executions = [];
  const handlers = { job: async ctx => { await yieldMicrotasks(2); executions.push(`${ctx.scheduleId}@${iso(ctx.scheduledFor)}`); } };
  const instances = ['a', 'b', 'c', 'd'].map(id => make(id, handlers));
  for (let n = 0; n < 4; n++) await instances[0].save({ id: `s${n}`, cron: '* * * * *', handler: 'job', overlap: n % 2 ? 'allow' : 'skip' });
  for (let minute = 1; minute <= 5; minute++) {
    clock.now = at('2026-10-10T12:00:00Z') + minute * 60_000 + 500;
    await Promise.all(instances.map(s => s.tick()));
  }
  assert.equal(executions.length, 20);
  assert.equal(new Set(executions).size, 20);
  const { rows } = await db.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'succeeded' AND attempt = 1)::int AS ok FROM scheduled_task_runs");
  assert.deepEqual(rows[0], { n: 20, ok: 20 });
});

test('the unique (schedule_id, scheduled_for) claim rejects a second materialization of one occurrence', async () => {
  const { db, store, make } = await setup();
  await make('a', { job: () => {} }).save({ id: 'x', cron: '0 * * * *', handler: 'job' });
  const nextRunAt = at('2026-10-10T13:00:00Z');
  const run = id => ({ id, scheduleId: 'x', scheduledFor: nextRunAt, status: 'pending', attempt: 0, nextAttemptAt: nextRunAt, leaseOwner: null, leaseExpiresAt: null, startedAt: null, finishedAt: null, error: null, createdAt: 1 });
  const results = await Promise.all([1, 2, 3].map(n => store.materialize({ scheduleId: 'x', expectedNextRunAt: nextRunAt, nextRunAt: nextRunAt + 3_600_000, runs: [run('r' + n)] })));
  assert.equal(results.filter(r => r.advanced).length, 1);
  assert.equal(results.reduce((sum, r) => sum + r.inserted, 0), 1);
  assert.deepEqual(await store.materialize({ scheduleId: 'x', expectedNextRunAt: nextRunAt + 3_600_000, nextRunAt: nextRunAt + 7_200_000, runs: [run('r9')] }), { advanced: true, inserted: 0 });
  await assert.rejects(db.query("INSERT INTO scheduled_task_runs (id, schedule_id, scheduled_for, status, next_attempt_at, created_at) VALUES ('dup', 'x', $1, 'pending', 0, 0)", [nextRunAt]), /unique|duplicate/i);
});

test('overlap skip and queue hold a slot on PostgreSQL; a crashed worker\'s lease and slot are recovered', async () => {
  const { store, clock, make } = await setup();
  const gates = [];
  const started = [];
  let autoResolve = false;
  const handlers = { job: ctx => { started.push([ctx.instanceId, ctx.scheduleId, iso(ctx.scheduledFor)]); return autoResolve ? undefined : new Promise(resolve => gates.push(resolve)); } };
  const a = make('a', handlers);
  const b = make('b', handlers);
  await a.save({ id: 'skip', cron: '* * * * *', handler: 'job', overlap: 'skip', leaseMs: 120_000 });
  await a.save({ id: 'queue', cron: '* * * * *', handler: 'job', overlap: 'queue', leaseMs: 120_000 });
  clock.now = at('2026-10-10T12:01:00Z');
  const tickA = a.tick();
  await until(() => started.length === 2, 'two runs to start');
  clock.now = at('2026-10-10T12:02:00Z');
  const summaryB = await b.tick();
  assert.deepEqual([summaryB.skipped, summaryB.deferred], [1, 1]);
  const skipRuns = await store.listRuns('skip', 10);
  assert.deepEqual(skipRuns.map(r => [iso(r.scheduledFor), r.status]), [['2026-10-10T12:02:00Z', 'skipped'], ['2026-10-10T12:01:00Z', 'running']]);
  const queueRuns = await store.listRuns('queue', 10);
  assert.deepEqual(queueRuns.map(r => [iso(r.scheduledFor), r.status, r.attempt]), [['2026-10-10T12:02:00Z', 'pending', 0], ['2026-10-10T12:01:00Z', 'running', 1]]);

  // Instance a "crashes": its runs never finish and it stops heartbeating. After the lease, b recovers both.
  clock.now = at('2026-10-10T12:03:00Z') + 1;
  const tickB = b.tick();
  await until(() => started.length === 4, 'recovered runs to start');
  assert.deepEqual(started.slice(2).map(s => s[0]), ['b', 'b']);
  autoResolve = true;
  gates.slice(2).forEach(resolve => resolve());
  // b then works through the rest in order: skip@12:03, queue@12:02, and queue@12:03 only after queue@12:02 finished.
  const second = await tickB;
  assert.equal(second.succeeded, 5);
  const later = started.slice(4);
  assert.deepEqual(later.filter(s => s[1] === 'queue').map(s => s[2]), ['2026-10-10T12:02:00Z', '2026-10-10T12:03:00Z']);
  assert.deepEqual(later.filter(s => s[1] === 'skip').map(s => s[2]), ['2026-10-10T12:03:00Z']);
  gates.slice(0, 2).forEach(resolve => resolve());
  assert.equal((await tickA).lostLease, 2);
  const recovered = (await store.listRuns('skip', 10)).find(r => iso(r.scheduledFor) === '2026-10-10T12:01:00Z');
  assert.deepEqual([recovered.status, recovered.attempt, recovered.leaseOwner], ['succeeded', 2, null]);
  const queued = (await store.listRuns('queue', 10)).find(r => iso(r.scheduledFor) === '2026-10-10T12:02:00Z');
  assert.equal(queued.status, 'succeeded');
});

test('lease heartbeat on PostgreSQL extends the run lease and fails once another instance owns the run', async () => {
  const { store, clock, make } = await setup();
  let context = null;
  let release;
  const a = make('a', { job: ctx => { context = ctx; return new Promise(resolve => { release = resolve; }); } });
  await a.save({ id: 'hb', cron: '0 * * * *', handler: 'job', leaseMs: 60_000 });
  clock.now = at('2026-10-10T13:00:00Z');
  const tick = a.tick();
  await until(() => context !== null, 'handler start');
  clock.now += 45_000;
  assert.equal(await context.heartbeat(), true);
  const [run] = await store.listRuns('hb', 1);
  assert.equal(run.leaseExpiresAt, clock.now + 60_000);
  assert.equal(await store.claimRun({ runId: run.id, workerId: 'b', now: clock.now + 59_000, leaseMs: 60_000 }), null);
  assert.ok(await store.claimRun({ runId: run.id, workerId: 'b', now: clock.now + 60_001, leaseMs: 60_000 }));
  assert.equal(await context.heartbeat(), false);
  assert.equal(context.signal.aborted, true);
  release();
  assert.equal((await tick).lostLease, 1);
});

test('catch-up policies after downtime on PostgreSQL: none, latest and all with a cap', async () => {
  const { clock, make } = await setup();
  const ran = {};
  const scheduler = make('w', { job: ctx => { (ran[ctx.scheduleId] ??= []).push(iso(ctx.scheduledFor)); } });
  await scheduler.save({ id: 'none', cron: '*/15 * * * *', handler: 'job', catchUp: 'none' });
  await scheduler.save({ id: 'latest', cron: '*/15 * * * *', handler: 'job', catchUp: 'latest' });
  await scheduler.save({ id: 'all', cron: '*/15 * * * *', handler: 'job', catchUp: 'all', maxCatchUp: 3 });
  clock.now = at('2026-10-10T14:20:00Z');
  await scheduler.tick();
  assert.deepEqual(ran, { latest: ['2026-10-10T14:15:00Z'], all: ['2026-10-10T13:45:00Z', '2026-10-10T14:00:00Z', '2026-10-10T14:15:00Z'] });
  clock.now = at('2026-10-10T14:30:30Z');
  await scheduler.tick();
  assert.deepEqual(ran.none, ['2026-10-10T14:30:00Z']);
});

test('a busy queue schedule with a growing backlog cannot starve other schedules on PostgreSQL', async () => {
  const { store, clock, make } = await setup();
  const ranB = [];
  let startedA = 0;
  const handlers = { hang: () => { startedA++; return new Promise(() => {}); }, job: ctx => { ranB.push(ctx.scheduledFor); } };
  const i1 = make('i1', handlers);
  const i2 = make('i2', handlers, { maxRunsPerTick: 5 });
  await i1.save({ id: 'a', cron: '* * * * *', handler: 'hang', overlap: 'queue', leaseMs: 86_400_000 });
  await i1.save({ id: 'b', cron: '* * * * *', handler: 'job', overlap: 'allow' });
  clock.now = at('2026-10-10T12:01:00Z');
  void i1.tick();
  await until(() => startedA === 1, 'A to start');
  for (let minute = 2; minute <= 21; minute++) {
    clock.now = at('2026-10-10T12:00:00Z') + minute * 60_000;
    await i2.tick();
  }
  assert.equal(startedA, 1);
  assert.equal(ranB.length, 21);
  assert.ok((await store.listRuns('a', 100)).filter(r => r.status === 'pending').length >= 20);
});
