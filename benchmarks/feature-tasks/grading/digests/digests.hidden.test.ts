import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { mailer } from '../../src/mailer.ts'
import { tick } from '../../src/digests.ts'
import { call, reset, setNow } from './helpers.ts'

type Mail = { to: string; subject: string; text: string }
let mails: Mail[] = []
let attempts: Mail[] = []
let failFor: (m: Mail, n: number) => boolean = () => false

beforeEach(() => {
  reset()
  mails = []; attempts = []; failFor = () => false
  mailer.send = async (m: Mail) => {
    attempts.push(m)
    await new Promise(resolve => setTimeout(resolve, 2))
    if (failFor(m, attempts.filter(a => a.to === m.to).length)) throw new Error('smtp down')
    mails.push(m)
  }
})

const at = (iso: string) => setNow(Date.parse(iso))
const setDigest = (time: string, timeZone = 'America/New_York', user = 'alice') => call('PUT', '/tenants/acme/digest', user, { time, timeZone })
const to = () => mails.map(m => m.to).sort()

test('admins set a valid digest time; members and bad input are refused', async () => {
  at('2026-06-01T12:00:00Z')
  assert.equal((await setDigest('09:00', 'America/New_York', 'bob')).status, 403)
  for (const [time, zone] of [['25:00', 'UTC'], ['9:5', 'UTC'], ['09:60', 'UTC'], ['09:00', 'Mars/Olympus'], ['', 'UTC']]) {
    const r = await setDigest(time!, zone)
    assert.equal(r.status, 400, `${time} ${zone}`)
    assert.deepEqual(r.json, { error: 'invalid_digest' })
  }
  const ok = await setDigest('09:00')
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.json, { time: '09:00', timeZone: 'America/New_York' })
})

test('the digest goes to every member at the wall-clock time in its zone, once a day', async () => {
  at('2026-06-01T12:00:00Z')
  await setDigest('09:00')
  at('2026-06-01T12:59:00Z'); await tick()
  assert.equal(mails.length, 0, '08:59 EDT is too early')
  at('2026-06-01T13:00:00Z'); await tick()
  assert.deepEqual(to(), ['alice@acme.test', 'bob@acme.test'])
  assert.equal(mails[0]!.subject, 'Daily digest for Acme')
  at('2026-06-01T20:00:00Z'); await tick()
  assert.equal(mails.length, 2, 'not twice on one day')
  at('2026-06-02T13:00:30Z'); await tick()
  assert.equal(mails.length, 4, 'again the next day')
})

test('each digest lists the notes created since the previous one', async () => {
  at('2026-06-01T12:00:00Z')
  await setDigest('09:00')
  await call('POST', '/tenants/acme/notes', 'alice', { title: 'First note', body: 'x' })
  at('2026-06-01T13:00:00Z'); await tick()
  assert.match(mails[0]!.text, /First note/)
  at('2026-06-01T15:00:00Z')
  await call('POST', '/tenants/acme/notes', 'bob', { title: 'Second note', body: 'y' })
  at('2026-06-02T13:00:00Z'); await tick()
  const second = mails.slice(2)
  assert.ok(second.length === 2 && second.every(m => /Second note/.test(m.text) && !/First note/.test(m.text)))
})

test('overlapping tick calls send each email exactly once', async () => {
  at('2026-06-01T12:00:00Z')
  await setDigest('09:00')
  at('2026-06-01T13:00:00Z')
  await Promise.all([tick(), tick(), tick(), tick()])
  assert.deepEqual(to(), ['alice@acme.test', 'bob@acme.test'])
})

test('spring forward: a time inside the skipped hour is sent once, right after the gap', async () => {
  at('2026-03-07T12:00:00Z')
  await setDigest('02:30')
  at('2026-03-08T06:59:00Z'); await tick()
  assert.equal(mails.length, 0, '01:59 EST is before the gap')
  at('2026-03-08T07:00:00Z'); await tick()
  assert.equal(mails.length, 2, '03:00 EDT is the first instant after the gap')
  at('2026-03-08T08:30:00Z'); await tick()
  assert.equal(mails.length, 2)
})

test('fall back: a time that occurs twice is sent once, at its first occurrence', async () => {
  at('2026-10-31T12:00:00Z')
  await setDigest('01:30')
  at('2026-11-01T05:29:00Z'); await tick()
  assert.equal(mails.length, 0)
  at('2026-11-01T05:30:00Z'); await tick()
  assert.equal(mails.length, 2, '01:30 EDT')
  at('2026-11-01T06:30:00Z'); await tick()
  at('2026-11-01T06:45:00Z'); await tick()
  assert.equal(mails.length, 2, 'not again at 01:30 EST')
})

test('after downtime only the most recent missed digest is sent', async () => {
  at('2026-06-01T12:00:00Z')
  await setDigest('09:00')
  at('2026-06-04T15:00:00Z'); await tick()
  assert.deepEqual(to(), ['alice@acme.test', 'bob@acme.test'])
  at('2026-06-04T16:00:00Z'); await tick()
  assert.equal(mails.length, 2)
})

test('a failed send is retried on later ticks without resending to others, at most 3 attempts', async () => {
  at('2026-06-01T12:00:00Z')
  await setDigest('09:00')
  failFor = (m, n) => m.to === 'bob@acme.test' && n === 1
  at('2026-06-01T13:00:00Z'); await tick()
  assert.deepEqual(to(), ['alice@acme.test'])
  at('2026-06-01T13:01:00Z'); await tick()
  assert.deepEqual(to(), ['alice@acme.test', 'bob@acme.test'])
  assert.equal(attempts.filter(a => a.to === 'alice@acme.test').length, 1)

  failFor = m => m.to === 'bob@acme.test'
  at('2026-06-02T13:00:00Z'); await tick()
  for (let minute = 1; minute <= 6; minute++) { at(`2026-06-02T13:0${minute}:00Z`); await tick() }
  assert.equal(attempts.filter(a => a.to === 'bob@acme.test').length - 2, 3, 'three attempts for the failing digest, then no more')
  assert.equal(attempts.filter(a => a.to === 'alice@acme.test').length, 2)
})
