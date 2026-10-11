import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { advance, call, dbText, isMember, reset } from './helpers.ts'

const DAY = 86_400_000
beforeEach(reset)
const invite = (email = 'carol@example.test', role = 'member', by = 'alice', tenant = 'acme') => call('POST', `/tenants/${tenant}/invitations`, by, { email, role })

test('admin creates an invitation and receives the token once', async () => {
  const r = await invite()
  assert.equal(r.status, 201)
  assert.equal(r.json.email.toLowerCase(), 'carol@example.test')
  assert.equal(r.json.role, 'member')
  assert.equal(typeof r.json.token, 'string')
  assert.ok(r.json.token.length >= 20, 'token has enough length for entropy')
  assert.ok(r.json.id)
  const list = await call('GET', '/tenants/acme/invitations', 'alice')
  assert.equal(list.status, 200)
  assert.equal(list.json.length, 1)
  assert.ok(!JSON.stringify(list.json).includes(r.json.token), 'list never shows the token')
})

test('only admins of that tenant can invite; input is validated', async () => {
  assert.equal((await invite(undefined, undefined, 'bob')).status, 403)
  assert.equal((await invite(undefined, undefined, 'eve')).status, 403)
  assert.equal((await call('POST', '/tenants/acme/invitations', undefined, { email: 'x@y.test', role: 'member' })).status, 401)
  assert.equal((await invite('carol@example.test', 'owner')).status, 400)
  assert.equal((await invite('not-an-email')).status, 400)
  assert.equal((await call('GET', '/tenants/acme/invitations', 'bob')).status, 403)
})

test('the invitee accepts once and joins with the role', async () => {
  const { json } = await invite('Carol@Example.test', 'admin')
  const ok = await call('POST', '/invitations/accept', 'carol', { token: json.token })
  assert.equal(ok.status, 200)
  assert.deepEqual({ tenantId: ok.json.tenantId, role: ok.json.role }, { tenantId: 'acme', role: 'admin' })
  assert.ok(isMember('carol', 'acme'))
  assert.equal((await call('GET', '/tenants/acme/notes', 'carol')).status, 200)
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: json.token })).status, 410)
  assert.equal((await call('GET', '/tenants/acme/invitations', 'alice')).json.length, 0, 'accepted invitations are no longer pending')
})

test('a different signed-in user cannot use the invitation, and does not consume it', async () => {
  const { json } = await invite()
  assert.equal((await call('POST', '/invitations/accept', undefined, { token: json.token })).status, 401)
  assert.equal((await call('POST', '/invitations/accept', 'eve', { token: json.token })).status, 403)
  assert.equal(isMember('eve', 'acme'), false)
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: json.token })).status, 200)
})

test('invitations expire after 7 days', async () => {
  const a = (await invite()).json
  advance(7 * DAY - 1)
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: a.token })).status, 200)
  const b = (await call('POST', '/tenants/globex/invitations', 'eve', { email: 'carol@example.test', role: 'member' })).json
  advance(7 * DAY + 1)
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: b.token })).status, 410)
  assert.equal(isMember('carol', 'globex'), false)
})

test('revoked invitations cannot be accepted; only that tenant admin can revoke', async () => {
  const { json } = await invite()
  assert.ok([403, 404].includes((await call('DELETE', `/tenants/globex/invitations/${json.id}`, 'eve')).status))
  assert.equal((await call('DELETE', `/tenants/acme/invitations/${json.id}`, 'bob')).status, 403)
  assert.equal((await call('DELETE', `/tenants/acme/invitations/${json.id}`, 'alice')).status, 204)
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: json.token })).status, 410)
  assert.equal((await call('GET', '/tenants/acme/invitations', 'alice')).json.length, 0)
})

test('unknown tokens are 404 and existing members get 409', async () => {
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: 'x'.repeat(43) })).status, 404)
  const created = await invite('bob@acme.test')
  if (created.status === 409) return // refusing to invite an existing member is also acceptable
  assert.equal((await call('POST', '/invitations/accept', 'bob', { token: created.json.token })).status, 409)
})

test('the token is not stored in plaintext', async () => {
  const { json } = await invite()
  assert.ok(!dbText().includes(json.token), 'the database holds a hash, not the token')
})

test('an invitation joins only its own tenant', async () => {
  const { json } = await call('POST', '/tenants/globex/invitations', 'eve', { email: 'carol@example.test', role: 'member' })
  assert.equal((await call('POST', '/invitations/accept', 'carol', { token: json.token })).status, 200)
  assert.ok(isMember('carol', 'globex'))
  assert.equal(isMember('carol', 'acme'), false)
  assert.equal((await call('GET', '/tenants/acme/notes', 'carol')).status, 403)
})
