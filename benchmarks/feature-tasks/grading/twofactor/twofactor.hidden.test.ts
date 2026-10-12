import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import { config } from '../../src/config.ts'
import { securityLog, type SecurityEvent } from '../../src/security-log.ts'
import {
  beginEnrollment, confirmEnrollment, disableTwoFactor, isTwoFactorEnabled, markReauthenticated,
  regenerateRecoveryCodes, verifyRecoveryCode, verifyTwoFactor,
} from '../../src/twofactor.ts'
import { advance, dbText, now, reset } from './helpers.ts'

const SEC = 1000, MIN = 60 * SEC
const KEY = config.twoFactorEncryptionKey, PEPPER = config.recoveryCodePepper
let events: SecurityEvent[] = []

beforeEach(() => {
  reset()
  config.twoFactorEncryptionKey = KEY; config.recoveryCodePepper = PEPPER
  events = []
  securityLog.record = async (e: SecurityEvent) => { await new Promise(resolve => setTimeout(resolve, 1)); events.push({ ...e }) }
})

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0; const out: number[] = []
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = alphabet.indexOf(ch); if (i < 0) throw new Error('not base32: ' + ch)
    value = (value << 5) | i; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}
function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', key).update(msg).digest()
  const o = h[h.length - 1]! & 0xf
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(bin % 10 ** digits).padStart(digits, '0')
}
const step = (ms = now) => Math.floor(ms / 30_000)
const code = (secret: string, offset = 0) => hotp(base32Decode(secret), step() + offset)
/** Six digits that are not a valid code for any step in the window. */
function wrongCode(secret: string, seed = 0): string {
  const valid = new Set([-1, 0, 1].map(o => code(secret, o)))
  for (let n = 123457 + seed * 7919; ; n = (n + 1) % 1_000_000) { const c = String(n).padStart(6, '0'); if (!valid.has(c)) return c }
}

async function enroll(userId = 'alice') {
  const begun = await beginEnrollment(userId)
  assert.equal(begun.ok, true)
  const { secret } = begun as { secret: string }
  const confirmed = await confirmEnrollment(userId, code(secret))
  assert.equal(confirmed.ok, true)
  advance(30 * SEC) // the confirmation step is used up
  return { secret, recoveryCodes: (confirmed as { recoveryCodes: string[] }).recoveryCodes }
}
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64')

test('the test TOTP helper matches RFC 6238 Appendix B', () => {
  const key = Buffer.from('12345678901234567890')
  assert.equal(hotp(key, Math.floor(59 / 30), 8), '94287082')
  assert.equal(hotp(key, Math.floor(1111111109 / 30), 8), '07081804')
  assert.equal(hotp(key, Math.floor(20000000000 / 30), 8), '65353130')
})

// secret-provisioning
test('secret-provisioning: a 160-bit base32 secret and an otpauth URI', async () => {
  const a = await beginEnrollment('alice') as { ok: true; secret: string; otpauthUri: string }
  const b = await beginEnrollment('bob') as { ok: true; secret: string; otpauthUri: string }
  assert.equal(a.ok, true)
  assert.match(a.secret, /^[A-Z2-7]+$/, 'RFC 4648 base32, upper case, no padding')
  assert.ok(base32Decode(a.secret).length >= 20, 'at least 160 bits')
  assert.notEqual(a.secret, b.secret)
  const uri = new URL(a.otpauthUri)
  assert.equal(uri.protocol, 'otpauth:')
  assert.equal(uri.host, 'totp')
  assert.equal(decodeURIComponent(uri.pathname.slice(1)), 'Teamnotes:alice@acme.test')
  assert.equal(uri.searchParams.get('secret'), a.secret)
  assert.equal(uri.searchParams.get('issuer'), 'Teamnotes')
  for (const [k, v] of [['algorithm', 'SHA1'], ['digits', '6'], ['period', '30']]) {
    const got = uri.searchParams.get(k!)
    assert.ok(got === null || got.toUpperCase() === v, `${k}=${got}`)
  }
  assert.deepEqual(await beginEnrollment('nobody'), { ok: false, error: 'unknown_user' })
})

// confirm-enrollment
test('confirm-enrollment: required only after a valid code for the pending secret', async () => {
  const first = await beginEnrollment('alice') as { secret: string }
  assert.equal(await isTwoFactorEnabled('alice'), false)
  assert.deepEqual(await verifyTwoFactor('alice', code(first.secret)), { ok: false, error: 'not_enabled' })
  const second = await beginEnrollment('alice') as { secret: string }
  assert.notEqual(first.secret, second.secret)
  assert.deepEqual(await confirmEnrollment('alice', code(first.secret)), { ok: false, error: 'invalid_code' }, 'the replaced pending secret no longer works')
  assert.deepEqual(await confirmEnrollment('alice', wrongCode(second.secret)), { ok: false, error: 'invalid_code' })
  assert.equal(await isTwoFactorEnabled('alice'), false)
  assert.deepEqual(await confirmEnrollment('bob', '123456'), { ok: false, error: 'no_enrollment' })
  const ok = await confirmEnrollment('alice', code(second.secret))
  assert.equal(ok.ok, true)
  assert.equal(await isTwoFactorEnabled('alice'), true)
  assert.equal(await isTwoFactorEnabled('bob'), false)
  assert.ok(events.some(e => e.userId === 'alice' && e.ok === true), 'the accepted confirmation is logged')
  assert.ok(events.some(e => e.userId === 'alice' && e.ok === false), 'the refused confirmation is logged')
})

// code-verification
test('code-verification: the current step and one step of skew either way, nothing further', async () => {
  const { secret } = await enroll()
  advance(60 * SEC)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, -2)), { ok: false, error: 'invalid_code' })
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, 2)), { ok: false, error: 'invalid_code' })
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, -1)), { ok: true })
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, 0)), { ok: true })
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, 1)), { ok: true })
  assert.ok(events.some(e => e.userId === 'alice' && e.ok === false) && events.some(e => e.userId === 'alice' && e.ok === true), 'checks are logged')
})

test('code-verification: malformed codes fail', async () => {
  const { secret } = await enroll()
  const good = () => code(secret)
  const bad = () => [`${good()}0`, `0${good()}`, good().slice(0, 5), `${good()}x`, `-${good().slice(1)}`, good().replace(/\d/g, d => String.fromCharCode(0xff10 + Number(d))), '', 'abcdef']
  const n = bad().length
  for (let i = 0; i < n; i++) {
    assert.deepEqual(await verifyTwoFactor('alice', bad()[i]!), { ok: false, error: 'invalid_code' }, JSON.stringify(bad()[i]))
    if (i % 4 === 3) { advance(30 * SEC); assert.deepEqual(await verifyTwoFactor('alice', good()), { ok: true }) }
  }
})

// replay-protection
test('replay-protection: an accepted step cannot be used again, nor an earlier step in the window', async () => {
  const { secret } = await enroll()
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, -1)), { ok: false, error: 'invalid_code' }, 'the step that confirmed enrollment is used')
  const current = code(secret)
  assert.deepEqual(await verifyTwoFactor('alice', current), { ok: true })
  assert.deepEqual(await verifyTwoFactor('alice', current), { ok: false, error: 'invalid_code' })
  advance(30 * SEC)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, 1)), { ok: true })
  assert.deepEqual(await verifyTwoFactor('alice', code(secret, 0)), { ok: false, error: 'invalid_code' }, 'an earlier step after a later one')
})

test('replay-protection: of four concurrent verifies of one code exactly one wins', async () => {
  const { secret } = await enroll()
  const c = code(secret)
  const results = await Promise.all([1, 2, 3, 4].map(() => verifyTwoFactor('alice', c)))
  assert.equal(results.filter(r => r.ok).length, 1)
})

test('replay-protection: a recovery code works once, also under concurrency', async () => {
  const { recoveryCodes } = await enroll()
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[0]!), { ok: true })
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[0]!), { ok: false, error: 'invalid_code' })
  const results = await Promise.all([1, 2, 3, 4].map(() => verifyRecoveryCode('alice', recoveryCodes[1]!)))
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[2]!), { ok: true }, 'other codes still work')
})

// attempt-limits
test('attempt-limits: five failures lock the account for 15 minutes, even for a correct code', async () => {
  const bob = await enroll('bob')
  const { secret } = await enroll()
  const wrong = () => wrongCode(secret)
  for (let i = 0; i < 5; i++) assert.deepEqual(await verifyTwoFactor('alice', wrong()), { ok: false, error: 'invalid_code' }, `failure ${i + 1}`)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: false, error: 'locked' })
  advance(15 * MIN - SEC)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: false, error: 'locked' }, 'still locked; attempts do not extend the lock')
  assert.deepEqual(await verifyTwoFactor('bob', code(bob.secret)), { ok: true }, 'the lock is per account')
  advance(SEC)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: true }, 'unlocked after 15 minutes')
  for (let i = 0; i < 4; i++) await verifyTwoFactor('alice', wrong())
  advance(30 * SEC)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: true }, 'a success resets the count')
  for (let i = 0; i < 4; i++) assert.deepEqual(await verifyTwoFactor('alice', wrong()), { ok: false, error: 'invalid_code' })
})

test('attempt-limits: the recovery-code path shares the same per-account count', async () => {
  const { secret, recoveryCodes } = await enroll()
  for (let i = 0; i < 3; i++) await verifyTwoFactor('alice', wrongCode(secret))
  for (let i = 0; i < 2; i++) assert.deepEqual(await verifyRecoveryCode('alice', 'WRONG-CODE-' + i), { ok: false, error: 'invalid_code' })
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[0]!), { ok: false, error: 'locked' })
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: false, error: 'locked' })
  advance(15 * MIN)
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[0]!), { ok: true }, 'the locked attempt did not use up the code')
})

test('attempt-limits: concurrent wrong guesses cannot exceed the limit', async () => {
  const { secret } = await enroll()
  const good = code(secret)
  const guesses = Array.from({ length: 12 }, (_, i) => wrongCode(secret, i + 1))
  const results = await Promise.all(guesses.map(g => verifyTwoFactor('alice', g)))
  assert.ok(results.every(r => !r.ok))
  const checked = results.filter(r => !r.ok && r.error === 'invalid_code').length
  assert.ok(checked <= 5, `${checked} guesses were checked`)
  assert.equal(results.filter(r => !r.ok && r.error === 'locked').length, 12 - checked)
  assert.deepEqual(await verifyTwoFactor('alice', good), { ok: false, error: 'locked' })
})

// secret-protection
test('secret-protection: the secret is stored only encrypted and never returned after enrollment', async () => {
  const begun = await beginEnrollment('alice') as { secret: string }
  const raw = base32Decode(begun.secret)
  const leaks = (text: string) => [begun.secret, begun.secret.toLowerCase(), raw.toString('hex'), raw.toString('base64').replace(/=+$/, ''), raw.toString('base64url')].some(s => text.includes(s))
  assert.ok(!leaks(dbText()), 'the pending secret is encrypted at rest')
  const confirmed = await confirmEnrollment('alice', code(begun.secret))
  assert.ok(!leaks(dbText()), 'the confirmed secret is encrypted at rest')
  advance(30 * SEC)
  const outputs = [confirmed, await verifyTwoFactor('alice', code(begun.secret)), await beginEnrollment('alice')]
  await markReauthenticated('alice')
  outputs.push(await regenerateRecoveryCodes('alice'))
  assert.ok(!leaks(JSON.stringify(outputs)), 'no later output contains the secret')
  assert.deepEqual(outputs[2], { ok: false, error: 'already_enabled' })
})

test('secret-protection: verification depends on the encryption key', async () => {
  const { secret } = await enroll()
  config.twoFactorEncryptionKey = OTHER_KEY
  let result: unknown
  try { result = await verifyTwoFactor('alice', code(secret)) } catch (error) { result = { thrown: String(error) } }
  assert.notDeepEqual(result, { ok: true }, 'a different key must not decrypt the secret')
  config.twoFactorEncryptionKey = KEY
  advance(30 * SEC)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: true })
})

// recovery-codes
test('recovery-codes: ten random codes, stored only as keyed hashes', async () => {
  const { recoveryCodes: a } = await enroll('alice')
  const { recoveryCodes: b } = await enroll('bob')
  assert.equal(a.length, 10)
  assert.equal(new Set(a).size, 10)
  assert.ok(a.every(c => typeof c === 'string' && c.length >= 10))
  assert.equal(new Set([...a, ...b]).size, 20)
  const text = dbText()
  for (const c of a) {
    for (const v of new Set([c, c.toUpperCase(), c.toLowerCase(), c.replace(/[-\s]/g, ''), c.replace(/[-\s]/g, '').toUpperCase(), c.replace(/[-\s]/g, '').toLowerCase()])) {
      const d = createHash('sha256').update(v).digest()
      assert.ok(!text.includes(v) && !text.includes(d.toString('hex')) && !text.includes(d.toString('base64').replace(/=+$/, '')), 'no plaintext or unkeyed digest')
    }
  }
  assert.deepEqual(await verifyRecoveryCode('alice', b[0]!), { ok: false, error: 'invalid_code' }, "another user's code does not work")
})

test('recovery-codes: regeneration replaces every earlier code', async () => {
  const { recoveryCodes: old } = await enroll()
  await markReauthenticated('alice')
  const r = await regenerateRecoveryCodes('alice') as { ok: true; recoveryCodes: string[] }
  assert.equal(r.ok, true)
  assert.equal(r.recoveryCodes.length, 10)
  assert.equal(r.recoveryCodes.filter(c => old.includes(c)).length, 0)
  assert.deepEqual(await verifyRecoveryCode('alice', old[3]!), { ok: false, error: 'invalid_code' })
  assert.deepEqual(await verifyRecoveryCode('alice', r.recoveryCodes[3]!), { ok: true })
})

// step-up
test('step-up: disabling and regenerating require re-authentication within 10 minutes', async () => {
  const { secret, recoveryCodes } = await enroll()
  assert.deepEqual(await disableTwoFactor('alice'), { ok: false, error: 'reauth_required' })
  assert.deepEqual(await regenerateRecoveryCodes('alice'), { ok: false, error: 'reauth_required' })
  await markReauthenticated('alice')
  advance(10 * MIN + SEC)
  assert.deepEqual(await disableTwoFactor('alice'), { ok: false, error: 'reauth_required' })
  assert.deepEqual(await regenerateRecoveryCodes('alice'), { ok: false, error: 'reauth_required' })
  assert.equal(await isTwoFactorEnabled('alice'), true)
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[0]!), { ok: true }, 'refused regeneration changed nothing')
  await markReauthenticated('bob')
  assert.deepEqual(await disableTwoFactor('alice'), { ok: false, error: 'reauth_required' }, "another user's re-authentication does not count")
  await markReauthenticated('alice')
  advance(10 * MIN - SEC)
  assert.deepEqual(await disableTwoFactor('alice'), { ok: true })
  assert.equal(await isTwoFactorEnabled('alice'), false)
  assert.deepEqual(await verifyTwoFactor('alice', code(secret)), { ok: false, error: 'not_enabled' })
  assert.deepEqual(await verifyRecoveryCode('alice', recoveryCodes[1]!), { ok: false, error: 'not_enabled' })
  assert.deepEqual(await disableTwoFactor('alice'), { ok: false, error: 'not_enabled' })
  const again = await beginEnrollment('alice') as { ok: true; secret: string }
  assert.equal(again.ok, true)
  assert.notEqual(again.secret, secret, 'enrolling again starts with a new secret')
})
