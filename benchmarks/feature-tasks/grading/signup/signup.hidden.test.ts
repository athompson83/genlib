import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import { db } from '../../src/db.ts'
import { mailer, type Mail } from '../../src/mailer.ts'
import { canUseGatedFeature, checkPassword, confirmEmail, resendVerification, signup } from '../../src/signup.ts'
import { advance, dbText, reset } from './helpers.ts'

const PW = 'correct horse battery staple'
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN
let attempts: Mail[] = []
let delivered: Mail[] = []
let fail: (m: Mail, attempt: number) => boolean = () => false

beforeEach(() => {
  reset()
  attempts = []; delivered = []; fail = () => false
  mailer.send = async (m: Mail) => {
    attempts.push({ ...m })
    await new Promise(resolve => setTimeout(resolve, 1))
    if (fail(m, attempts.length)) throw new Error('smtp unavailable')
    delivered.push({ ...m })
  }
})

const tokenOf = (m: Mail) => /https:\/\/teamnotes\.test\/verify\?token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1]
const verifyMails = (to?: string) => delivered.filter(m => tokenOf(m) && (!to || m.to === to))
const lastToken = (to?: string) => { const list = verifyMails(to); return tokenOf(list[list.length - 1]!)! }
const welcomes = () => delivered.filter(m => m.subject === 'Welcome to teamnotes')
const usersWith = (email: string) => [...db.users.values()].filter(u => u.email === email)

function leafStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (value instanceof Map) for (const [k, v] of value) { leafStrings(k, out); leafStrings(v, out) }
  else if (value instanceof Set) for (const v of value) leafStrings(v, out)
  else if (ArrayBuffer.isView(value)) out.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex'))
  else if (value && typeof value === 'object') for (const v of Object.values(value)) leafStrings(v, out)
  return out
}
const counts = (list: string[]) => { const m = new Map<string, number>(); for (const s of list) m.set(s, (m.get(s) ?? 0) + 1); return m }

// validated-email
test('validated-email: malformed addresses are refused and nothing is created or sent', async () => {
  const bad = ['not-an-email', 'a@b', 'a b@x.test', '@x.test', 'a@@x.test', 'a@x..test', 'a@-x.test', 'a@x-.test', '.a@x.test', 'a.@x.test', 'a..b@x.test',
    'x'.repeat(65) + '@x.test', 'a@' + 'x'.repeat(63) + '.' + 'y'.repeat(63) + '.' + 'z'.repeat(63) + '.' + 'w'.repeat(63) + '.test', 'a\n@x.test', '<a@x.test>', 'a@x.test, b@y.test', '']
  for (const email of bad) {
    const r = await signup(email, PW)
    assert.deepEqual(r, { ok: false, error: 'invalid_email' }, JSON.stringify(email))
  }
  assert.equal(db.users.size, 4)
  assert.equal(attempts.length, 0)
  assert.deepEqual(await resendVerification('a@@x.test'), { ok: false, error: 'invalid_email' })
})

test('validated-email: addresses are trimmed and lowercased before they are stored, compared and used', async () => {
  const r = await signup('  Dana.Smith+notes@Example.TEST ', PW)
  assert.equal(r.ok, true)
  const user = db.users.get((r as { userId: string }).userId)!
  assert.equal(user.email, 'dana.smith+notes@example.test')
  assert.equal(user.name, 'dana.smith+notes')
  assert.equal(delivered[0]!.to, 'dana.smith+notes@example.test')
  assert.deepEqual(await signup('dana.smith+notes@example.test', PW), { ok: false, error: 'email_taken' })
  assert.equal(await checkPassword('DANA.SMITH+NOTES@example.test', PW), true)
  assert.deepEqual(await signup('ALICE@acme.test', PW), { ok: false, error: 'email_taken' }, 'seeded users own their addresses')
})

// unique-account
test('unique-account: four concurrent signups with the same normalized email create exactly one account', async () => {
  const results = await Promise.all(['dana@example.test', ' DANA@Example.TEST', 'Dana@example.test ', 'dana@EXAMPLE.test'].map(e => signup(e, PW)))
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.equal(results.filter(r => !r.ok && r.error === 'email_taken').length, 3)
  assert.equal(usersWith('dana@example.test').length, 1)
  assert.equal(verifyMails().length, 1, 'only the winning signup sends a verification email')
})

// password-policy
test('password-policy: length in code points and a blocklist, no composition rules', async () => {
  let n = 0
  const tryPw = (pw: string) => signup(`p${n++}@example.test`, pw)
  for (const pw of ['short12', '🍎🍐🍊🍋🍌🍉🍇', 'password', 'PASSWORD1', 'Passw0rd', '12345678', '123456789', '1234567890', '11111111', 'QWERTY123', 'qwertyuiop', 'iLoveYou', 'abc12345', 'letmein1']) {
    assert.deepEqual(await tryPw(pw), { ok: false, error: 'weak_password' }, pw)
  }
  assert.equal(db.users.size, 4, 'refused passwords create nothing')
  for (const pw of ['lowercaselongphrase', 'ALLUPPERCASEPHRASE', 'eightch8', '🍎🍐🍊🍋🍌🍉🍇🍓', 'the quick brown fox jumps over the lazy dog while seven owls watch'.slice(0, 64), PW]) {
    const r = await tryPw(pw)
    assert.equal(r.ok, true, pw)
  }
})

// password-storage
test('password-storage: only a salted slow hash is stored; same password, different values', async () => {
  const pw = 'Sphinx of black quartz judge'
  const snap0 = counts(leafStrings(db))
  const a = await signup('ann@example.test', pw)
  const snap1 = counts(leafStrings(db))
  const b = await signup('ben@example.test', pw)
  const snap2 = counts(leafStrings(db))
  assert.ok(a.ok && b.ok)
  const text = dbText()
  assert.ok(!text.includes(pw), 'the password is not stored')
  for (const alg of ['md5', 'sha1', 'sha256', 'sha512']) {
    const d = createHash(alg).update(pw).digest()
    assert.ok(!text.includes(d.toString('hex')) && !text.includes(d.toString('base64').replace(/=+$/, '')), `no unsalted ${alg}`)
  }
  // Values added by the first signup must not be added again by the second (an unsalted hash would be).
  const added = (from: Map<string, number>, to: Map<string, number>) => [...to].filter(([s, c]) => s.length >= 16 && c > (from.get(s) ?? 0) && !snap0.has(s)).map(([s]) => s)
  const fromA = new Set(added(snap0, snap1))
  for (const s of added(snap1, snap2)) assert.ok(!fromA.has(s), `the second account repeats a stored value of the first (unsalted?): ${s.slice(0, 40)}`)
  assert.equal(await checkPassword('ann@example.test', pw), true)
  assert.equal(await checkPassword('ann@example.test', pw + '!'), false)
  assert.equal(await checkPassword('nobody@example.test', pw), false)
  assert.equal(await checkPassword('alice@acme.test', pw), false)
  let fastest = Infinity
  for (let i = 0; i < 3; i++) {
    const t = performance.now(); await checkPassword('ann@example.test', 'wrong password here'); fastest = Math.min(fastest, performance.now() - t)
  }
  assert.ok(fastest >= 15, `checking a password should take a slow-hash amount of time (took ${fastest.toFixed(1)} ms)`)
})

// verification-token
test('verification-token: random token in the link, stored only as a hash', async () => {
  await signup('ann@example.test', PW)
  await signup('ben@example.test', PW)
  const t1 = lastToken('ann@example.test'), t2 = lastToken('ben@example.test')
  assert.ok(t1.length >= 22 && t2.length >= 22, 'at least 22 URL-safe characters')
  assert.notEqual(t1, t2)
  const text = dbText()
  assert.ok(!text.includes(t1) && !text.includes(t2), 'the database never holds the raw token')
})

test('verification-token: single use', async () => {
  const r = await signup('ann@example.test', PW) as { userId: string }
  const token = lastToken()
  assert.deepEqual(await confirmEmail(token), { ok: true, userId: r.userId })
  assert.deepEqual(await confirmEmail(token), { ok: false, error: 'invalid_token' })
  assert.deepEqual(await confirmEmail('x'.repeat(43)), { ok: false, error: 'invalid_token' })
  assert.deepEqual(await confirmEmail(''), { ok: false, error: 'invalid_token' })
})

test('verification-token: links expire after 24 hours', async () => {
  const a = await signup('ann@example.test', PW) as { userId: string }
  const ta = lastToken('ann@example.test')
  advance(24 * HOUR - 1)
  assert.equal((await confirmEmail(ta)).ok, true, 'still valid just before 24 hours')
  const b = await signup('ben@example.test', PW) as { userId: string }
  const tb = lastToken('ben@example.test')
  advance(24 * HOUR + 1)
  assert.deepEqual(await confirmEmail(tb), { ok: false, error: 'invalid_token' })
  assert.equal(await canUseGatedFeature(b.userId), false)
  assert.equal(await canUseGatedFeature(a.userId), true)
})

// verification-email
test('verification-email: failed sends are retried with the same idempotency key', async () => {
  fail = (_m, n) => n <= 2
  const r = await signup('ann@example.test', PW)
  assert.equal(r.ok && r.emailSent, true)
  assert.equal(attempts.length, 3)
  assert.ok(attempts[0]!.idempotencyKey, 'a non-empty idempotency key')
  assert.equal(new Set(attempts.map(m => m.idempotencyKey)).size, 1, 'every attempt uses the same key')
  assert.equal(new Set(attempts.map(m => tokenOf(m))).size, 1, 'retries resend the same link')
  assert.equal((await confirmEmail(lastToken())).ok, true)
})

test('verification-email: each new message gets a new key', async () => {
  await signup('ann@example.test', PW)
  advance(61 * SEC)
  await resendVerification('ann@example.test')
  assert.equal(delivered.length, 2)
  assert.notEqual(delivered[0]!.idempotencyKey, delivered[1]!.idempotencyKey)
  await confirmEmail(lastToken())
  const keys = delivered.map(m => m.idempotencyKey)
  assert.equal(new Set(keys).size, keys.length, 'the welcome email has its own key')
})

test('verification-email: after three failed attempts the account exists but that link does not work', async () => {
  fail = () => true
  const r = await signup('ann@example.test', PW)
  assert.equal(r.ok, true)
  assert.equal((r as { emailSent: boolean }).emailSent, false)
  assert.equal(attempts.length, 3, 'three attempts in total')
  assert.equal(usersWith('ann@example.test').length, 1)
  assert.deepEqual(await confirmEmail(tokenOf(attempts[0]!)!), { ok: false, error: 'invalid_token' })
  assert.equal(await canUseGatedFeature((r as { userId: string }).userId), false)
})

// verified-gate
test('verified-gate: unverified accounts are gated until the link is confirmed', async () => {
  const r = await signup('ann@example.test', PW) as { userId: string }
  assert.equal(await canUseGatedFeature(r.userId), false)
  assert.equal(await canUseGatedFeature('alice'), true, 'seeded users count as verified')
  assert.equal(await canUseGatedFeature('nobody'), false)
  await confirmEmail(lastToken())
  assert.equal(await canUseGatedFeature(r.userId), true)
  assert.deepEqual(await resendVerification('ann@example.test'), { ok: true, emailSent: false }, 'verified accounts get no new link')
})

test('verified-gate: four concurrent confirms of one link verify the account exactly once', async () => {
  const r = await signup('ann@example.test', PW) as { userId: string }
  const token = lastToken()
  const results = await Promise.all([1, 2, 3, 4].map(() => confirmEmail(token)))
  assert.equal(results.filter(x => x.ok).length, 1)
  assert.equal(welcomes().length, 1, 'exactly one welcome email')
  assert.equal(welcomes()[0]!.to, 'ann@example.test')
  assert.equal(await canUseGatedFeature(r.userId), true)
})

// resend-limits
test('resend-limits: 60 second cooldown and at most 5 emails per rolling hour', async () => {
  await signup('ann@example.test', PW)
  advance(30 * SEC)
  assert.deepEqual(await resendVerification('ann@example.test'), { ok: false, error: 'rate_limited' })
  assert.equal(delivered.length, 1)
  advance(30 * SEC)
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await resendVerification('Ann@Example.test'), { ok: true, emailSent: true }, `resend ${i + 1}`)
    advance(60 * SEC)
  }
  assert.equal(verifyMails().length, 5)
  assert.deepEqual(await resendVerification('ann@example.test'), { ok: false, error: 'rate_limited' }, 'a sixth email in one hour is refused')
  advance(HOUR - 5 * MIN + 1)
  assert.deepEqual(await resendVerification('ann@example.test'), { ok: true, emailSent: true }, 'allowed once the first email leaves the window')
  assert.deepEqual(await resendVerification('nobody@example.test'), { ok: true, emailSent: false })
})

test('resend-limits: a resend invalidates earlier links; a refused resend keeps the current one', async () => {
  await signup('ann@example.test', PW)
  const first = lastToken()
  advance(61 * SEC)
  await resendVerification('ann@example.test')
  const second = lastToken()
  advance(61 * SEC)
  await resendVerification('ann@example.test')
  const third = lastToken()
  assert.equal(new Set([first, second, third]).size, 3)
  assert.equal((await resendVerification('ann@example.test')).ok, false)
  assert.deepEqual(await confirmEmail(first), { ok: false, error: 'invalid_token' })
  assert.deepEqual(await confirmEmail(second), { ok: false, error: 'invalid_token' })
  assert.equal((await confirmEmail(third)).ok, true)
})

test('resend-limits: concurrent resends cannot exceed the cooldown', async () => {
  await signup('ann@example.test', PW)
  advance(61 * SEC)
  const results = await Promise.all([1, 2, 3, 4].map(() => resendVerification('ann@example.test')))
  assert.equal(results.filter(r => r.ok && r.emailSent).length, 1)
  assert.equal(results.filter(r => !r.ok && r.error === 'rate_limited').length, 3)
  assert.equal(verifyMails().length, 2)
})
