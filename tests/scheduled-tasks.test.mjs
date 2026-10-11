// SPDX-License-Identifier: Apache-2.0
// scheduled-tasks: cron parsing and validation, next-run (Vixie day rule, leap days), IANA time zones across
// America/New_York DST transitions, single execution across concurrent instances, overlap policies with leases and
// heartbeats, crash recovery, catch-up policies and retries with run history. Fake clock; no network or real timers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCron, nextOccurrence, nextOccurrences, resolveTimeZone, wallTimeToInstant } from '../.build/modules/scheduled-tasks/files/cron.js';
import { createScheduler, SchedulerError, exponentialBackoff } from '../.build/modules/scheduled-tasks/files/core.js';
import { MemorySchedulerStore } from '../.build/modules/scheduled-tasks/files/memory-store.js';

const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const at = text => Date.parse(text);
const next = (cron, after, zone) => iso(nextOccurrence(cron, at(after), zone));
const yieldMicrotasks = async (n = 5) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------- parse-validate

test('parseCron accepts ranges, steps, lists, names, Sunday as 0 or 7, and @macros', () => {
  const s = parseCron('0,30 9-17/2 * JAN-mar mon-FRI');
  assert.deepEqual([...s.minute], [0, 30]);
  assert.deepEqual([...s.hour], [9, 11, 13, 15, 17]);
  assert.deepEqual([...s.month], [1, 2, 3]);
  assert.deepEqual([...s.dayOfWeek], [1, 2, 3, 4, 5]);
  assert.equal(s.dayOfMonthRestricted, false);
  assert.deepEqual([...parseCron('5/20 * * * *').minute], [5, 25, 45]);
  assert.deepEqual([...parseCron('* * * * 7').dayOfWeek], [0]);
  assert.deepEqual([...parseCron('* * * * 5-7').dayOfWeek], [0, 5, 6]);
  assert.deepEqual([...parseCron('* * * * sun,sat').dayOfWeek], [0, 6]);
  const daily = parseCron('@daily');
  assert.deepEqual([[...daily.minute], [...daily.hour], daily.dayOfMonth.size, daily.dayOfWeek.size], [[0], [0], 31, 7]);
  assert.deepEqual([...parseCron('@weekly').dayOfWeek], [0]);
  assert.deepEqual([...parseCron('@MONTHLY').dayOfMonth], [1]);
  assert.deepEqual([[...parseCron('@yearly').month], [...parseCron('@annually').dayOfMonth]], [[1], [1]]);
  assert.deepEqual([...parseCron('@hourly').minute], [0]);
  assert.equal(parseCron('@midnight').hour.has(0), true);
});

test('parseCron rejects malformed expressions with the failing field', () => {
  const bad = [
    '', '* * * *', '0 0 * * * *', '61 * * * *', '* 24 * * *', '* * 0 * *', '* * 32 * *', '* * * 13 *', '* * * * 8',
    '*/0 * * * *', '5-1 * * * *', '1,,2 * * * *', '? * * * *', 'MON * * * *', '* * * * JAN', '-1 * * * *', '+1 * * * *',
    '1-2-3 * * * *', '1/2/3 * * * *', '@reboot', '@every 5m', 'L * * * *', '* * 15W * *', '* * * * 5#3', 'a b c d e',
    '0 0 1 1 1 extra', 'x'.repeat(300),
  ];
  for (const expression of bad) assert.throws(() => parseCron(expression), RangeError, expression);
  assert.throws(() => parseCron('70 * * * *'), /minute value 70 is outside 0-59/);
  assert.throws(() => parseCron(42), RangeError);
});

test('saving a schedule rejects invalid cron, unknown zones, unknown handlers and never-matching dates', async () => {
  const { scheduler } = makeInstance({ store: new MemorySchedulerStore() });
  await assert.rejects(scheduler.save({ id: 'a', cron: '61 * * * *', handler: 'job' }), { code: 'invalid-cron' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '0 0 30 2 *', handler: 'job' }), { code: 'never-runs' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '0 0 31 4,6,9,11 *', handler: 'job' }), { code: 'never-runs' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', timeZone: 'Mars/Olympus' }), { code: 'invalid-time-zone' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'nope' }), { code: 'unknown-handler' });
  await assert.rejects(scheduler.save({ id: 'bad id!', cron: '* * * * *', handler: 'job' }), { code: 'invalid-id' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', overlap: 'sometimes' }), { code: 'invalid-option' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', catchUp: 'some' }), { code: 'invalid-option' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', maxCatchUp: 0 }), { code: 'invalid-option' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', maxAttempts: 0 }), { code: 'invalid-option' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', leaseMs: 10 }), { code: 'invalid-option' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', payload: { f: () => 1 } }), { code: 'invalid-payload' });
  await assert.rejects(scheduler.save({ id: 'a', cron: '* * * * *', handler: 'job', payload: { big: 'x'.repeat(70_000) } }), { code: 'invalid-payload' });
  assert.equal((await scheduler.list()).length, 0);
  const saved = await scheduler.save({ id: 'a', cron: '0 0 29 2 *', handler: 'job', timeZone: 'america/new_york' });
  assert.equal(saved.timeZone, 'America/New_York');
  assert.equal(iso(saved.nextRunAt), '2028-02-29T05:00:00Z');
});

// ---------------------------------------------------------------- next-run

test('nextOccurrence follows the Vixie day-of-month OR day-of-week rule and leap days in UTC', () => {
  // Friday the 13th style: both restricted, so the 13th OR any Friday.
  assert.equal(next('0 0 13 * 5', '2026-10-10T12:00:00Z'), '2026-10-13T00:00:00Z');
  assert.equal(next('0 0 13 * 5', '2026-10-13T00:00:00Z'), '2026-10-16T00:00:00Z');
  // A day field starting with * makes both day fields required (AND).
  assert.equal(next('0 0 */2 * 1', '2026-10-10T00:00:00Z'), '2026-10-19T00:00:00Z');
  assert.equal(next('0 0 1 * *', '2026-10-10T00:00:00Z'), '2026-11-01T00:00:00Z');
  assert.equal(next('* * * * *', '2026-10-10T12:00:30Z'), '2026-10-10T12:01:00Z');
  assert.equal(next('*/15 * * * *', '2026-10-10T12:00:00Z'), '2026-10-10T12:15:00Z');
  assert.equal(next('30 8 * * 1-5', '2026-10-10T09:00:00Z'), '2026-10-12T08:30:00Z');
  assert.equal(next('0 0 31 * *', '2026-02-01T00:00:00Z'), '2026-03-31T00:00:00Z');
  assert.equal(next('59 23 31 12 *', '2026-12-31T23:59:00Z'), '2027-12-31T23:59:00Z');
  // Leap day: 2028 is a leap year, 2100 is not (next after 2096 is 2104).
  assert.equal(next('0 0 29 2 *', '2026-01-01T00:00:00Z'), '2028-02-29T00:00:00Z');
  assert.equal(next('0 0 29 2 *', '2097-01-01T00:00:00Z'), '2104-02-29T00:00:00Z');
  assert.equal(next('0 12 * 2 *', '2028-02-28T12:00:00Z'), '2028-02-29T12:00:00Z');
  assert.equal(nextOccurrence('0 0 30 2 *', at('2026-01-01T00:00:00Z')), null);
  assert.deepEqual(nextOccurrences('@hourly', at('2026-10-10T10:30:00Z'), 3).map(iso), ['2026-10-10T11:00:00Z', '2026-10-10T12:00:00Z', '2026-10-10T13:00:00Z']);
});

// ---------------------------------------------------------------- timezone

const NY = 'America/New_York';

test('schedules are evaluated in an IANA zone with Intl, including offsets and day boundaries', () => {
  assert.equal(resolveTimeZone('america/new_york'), NY);
  assert.throws(() => resolveTimeZone('Nowhere/City'), RangeError);
  // 09:00 New York is 13:00Z in summer (EDT) and 14:00Z in winter (EST).
  assert.equal(next('0 9 * * *', '2026-07-01T00:00:00Z', NY), '2026-07-01T13:00:00Z');
  assert.equal(next('0 9 * * *', '2026-12-01T00:00:00Z', NY), '2026-12-01T14:00:00Z');
  // Midnight Monday local is still Sunday in UTC.
  assert.equal(next('0 0 * * 1', '2026-10-10T00:00:00Z', NY), '2026-10-12T04:00:00Z');
  assert.equal(next('30 9 * * *', '2026-10-10T00:00:00Z', 'Asia/Kolkata'), '2026-10-10T04:00:00Z');
  assert.equal(next('0 0 1 1 *', '2026-10-10T00:00:00Z', 'Pacific/Auckland'), '2026-12-31T11:00:00Z');
});

test('America/New_York spring forward: a time in the skipped hour runs once at the next valid instant', () => {
  // 2026-03-08: 02:00 EST jumps to 03:00 EDT (07:00Z), so 02:30 does not exist that day.
  assert.equal(next('30 2 * * *', '2026-03-07T00:00:00Z', NY), '2026-03-07T07:30:00Z');
  assert.equal(next('30 2 * * *', '2026-03-07T07:30:00Z', NY), '2026-03-08T07:00:00Z');
  assert.equal(next('30 2 * * *', '2026-03-08T07:00:00Z', NY), '2026-03-09T06:30:00Z');
  const gap = wallTimeToInstant(Date.UTC(2026, 2, 8, 2, 30), NY);
  assert.deepEqual({ instants: gap.instants, gapEnd: iso(gap.gapEnd) }, { instants: [], gapEnd: '2026-03-08T07:00:00Z' });
  // Every 30 minutes: 02:00 and 02:30 collapse into one run at 03:00 EDT, which is itself an occurrence.
  const runs = nextOccurrences('*/30 * * * *', at('2026-03-08T06:00:00Z'), 4, NY).map(iso);
  assert.deepEqual(runs, ['2026-03-08T06:30:00Z', '2026-03-08T07:00:00Z', '2026-03-08T07:30:00Z', '2026-03-08T08:00:00Z']);
  assert.equal(next('0 9 * * *', '2026-03-07T14:00:00Z', NY), '2026-03-08T13:00:00Z');
});

test('America/New_York fall back: an ambiguous time runs once, at its first occurrence', () => {
  // 2026-11-01: 02:00 EDT falls back to 01:00 EST (06:00Z), so 01:30 happens at 05:30Z and again at 06:30Z.
  const both = wallTimeToInstant(Date.UTC(2026, 10, 1, 1, 30), NY);
  assert.deepEqual(both.instants.map(iso), ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']);
  assert.equal(next('30 1 * * *', '2026-10-31T06:00:00Z', NY), '2026-11-01T05:30:00Z');
  assert.equal(next('30 1 * * *', '2026-11-01T05:30:00Z', NY), '2026-11-02T06:30:00Z');
  // Called from inside the repeated hour (01:10 EST, second pass): the 01:30 that already happened is not repeated.
  assert.equal(next('30 1 * * *', '2026-11-01T06:10:00Z', NY), '2026-11-02T06:30:00Z');
  const runs = nextOccurrences('0 * * * *', at('2026-11-01T03:30:00Z'), 4, NY).map(iso);
  assert.deepEqual(runs, ['2026-11-01T04:00:00Z', '2026-11-01T05:00:00Z', '2026-11-01T07:00:00Z', '2026-11-01T08:00:00Z']);
  assert.equal(next('0 9 * * *', '2026-11-01T00:00:00Z', NY), '2026-11-01T14:00:00Z');
});

// ---------------------------------------------------------------- scheduler helpers

function makeInstance({ store, clock = { now: at('2026-10-10T12:00:00Z') }, handlers, id = 'node-1', ...extra }) {
  const calls = [];
  const failures = [];
  const scheduler = createScheduler({
    store, instanceId: id, now: () => clock.now, newId: (() => { let n = 0; return () => `${id}-r${++n}`; })(),
    handlers: handlers ?? { job: async ctx => { calls.push(ctx); } },
    onFailure: info => { failures.push(info); }, timers: false, ...extra,
  });
  return { scheduler, calls, failures, clock };
}

test('tick runs nothing at import or creation and runs a due occurrence once', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:30Z') };
  const { scheduler, calls } = makeInstance({ store, clock });
  const saved = await scheduler.save({ id: 'report', cron: '*/5 * * * *', handler: 'job', payload: { kind: 'daily' } });
  assert.equal(iso(saved.nextRunAt), '2026-10-10T12:05:00Z');
  assert.deepEqual(await scheduler.tick(), { materialized: 0, claimed: 0, succeeded: 0, retried: 0, failed: 0, skipped: 0, deferred: 0, lostLease: 0, hookErrors: 0 });
  clock.now = at('2026-10-10T12:05:02Z');
  const summary = await scheduler.tick();
  assert.equal(summary.materialized, 1);
  assert.equal(summary.succeeded, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].scheduleId, iso(calls[0].scheduledFor), calls[0].attempt, calls[0].payload], ['report', '2026-10-10T12:05:00Z', 1, { kind: 'daily' }]);
  assert.equal((await scheduler.tick()).claimed, 0);
  const [run] = await scheduler.runs('report');
  assert.deepEqual([run.status, run.attempt, run.error, iso(run.scheduledFor)], ['succeeded', 1, null, '2026-10-10T12:05:00Z']);
  assert.equal(iso((await scheduler.get('report')).nextRunAt), '2026-10-10T12:10:00Z');
});

// ---------------------------------------------------------------- single-execution

test('three concurrent instances on one store run each occurrence exactly once', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const executions = [];
  const handlers = { job: async ctx => { await yieldMicrotasks(3); executions.push(`${ctx.scheduleId}@${iso(ctx.scheduledFor)}`); } };
  const instances = ['a', 'b', 'c'].map(id => makeInstance({ store, clock, handlers, id }).scheduler);
  for (let n = 0; n < 5; n++) await instances[0].save({ id: `s${n}`, cron: '* * * * *', handler: 'job', overlap: 'allow' });
  for (let minute = 1; minute <= 6; minute++) {
    clock.now = at('2026-10-10T12:00:00Z') + minute * 60_000 + 1000;
    await Promise.all(instances.map(s => s.tick()));
  }
  assert.equal(executions.length, 30);
  assert.equal(new Set(executions).size, 30);
  const runs = store.allRuns();
  assert.equal(runs.length, 30);
  assert.ok(runs.every(r => r.status === 'succeeded' && r.attempt === 1));
});

test('the (scheduleId, scheduledFor) claim is unique even when two instances materialize the same occurrence', async () => {
  const store = new MemorySchedulerStore();
  await store.saveSchedule(scheduleRecord({ id: 'x', nextRunAt: 1000 }));
  const run = id => ({ id, scheduleId: 'x', scheduledFor: 1000, status: 'pending', attempt: 0, nextAttemptAt: 1000, leaseOwner: null, leaseExpiresAt: null, startedAt: null, finishedAt: null, error: null, createdAt: 1 });
  assert.deepEqual(await store.materialize({ scheduleId: 'x', expectedNextRunAt: 1000, nextRunAt: 2000, runs: [run('r1')] }), { advanced: true, inserted: 1 });
  assert.deepEqual(await store.materialize({ scheduleId: 'x', expectedNextRunAt: 1000, nextRunAt: 2000, runs: [run('r2')] }), { advanced: false, inserted: 0 });
  assert.deepEqual(await store.materialize({ scheduleId: 'x', expectedNextRunAt: 2000, nextRunAt: 3000, runs: [run('r3')] }), { advanced: true, inserted: 0 });
  assert.deepEqual(store.allRuns().map(r => r.id), ['r1']);
});

function scheduleRecord(over = {}) {
  return {
    id: 's', cron: '* * * * *', timeZone: 'UTC', handler: 'job', payload: null, overlap: 'skip', catchUp: 'latest', maxCatchUp: 10,
    graceMs: 60_000, maxAttempts: 3, retryBaseMs: 1000, retryMaxMs: 60_000, leaseMs: 60_000, enabled: true, nextRunAt: null,
    createdAt: 1, updatedAt: 1, ...over,
  };
}

// ---------------------------------------------------------------- no-overlap

async function overlapScenario(overlap) {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const gates = [];
  const started = [];
  const handlers = { job: async ctx => { started.push(iso(ctx.scheduledFor)); const gate = deferred(); gates.push(gate); await gate.promise; } };
  const a = makeInstance({ store, clock, handlers, id: 'a' }).scheduler;
  const b = makeInstance({ store, clock, handlers, id: 'b' }).scheduler;
  await a.save({ id: 'sync', cron: '* * * * *', handler: 'job', overlap, leaseMs: 300_000 });
  clock.now = at('2026-10-10T12:01:00Z');
  const tickA = a.tick();
  await yieldMicrotasks(30);
  assert.deepEqual(started, ['2026-10-10T12:01:00Z']);
  clock.now = at('2026-10-10T12:02:00Z');
  const tickB = b.tick();
  await yieldMicrotasks(30);
  return { store, clock, a, b, gates, started, tickA, tickB };
}

test('overlap skip: an occurrence due while the previous run holds a live lease is skipped and recorded', async () => {
  const { store, gates, started, tickA, tickB } = await overlapScenario('skip');
  const summaryB = await tickB;
  assert.equal(summaryB.skipped, 1);
  assert.deepEqual(started, ['2026-10-10T12:01:00Z']);
  gates[0].resolve();
  assert.equal((await tickA).succeeded, 1);
  const byTime = Object.fromEntries(store.allRuns().map(r => [iso(r.scheduledFor), [r.status, r.error]]));
  assert.deepEqual(byTime, {
    '2026-10-10T12:01:00Z': ['succeeded', null],
    '2026-10-10T12:02:00Z': ['skipped', 'overlap: a previous run is still executing'],
  });
});

test('overlap queue: the next occurrence waits until the running one finishes, then runs', async () => {
  const { store, gates, started, tickA, tickB } = await overlapScenario('queue');
  assert.equal((await tickB).deferred, 1);
  assert.deepEqual(started, ['2026-10-10T12:01:00Z']);
  let queued = store.allRuns().find(r => iso(r.scheduledFor) === '2026-10-10T12:02:00Z');
  assert.deepEqual([queued.status, queued.attempt], ['pending', 0]);
  // When the first run finishes and frees the slot, the queued occurrence runs next (here in A's same tick).
  gates[0].resolve();
  await yieldMicrotasks(40);
  assert.deepEqual(started, ['2026-10-10T12:01:00Z', '2026-10-10T12:02:00Z']);
  gates[1].resolve();
  assert.equal((await tickA).succeeded, 2);
  queued = store.allRuns().find(r => iso(r.scheduledFor) === '2026-10-10T12:02:00Z');
  assert.deepEqual([queued.status, queued.attempt], ['succeeded', 1]);
});

test('overlap allow: the next occurrence runs while the previous one is still executing', async () => {
  const { gates, started, tickA, tickB } = await overlapScenario('allow');
  assert.deepEqual(started, ['2026-10-10T12:01:00Z', '2026-10-10T12:02:00Z']);
  gates.forEach(g => g.resolve());
  assert.equal((await tickA).succeeded + (await tickB).succeeded, 2);
});

test('lease heartbeat keeps a long run owned; a crashed worker\'s expired lease is recovered by another instance', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const gate = deferred();
  let heartbeatResult = null;
  let context = null;
  const executions = [];
  const handlers = {
    job: async ctx => {
      executions.push(ctx.instanceId ?? 'x');
      if (executions.length === 1) { context = ctx; await gate.promise; }
    },
  };
  const a = makeInstance({ store, clock, handlers, id: 'a' }).scheduler;
  const b = makeInstance({ store, clock, handlers, id: 'b' }).scheduler;
  await a.save({ id: 'long', cron: '0 * * * *', handler: 'job', overlap: 'skip', leaseMs: 60_000 });
  clock.now = at('2026-10-10T13:00:00Z');
  const tickA = a.tick();
  await yieldMicrotasks(30);
  // 50 s later A heartbeats, extending its lease to 13:01:50; at 13:01:10 B finds the lease live and does nothing.
  clock.now += 50_000;
  heartbeatResult = await context.heartbeat();
  assert.equal(heartbeatResult, true);
  clock.now += 20_000;
  assert.equal((await b.tick()).claimed, 0);
  assert.equal(executions.length, 1);
  // A stops heartbeating (crash). After the lease expires B reclaims and finishes the same occurrence (attempt 2).
  clock.now += 41_000;
  const summaryB = await b.tick();
  assert.deepEqual([summaryB.claimed, summaryB.succeeded], [1, 1]);
  assert.equal(executions.length, 2);
  assert.equal(await context.heartbeat(), false);
  assert.equal(context.signal.aborted, true);
  gate.resolve();
  const summaryA = await tickA;
  assert.equal(summaryA.lostLease, 1);
  const [run] = store.allRuns();
  assert.deepEqual([run.status, run.attempt, run.leaseOwner], ['succeeded', 2, null]);
});

test('automatic heartbeat uses injected timers only while a handler runs', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const timers = [];
  const fakeTimers = { set: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; }, clear: t => { t.cleared = true; } };
  const gate = deferred();
  const { scheduler } = makeInstance({ store, clock, handlers: { job: () => gate.promise }, timers: fakeTimers });
  await scheduler.save({ id: 'auto', cron: '* * * * *', handler: 'job', leaseMs: 30_000 });
  assert.equal(timers.length, 0);
  clock.now = at('2026-10-10T12:01:00Z');
  const tick = scheduler.tick();
  await yieldMicrotasks(30);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 10_000);
  clock.now += 25_000;
  await timers[0].fn();
  assert.equal(store.allRuns()[0].leaseExpiresAt, clock.now + 30_000);
  gate.resolve();
  await tick;
  assert.equal(timers[0].cleared, true);
});

// ---------------------------------------------------------------- missed-runs

async function downtime(catchUp, extra = {}) {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const { scheduler, calls } = makeInstance({ store, clock });
  await scheduler.save({ id: 'm', cron: '*/10 * * * *', handler: 'job', catchUp, overlap: 'skip', ...extra });
  // Down from 12:00 until 13:05: 12:10 ... 13:00 (6 occurrences) were missed.
  clock.now = at('2026-10-10T13:05:00Z');
  const summary = await scheduler.tick();
  return { summary, ran: calls.map(c => iso(c.scheduledFor)), scheduler, clock, calls };
}

test('catchUp none skips occurrences missed during downtime but runs an on-time one', async () => {
  const { ran, scheduler, clock, calls } = await downtime('none');
  assert.deepEqual(ran, []);
  assert.equal(iso((await scheduler.get('m')).nextRunAt), '2026-10-10T13:10:00Z');
  clock.now = at('2026-10-10T13:10:20Z');
  await scheduler.tick();
  assert.deepEqual(calls.map(c => iso(c.scheduledFor)), ['2026-10-10T13:10:00Z']);
});

test('catchUp latest runs only the most recent missed occurrence', async () => {
  const { ran, summary } = await downtime('latest');
  assert.deepEqual(ran, ['2026-10-10T13:00:00Z']);
  assert.equal(summary.materialized, 1);
});

test('catchUp all runs missed occurrences oldest first, capped to the most recent maxCatchUp', async () => {
  const all = await downtime('all');
  assert.deepEqual(all.ran, ['2026-10-10T12:10:00Z', '2026-10-10T12:20:00Z', '2026-10-10T12:30:00Z', '2026-10-10T12:40:00Z', '2026-10-10T12:50:00Z', '2026-10-10T13:00:00Z']);
  const capped = await downtime('all', { maxCatchUp: 4 });
  assert.deepEqual(capped.ran, ['2026-10-10T12:30:00Z', '2026-10-10T12:40:00Z', '2026-10-10T12:50:00Z', '2026-10-10T13:00:00Z']);
  const again = await downtime('all', { maxCatchUp: 4 });
  assert.deepEqual(again.ran, capped.ran);
});

test('catch-up stays bounded for a minutely schedule after a month of downtime', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-09-01T00:00:00Z') };
  const { scheduler, calls } = makeInstance({ store, clock });
  await scheduler.save({ id: 'm', cron: '* * * * *', handler: 'job', catchUp: 'all', maxCatchUp: 3, timeZone: NY });
  clock.now = at('2026-10-10T12:00:30Z');
  await scheduler.tick();
  assert.deepEqual(calls.map(c => iso(c.scheduledFor)), ['2026-10-10T11:58:00Z', '2026-10-10T11:59:00Z', '2026-10-10T12:00:00Z']);
});

// ---------------------------------------------------------------- failure-handling

test('failed runs retry with exponential backoff up to maxAttempts, then call onFailure with history', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  let attempts = 0;
  const handlers = { job: async () => { attempts++; throw new Error('boom ' + attempts + ' ' + 'x'.repeat(2000)); } };
  const { scheduler, failures } = makeInstance({ store, clock, handlers });
  await scheduler.save({ id: 'f', cron: '0 * * * *', handler: 'job', maxAttempts: 3, retryBaseMs: 1000, retryMaxMs: 60_000 });
  clock.now = at('2026-10-10T13:00:00Z');
  assert.equal((await scheduler.tick()).retried, 1);
  let [run] = await scheduler.runs('f');
  assert.deepEqual([run.status, run.attempt, run.nextAttemptAt - clock.now], ['pending', 1, 1000]);
  assert.equal(run.error.length, 1000);
  assert.ok(run.error.startsWith('boom 1'));
  clock.now += 999;
  assert.equal((await scheduler.tick()).claimed, 0);
  clock.now += 1;
  assert.equal((await scheduler.tick()).retried, 1);
  [run] = await scheduler.runs('f');
  assert.equal(run.nextAttemptAt - clock.now, 2000);
  clock.now += 2000;
  assert.equal((await scheduler.tick()).failed, 1);
  [run] = await scheduler.runs('f');
  assert.deepEqual([run.status, run.attempt], ['failed', 3]);
  assert.ok(run.error.startsWith('boom 3'));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].run.id, run.id);
  assert.equal(failures[0].schedule.id, 'f');
  assert.match(failures[0].error, /^boom 3/);
  clock.now += 100_000;
  assert.equal((await scheduler.tick()).claimed, 0);
  assert.equal(attempts, 3);
  assert.deepEqual([exponentialBackoff(1, 1000, 60_000), exponentialBackoff(4, 1000, 60_000), exponentialBackoff(30, 1000, 60_000)], [1000, 8000, 60_000]);
});

test('a crash during the final attempt fails the run without executing again; hook errors are counted', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  let executed = 0;
  const { scheduler } = makeInstance({ store, clock, handlers: { job: async () => { executed++; } }, onFailure: () => { throw new Error('hook down'); } });
  await scheduler.save({ id: 'c', cron: '0 * * * *', handler: 'job', maxAttempts: 1, leaseMs: 5000 });
  await store.materialize({ scheduleId: 'c', expectedNextRunAt: at('2026-10-10T13:00:00Z'), nextRunAt: at('2026-10-10T14:00:00Z'), runs: [{ id: 'r', scheduleId: 'c', scheduledFor: at('2026-10-10T13:00:00Z'), status: 'pending', attempt: 0, nextAttemptAt: at('2026-10-10T13:00:00Z'), leaseOwner: null, leaseExpiresAt: null, startedAt: null, finishedAt: null, error: null, createdAt: 0 }] });
  clock.now = at('2026-10-10T13:00:00Z');
  assert.ok(await store.claimRun({ runId: 'r', workerId: 'dead', now: clock.now, leaseMs: 5000 }));
  clock.now += 5001;
  const summary = await scheduler.tick();
  assert.deepEqual([summary.failed, summary.hookErrors, executed], [1, 1, 0]);
  const run = store.allRuns()[0];
  assert.deepEqual([run.status, run.attempt, run.error], ['failed', 2, 'lease expired during the final attempt']);
});

test('an unknown handler at run time fails permanently and disabled schedules do not run', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const first = makeInstance({ store, clock, handlers: { job: async () => {}, old: async () => {} } });
  await first.scheduler.save({ id: 'o', cron: '* * * * *', handler: 'old', maxAttempts: 5 });
  await first.scheduler.save({ id: 'off', cron: '* * * * *', handler: 'job', enabled: false });
  const second = makeInstance({ store, clock, handlers: { job: async () => {} } });
  clock.now = at('2026-10-10T12:01:00Z');
  const summary = await second.scheduler.tick();
  assert.equal(summary.failed, 1);
  assert.deepEqual((await second.scheduler.runs('o')).map(r => [r.status, r.error]), [['failed', 'unknown handler: old']]);
  assert.equal(second.failures.length, 1);
  assert.deepEqual(await second.scheduler.runs('off'), []);
  assert.equal((await second.scheduler.get('off')).nextRunAt, null);
});

test('re-saving keeps the pending occurrence unless the timing changes; remove deletes history', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const { scheduler } = makeInstance({ store, clock });
  await scheduler.save({ id: 'k', cron: '0 * * * *', handler: 'job' });
  clock.now = at('2026-10-10T12:30:00Z');
  assert.equal(iso((await scheduler.save({ id: 'k', cron: '0 * * * *', handler: 'job', payload: 2 })).nextRunAt), '2026-10-10T13:00:00Z');
  assert.equal(iso((await scheduler.save({ id: 'k', cron: '45 * * * *', handler: 'job' })).nextRunAt), '2026-10-10T12:45:00Z');
  assert.equal(iso((await scheduler.save({ id: 'k', cron: '45 * * * *', handler: 'job', timeZone: 'Asia/Kolkata' })).nextRunAt), '2026-10-10T13:15:00Z');
  clock.now = at('2026-10-10T13:16:00Z');
  await scheduler.tick();
  assert.equal((await scheduler.runs('k')).length, 1);
  assert.equal(await scheduler.remove('k'), true);
  assert.equal(await scheduler.remove('k'), false);
  assert.equal(store.allRuns().length, 0);
  assert.equal(await scheduler.get('k'), null);
  assert.ok(new SchedulerError('not-found', 'x') instanceof Error);
  assert.throws(() => createScheduler({ store, handlers: {}, instanceId: 'bad id!' }), { code: 'invalid-worker' });
});

test('tick(now) drives time explicitly without a clock', async () => {
  const store = new MemorySchedulerStore();
  const calls = [];
  const scheduler = createScheduler({ store, instanceId: 'w', handlers: { job: ctx => { calls.push(ctx.scheduledFor); } }, now: () => at('2026-10-10T12:00:00Z'), timers: false });
  await scheduler.save({ id: 't', cron: '0 0 * * *', handler: 'job' });
  await scheduler.tick(at('2026-10-11T00:00:05Z'));
  assert.deepEqual(calls.map(iso), ['2026-10-11T00:00:00Z']);
  await assert.rejects(scheduler.tick(Number.NaN), RangeError);
});

// ---------------------------------------------------------------- review fixes

test('a busy queue schedule with a growing backlog cannot starve other schedules (memory store)', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const ranB = [];
  let startedA = 0;
  const handlers = { hang: () => { startedA++; return new Promise(() => {}); }, job: ctx => { ranB.push(ctx.scheduledFor); } };
  const i1 = makeInstance({ store, clock, handlers, id: 'i1' }).scheduler;
  const i2 = makeInstance({ store, clock, handlers, id: 'i2' }).scheduler;
  await i1.save({ id: 'a', cron: '* * * * *', handler: 'hang', overlap: 'queue', leaseMs: 86_400_000 });
  await i1.save({ id: 'b', cron: '* * * * *', handler: 'job', overlap: 'allow' });
  clock.now = at('2026-10-10T12:01:00Z');
  void i1.tick(); // A's first run hangs forever on i1 and keeps its slot.
  await yieldMicrotasks(30);
  assert.equal(startedA, 1);
  for (let minute = 2; minute <= 151; minute++) {
    clock.now = at('2026-10-10T12:00:00Z') + minute * 60_000;
    await i2.tick();
  }
  assert.equal(startedA, 1);
  assert.equal(ranB.length, 151);
  assert.ok(store.allRuns().filter(r => r.scheduleId === 'a' && r.status === 'pending').length >= 150);
});

test('the minimum lease is 3000 ms and a handler lasting several leases executes once while heartbeating', async () => {
  const store = new MemorySchedulerStore();
  const clock = { now: at('2026-10-10T12:00:00Z') };
  const timers = [];
  const fakeTimers = { set: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; }, clear: t => { t.cleared = true; } };
  let executions = 0;
  const gate = deferred();
  const handlers = { job: () => { executions++; return executions === 1 ? gate.promise : undefined; } };
  const a = makeInstance({ store, clock, handlers, id: 'a', timers: fakeTimers }).scheduler;
  const b = makeInstance({ store, clock, handlers, id: 'b', timers: false }).scheduler;
  await assert.rejects(a.save({ id: 'm', cron: '* * * * *', handler: 'job', leaseMs: 2999 }), { code: 'invalid-option' });
  await a.save({ id: 'm', cron: '0 * * * *', handler: 'job', leaseMs: 3000 });
  clock.now = at('2026-10-10T13:00:00Z');
  const tick = a.tick();
  await yieldMicrotasks(30);
  assert.equal(timers.length, 1);
  assert.ok(timers[0].ms < 3000 / 2, 'heartbeat interval must be well inside the lease');
  // 12 seconds (four leases) pass in heartbeat-sized steps; instance b keeps ticking and never reclaims the run.
  for (let elapsed = 0; elapsed < 12_000; elapsed += timers[0].ms) {
    clock.now += timers[0].ms;
    await timers[0].fn();
    assert.equal((await b.tick()).claimed, 0);
  }
  gate.resolve();
  assert.equal((await tick).succeeded, 1);
  assert.equal(executions, 1);
});

test('the payload limit counts UTF-8 bytes of the serialized JSON', async () => {
  const { scheduler } = makeInstance({ store: new MemorySchedulerStore() });
  await assert.rejects(scheduler.save({ id: 'p', cron: '* * * * *', handler: 'job', payload: '€'.repeat(60_000) }), { code: 'invalid-payload' });
  await assert.rejects(scheduler.save({ id: 'p', cron: '* * * * *', handler: 'job', payload: '€'.repeat(21_845) }), { code: 'invalid-payload' });
  assert.equal((await scheduler.save({ id: 'p', cron: '* * * * *', handler: 'job', payload: '€'.repeat(21_844) })).payload.length, 21_844);
});
