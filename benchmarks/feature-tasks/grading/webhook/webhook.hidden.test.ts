import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import { config } from '../../src/config.ts'
import { call, now, reset, tenantPlan } from './helpers.ts'

const SECRET = 'whsec_hidden_test_secret'
beforeEach(() => { reset(); config.billingWebhookSecret = SECRET })
const sig = (payload: string, t = Math.floor(now / 1000), secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`
const event = (id: string, type: string, object: unknown) => JSON.stringify({ id, object: 'event', type, data: { object } })
const send = (payload: string, header?: string) => call('POST', '/webhooks/billing', undefined, payload, { 'content-type': 'application/json', ...(header === undefined ? {} : { 'stripe-signature': header }) })
const completed = (id = 'evt_1', tenant = 'acme') => event(id, 'checkout.session.completed', { id: 'cs_1', client_reference_id: tenant })
const deleted = (id = 'evt_2', tenant = 'acme') => event(id, 'customer.subscription.deleted', { id: 'sub_1', metadata: { tenantId: tenant } })

test('a correctly signed checkout.session.completed upgrades the tenant', async () => {
  const p = completed()
  const r = await send(p, sig(p))
  assert.equal(r.status, 200)
  assert.equal(tenantPlan('acme'), 'pro')
  assert.equal(tenantPlan('globex'), 'free')
})

test('subscription deletion downgrades the tenant', async () => {
  await send(completed(), sig(completed()))
  const p = deleted()
  assert.equal((await send(p, sig(p))).status, 200)
  assert.equal(tenantPlan('acme'), 'free')
})

test('missing, malformed, wrong-secret and tampered signatures are 400 with no change', async () => {
  const p = completed()
  assert.equal((await send(p)).status, 400)
  assert.equal((await send(p, 'garbage')).status, 400)
  assert.equal((await send(p, sig(p, undefined, 'whsec_wrong'))).status, 400)
  assert.equal((await send(p.replace('acme', 'globex'), sig(p))).status, 400)
  const v0 = sig(p).replace('v1=', 'v0=')
  assert.equal((await send(p, v0)).status, 400)
  assert.equal(tenantPlan('acme'), 'free')
  assert.equal(tenantPlan('globex'), 'free')
})

test('timestamps older or newer than 5 minutes are refused', async () => {
  const p = completed()
  const t = Math.floor(now / 1000)
  assert.equal((await send(p, sig(p, t - 301))).status, 400)
  assert.equal((await send(p, sig(p, t + 301))).status, 400)
  assert.equal(tenantPlan('acme'), 'free')
  assert.equal((await send(p, sig(p, t - 299))).status, 200)
  assert.equal(tenantPlan('acme'), 'pro')
})

test('a header with several v1 signatures is accepted when one matches (secret rotation)', async () => {
  const p = completed()
  const t = Math.floor(now / 1000)
  const good = createHmac('sha256', SECRET).update(`${t}.${p}`).digest('hex')
  assert.equal((await send(p, `t=${t},v1=${'0'.repeat(64)},v1=${good}`)).status, 200)
  assert.equal(tenantPlan('acme'), 'pro')
})

test('the signature is checked over the raw body bytes', async () => {
  const p = `{ "id": "evt_raw", "object": "event",\n  "type": "checkout.session.completed", "data": { "object": { "id": "cs_é", "client_reference_id": "acme" } } }`
  assert.equal((await send(p, sig(p))).status, 200)
  assert.equal(tenantPlan('acme'), 'pro')
})

test('each event id takes effect at most once, even when redelivered later', async () => {
  const c = completed('evt_A')
  const d = deleted('evt_B')
  assert.equal((await send(c, sig(c))).status, 200)
  assert.equal((await send(d, sig(d))).status, 200)
  assert.equal(tenantPlan('acme'), 'free')
  const again = await send(c, sig(c))
  assert.equal(again.status, 200, 'duplicates are acknowledged')
  assert.equal(tenantPlan('acme'), 'free', 'the redelivered upgrade does not apply again')
})

test('unknown tenants and other event types are acknowledged without change; bad JSON is 400', async () => {
  const unknown = completed('evt_U', 'nope')
  assert.equal((await send(unknown, sig(unknown))).status, 200)
  const other = event('evt_O', 'invoice.paid', { id: 'in_1' })
  assert.equal((await send(other, sig(other))).status, 200)
  assert.equal(tenantPlan('acme'), 'free')
  const bad = '{not json'
  assert.equal((await send(bad, sig(bad))).status, 400)
})
