import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import { net } from '../../src/net.ts'
import { deliverPending } from '../../src/webhooks.ts'
import { advance, call, now, reset } from './helpers.ts'

type Sent = { url: string; init: RequestInit; headers: Headers; body: string }
let sent: Sent[] = []
let respond: (attempt: number) => Response | Promise<Response> = () => new Response('ok', { status: 200 })
let dns: Record<string, string[]> = {}

beforeEach(() => {
  reset()
  sent = []
  respond = () => new Response('ok', { status: 200 })
  dns = { 'hooks.example.com': ['93.184.216.34'], 'other.example.com': ['93.184.216.35'], 'internal.example.com': ['10.1.2.3'], 'mixed.example.com': ['93.184.216.36', '192.168.0.9'], 'v6.example.com': ['2606:4700::6810:84e5'] }
  net.resolveHost = async (host: string) => { const found = dns[host.replace(/\.$/, '').toLowerCase()]; if (!found) throw new Error('ENOTFOUND ' + host); return found }
  net.httpFetch = async (url: string, init: RequestInit) => {
    sent.push({ url, init, headers: new Headers(init.headers), body: typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array) })
    return respond(sent.length)
  }
})

const register = (url: string, user = 'alice', tenant = 'acme') => call('POST', `/tenants/${tenant}/webhooks`, user, { url, events: ['note.created'] })
const note = (tenant = 'acme', user = 'alice') => call('POST', `/tenants/${tenant}/notes`, user, { title: 'Hello', body: 'World' })

function verify(s: Sent, secret: string) {
  const id = s.headers.get('webhook-id')!, ts = s.headers.get('webhook-timestamp')!
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${s.body}`).digest('base64')
  return (s.headers.get('webhook-signature') ?? '').split(' ').some(part => part === `v1,${expected}`)
}

test('admins register https endpoints and get the secret once; members are refused', async () => {
  const r = await register('https://hooks.example.com/in')
  assert.equal(r.status, 201)
  assert.match(r.json.secret, /^whsec_[A-Za-z0-9+/]+={0,2}$/)
  assert.equal(Buffer.from(r.json.secret.slice(6), 'base64').length, 32)
  const list = await call('GET', '/tenants/acme/webhooks', 'alice')
  assert.equal(list.status, 200)
  assert.equal(list.json.length, 1)
  assert.equal(JSON.stringify(list.json).includes(r.json.secret.slice(6)), false, 'list never shows the secret')
  assert.equal((await register('https://hooks.example.com/x', 'bob')).status, 403)
  assert.equal((await call('GET', '/tenants/acme/webhooks', 'bob')).status, 403)
  assert.equal((await call('GET', '/tenants/acme/webhooks', 'eve')).status, 403)
})

test('URLs that are not https, carry credentials or name a forbidden address are invalid_url', async () => {
  for (const url of ['http://hooks.example.com/', 'https://user:pass@hooks.example.com/', 'https://127.0.0.1/', 'https://10.0.0.1/', 'https://172.16.5.4/', 'https://192.168.1.1/', 'https://169.254.169.254/latest', 'https://100.64.0.1/', 'https://0.0.0.0/', 'https://255.255.255.255/', 'https://224.0.0.1/', 'https://[::1]/', 'https://[::]/', 'https://[fd00::1]/', 'https://[fe80::1]/']) {
    const r = await register(url)
    assert.equal(r.status, 400, url)
    assert.deepEqual(r.json, { error: 'invalid_url' }, url)
  }
})

test('alternate notations of internal addresses are refused too', async () => {
  for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/', 'https://127.1/', 'https://[::ffff:127.0.0.1]/', 'https://[::ffff:10.0.0.1]/', 'https://[0:0:0:0:0:ffff:a9fe:a9fe]/', 'https://[::ffff:c0a8:1]/']) {
    assert.equal((await register(url)).status, 400, url)
  }
})

test('hostnames are resolved: any forbidden address in the answer is refused', async () => {
  assert.equal((await register('https://internal.example.com/')).status, 400)
  assert.equal((await register('https://mixed.example.com/')).status, 400)
  assert.equal((await register('https://hooks.example.com/')).status, 201)
  assert.equal((await register('https://v6.example.com/')).status, 201)
})

test('a new note is delivered once, signed per Standard Webhooks, with the note as data', async () => {
  const { json: hook } = await register('https://hooks.example.com/in')
  const created = await note()
  await deliverPending()
  assert.equal(sent.length, 1)
  const s = sent[0]!
  assert.equal(s.url, 'https://hooks.example.com/in')
  assert.equal(s.init.method, 'POST')
  assert.match(s.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(Number(s.headers.get('webhook-timestamp')), Math.floor(now / 1000))
  assert.ok(verify(s, hook.secret), 'signature verifies with the endpoint secret')
  const body = JSON.parse(s.body)
  assert.equal(body.type, 'note.created')
  assert.equal(body.data.id, created.json.id)
  assert.equal(body.data.title, 'Hello')
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)))
  await deliverPending()
  assert.equal(sent.length, 1, 'a completed delivery is not sent again')
})

test('deliveries go only to the tenant that created the note', async () => {
  await register('https://other.example.com/globex', 'eve', 'globex')
  await register('https://hooks.example.com/acme')
  await note('acme')
  await deliverPending()
  assert.deepEqual(sent.map(s => s.url), ['https://hooks.example.com/acme'])
})

test('failures retry after 30, 60, 120 and 240 seconds with the same webhook-id, then stop', async () => {
  await register('https://hooks.example.com/in')
  respond = () => new Response('nope', { status: 500 })
  await note()
  await deliverPending()
  assert.equal(sent.length, 1)
  for (const wait of [30, 60, 120, 240]) {
    advance(wait * 1000 - 1000); await deliverPending()
    assert.equal(sent.length, [30, 60, 120, 240].indexOf(wait) + 1, `not before ${wait}s`)
    advance(1000); await deliverPending()
    assert.equal(sent.length, [30, 60, 120, 240].indexOf(wait) + 2, `retried at ${wait}s`)
  }
  advance(24 * 3600 * 1000); await deliverPending()
  assert.equal(sent.length, 5, 'dead after 5 attempts')
  assert.equal(new Set(sent.map(s => s.headers.get('webhook-id'))).size, 1)
})

test('network errors count as failures and a later success completes the delivery', async () => {
  await register('https://hooks.example.com/in')
  respond = attempt => { if (attempt === 1) throw new TypeError('fetch failed'); return new Response(null, { status: 204 }) }
  await note()
  await deliverPending()
  advance(30_000); await deliverPending()
  advance(10 * 60_000); await deliverPending()
  assert.equal(sent.length, 2)
  assert.equal(sent[0]!.headers.get('webhook-id'), sent[1]!.headers.get('webhook-id'))
})

test('redirects are not followed and count as failed attempts', async () => {
  await register('https://hooks.example.com/in')
  respond = () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
  await note()
  await deliverPending()
  assert.equal(sent.length, 1)
  assert.ok(sent[0]!.init.redirect === 'manual' || sent[0]!.init.redirect === 'error', 'fetch must not follow redirects')
  respond = () => new Response('ok', { status: 200 })
  advance(30_000); await deliverPending()
  assert.equal(sent.length, 2, 'the redirect was a failure, so the delivery was retried')
})

test('the host is checked again before each attempt (DNS rebinding)', async () => {
  await register('https://hooks.example.com/in')
  dns['hooks.example.com'] = ['10.0.0.5']
  await note()
  await deliverPending()
  assert.equal(sent.length, 0, 'nothing is sent to an address that now resolves internally')
  dns['hooks.example.com'] = ['93.184.216.34']
  advance(30_000); await deliverPending()
  assert.equal(sent.length, 1, 'the failed attempt is retried once the host is public again')
})
