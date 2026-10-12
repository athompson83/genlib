import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { beforeEach, test } from 'node:test'
import { blobs } from '../../src/blobs.ts'
import { config } from '../../src/config.ts'
import { scanner } from '../../src/scanner.ts'
import { handle } from '../../src/server.ts'
import { preflight } from '../../src/upload-preflight.ts'
import { processScans } from '../../src/uploads.ts'
import { reset } from './helpers.ts'

const KB = 1024, MB = 1024 * KB
const store = new Map<string, Uint8Array>()
let puts: string[] = [], deletes: string[] = [], scans: Uint8Array[] = []
let putDelay = 0
let failPut: (key: string) => boolean = () => false
let verdict: (bytes: Uint8Array, n: number) => 'clean' | 'infected' | Promise<'clean' | 'infected'> = () => 'clean'

beforeEach(() => {
  reset()
  config.maxUploadBytes = 1 * MB
  config.tenantQuotaBytes = 10 * MB
  store.clear(); puts = []; deletes = []; scans = []; putDelay = 0; failPut = () => false; verdict = () => 'clean'
  blobs.put = async (key: string, bytes: Uint8Array) => {
    puts.push(key)
    await new Promise(resolve => setTimeout(resolve, putDelay))
    if (failPut(key)) throw new Error('storage unavailable')
    store.set(key, new Uint8Array(bytes))
  }
  blobs.get = async (key: string) => store.get(key)
  blobs.delete = async (key: string) => { deletes.push(key); store.delete(key) }
  scanner.scan = async (bytes: Uint8Array) => { scans.push(bytes); await new Promise(resolve => setTimeout(resolve, 2)); return verdict(bytes, scans.length) }
})

const bytes = (...parts: (string | number[] | Uint8Array)[]) => {
  const chunks = parts.map(p => typeof p === 'string' ? new TextEncoder().encode(p) : Uint8Array.from(p))
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
const pad = (head: Uint8Array, size: number) => { const out = new Uint8Array(size); out.set(head); return out }
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], 'IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], 'JFIF', [0])
const GIF = bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0])
const PDF = bytes('%PDF-1.7\n%\xe2\xe3\n1 0 obj\n<<>>\nendobj\n')
const TEXT = bytes('Meeting notes\n\t- ship uploads\r\n')
const HTML = bytes('<!DOCTYPE html><html><script>alert(1)</script></html>')
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
const EXE = bytes('MZ', [0x90, 0, 3, 0, 0, 0, 4, 0])

function request(method: string, path: string, user?: string, body?: BodyInit, headers: Record<string, string> = {}) {
  const init: RequestInit & { duplex?: 'half' } = { method, headers: { ...(user ? { authorization: `Bearer session:${user}` } : {}), ...headers } }
  if (body !== undefined) { init.body = body; if (body instanceof ReadableStream) init.duplex = 'half' }
  return handle(new Request('http://app.test' + path, init))
}
async function upload(name: string | null, data: Uint8Array | ReadableStream, user = 'bob', tenant = 'acme', headers: Record<string, string> = {}) {
  const q = name === null ? '' : `?name=${encodeURIComponent(name)}`
  const res = await request('POST', `/tenants/${tenant}/files${q}`, user, data as BodyInit, { 'content-type': 'application/octet-stream', ...headers })
  const text = await res.text(); let json: any; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}
const download = (id: string, user = 'bob', tenant = 'acme') => request('GET', `/tenants/${tenant}/files/${id}`, user)
const status = async (id: string, user = 'bob', tenant = 'acme') => { const r = await download(id, user, tenant); await r.arrayBuffer(); return r.status }

/** An endless 64 KiB-chunk stream that counts how many bytes the server pulled. */
function counter(totalLimit = 64 * MB) {
  const state = { pulled: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>({
    pull(c) { if (state.pulled >= totalLimit) { c.close(); return } state.pulled += 64 * KB; c.enqueue(new Uint8Array(64 * KB).fill(0x41)) },
    cancel() { state.cancelled = true },
  }, { highWaterMark: 0 })
  return { stream, state }
}

// server-size-limit
test('server-size-limit: a declared Content-Length over the limit is refused before the body is read', async () => {
  const { stream, state } = counter()
  const r = await upload('big.txt', stream, 'bob', 'acme', { 'content-length': String(5 * MB) })
  assert.equal(r.status, 413)
  assert.deepEqual(r.json, { error: 'too_large' })
  assert.ok(state.pulled <= 64 * KB, `read ${state.pulled} bytes of a body declared too large`)
  assert.equal(puts.length, 0)
})

test('server-size-limit: streamed bodies are cut off at the limit without buffering them', async () => {
  const { stream, state } = counter()
  const r = await upload('stream.txt', stream)
  assert.equal(r.status, 413)
  assert.ok(state.pulled <= config.maxUploadBytes + 2 * 64 * KB, `pulled ${state.pulled} bytes for a ${config.maxUploadBytes}-byte limit`)
  assert.equal(puts.length, 0)
  const lying = counter()
  const r2 = await upload('lying.txt', lying.stream, 'bob', 'acme', { 'content-length': '10' })
  assert.equal(r2.status, 413, 'a small declared length does not excuse a large body')
  assert.ok(lying.state.pulled <= config.maxUploadBytes + 2 * 64 * KB)
})

test('server-size-limit: exactly the limit is accepted, one byte more is not', async () => {
  config.maxUploadBytes = 64 * KB
  assert.equal((await upload('a.png', pad(PNG, 64 * KB))).status, 201)
  const r = await upload('b.png', pad(PNG, 64 * KB + 1))
  assert.equal(r.status, 413)
  assert.deepEqual(r.json, { error: 'too_large' })
})

// content-sniffing
test('content-sniffing: the type comes from the bytes, never from the declared Content-Type', async () => {
  for (const [name, data, type] of [['p.png', PNG, 'image/png'], ['j.jpg', JPEG, 'image/jpeg'], ['j2.JPEG', JPEG, 'image/jpeg'], ['g.gif', GIF, 'image/gif'], ['d.pdf', PDF, 'application/pdf'], ['t.txt', TEXT, 'text/plain'], ['bom.txt', bytes([0xef, 0xbb, 0xbf], 'héllo wörld'), 'text/plain']] as const) {
    const r = await upload(name, data, 'bob', 'acme', { 'content-type': 'text/html' })
    assert.equal(r.status, 201, name)
    assert.equal(r.json.type, type, name)
    assert.equal(r.json.size, data.length)
    assert.equal(r.json.status, 'quarantined')
  }
  const declared = await upload('fake.png', HTML, 'bob', 'acme', { 'content-type': 'image/png' })
  assert.equal(declared.status, 415, 'markup declared as image/png is refused')
})

// type-allowlist
test('type-allowlist: unlisted types and extension mismatches are refused', async () => {
  const cases: [string, Uint8Array][] = [['page.html', HTML], ['page.txt', HTML], ['icon.svg', SVG], ['icon.txt', SVG], ['icon.png', SVG], ['setup.exe', EXE], ['setup.txt', EXE], ['photo.txt', PNG], ['photo.jpg', PNG], ['doc.png', PDF], ['noext', TEXT],
    ['xml.txt', bytes('  <?xml version="1.0"?><svg/>')], ['zero.txt', bytes('a\u0000b')], ['ctl.txt', bytes('bell\u0007')], ['bad-utf8.txt', bytes([0x68, 0xc3, 0x28])], ['script.txt', bytes('\n  <script>alert(1)</script>')]]
  for (const [name, data] of cases) {
    const r = await upload(name, data)
    assert.equal(r.status, 415, name)
    assert.deepEqual(r.json, { error: 'unsupported_type' }, name)
  }
  assert.equal(puts.length, 0, 'refused files are not stored')
  assert.equal((await upload('heart.txt', bytes('<3 uploads'))).status, 201, '< that is not markup is fine')
})

// safe-filename
test('safe-filename: traversal, control and bidi characters are removed and the length is capped', async () => {
  const cases: [string, string][] = [['../../etc/passwd.txt', 'passwd.txt'], ['..\\..\\windows\\win.txt', 'win.txt'], ['a\u0000b\u0007c.txt', 'abc.txt'], ['note‮gpj.txt', 'notegpj.txt'], ['⁦x⁩.txt', 'x.txt'], ['...hidden.txt', 'hidden.txt'], ['trail.txt. . ', 'trail.txt']]
  for (const [input, expected] of cases) {
    const r = await upload(input, TEXT)
    assert.equal(r.status, 201, JSON.stringify(input))
    assert.equal(r.json.name, expected, JSON.stringify(input))
  }
  const long = await upload('x'.repeat(300) + '.txt', TEXT)
  assert.equal(long.status, 201)
  assert.ok(long.json.name.length <= 255 && long.json.name.endsWith('.txt') && long.json.name.startsWith('xxx'))
})

test('safe-filename: reserved and empty names are invalid_name', async () => {
  for (const name of ['CON.txt', 'nul.txt', 'Com1.txt', 'LPT9.txt', 'aux.tar.txt', 'prn', '..', '/', ' . ', '']) {
    const r = await upload(name, TEXT)
    assert.equal(r.status, 400, JSON.stringify(name))
    assert.deepEqual(r.json, { error: 'invalid_name' }, JSON.stringify(name))
  }
  assert.equal((await upload(null, TEXT)).status, 400, 'a missing name')
  assert.equal((await upload('console.txt', TEXT)).status, 201, 'names that only start like a device name are fine')
})

test('safe-filename: bytes are stored under a random key, never the original name', async () => {
  const a = await upload('quarterly-report.pdf', PDF)
  const b = await upload('quarterly-report.pdf', PDF)
  assert.equal(a.status, 201); assert.equal(b.status, 201)
  assert.equal(puts.length, 2)
  assert.notEqual(puts[0], puts[1])
  assert.ok(puts.every(k => !k.includes('quarterly') && !k.includes('report')))
  assert.deepEqual([...store.values()].map(v => Buffer.from(v).toString()), [Buffer.from(PDF).toString(), Buffer.from(PDF).toString()])
})

// client-preflight
test('client-preflight: oversize, unlisted, mismatched and badly named files are refused before upload', async () => {
  const max = 1 * MB
  assert.deepEqual(await preflight({ name: 'a.png', size: max, type: 'image/png' }, max), { ok: true })
  assert.deepEqual(await preflight({ name: 'A.JPG', size: 10, type: '' }, max), { ok: true })
  assert.deepEqual(await preflight({ name: 'n.txt', size: 10, type: 'text/plain' }, max), { ok: true })
  assert.deepEqual(await preflight({ name: 'a.png', size: max + 1, type: 'image/png' }, max), { ok: false, error: 'too_large' })
  assert.deepEqual(await preflight({ name: 'a.png', size: 5, type: 'image/png' }, 4), { ok: false, error: 'too_large' })
  for (const f of [{ name: 'a.exe', size: 10, type: 'application/x-msdownload' }, { name: 'a.svg', size: 10, type: 'image/svg+xml' }, { name: 'a.png', size: 10, type: 'text/html' }, { name: 'noext', size: 10, type: '' }]) {
    assert.deepEqual(await preflight(f, max), { ok: false, error: 'unsupported_type' }, f.name)
  }
  for (const name of ['CON.txt', '', '..']) assert.deepEqual(await preflight({ name, size: 10, type: '' }, max), { ok: false, error: 'invalid_name' }, JSON.stringify(name))
  const source = readFileSync(new URL('../../src/upload-preflight.ts', import.meta.url), 'utf8')
  assert.ok(!/from\s+['"]node:|require\(['"]node:/.test(source), 'no node: imports in browser code')
  assert.ok(!/from\s+['"][^'"]*\/(db|config|server|blobs)\.ts['"]/.test(source), 'no server modules in browser code')
})

// authorization-quota
test('authorization-quota: only members upload to their tenant and read its files', async () => {
  assert.equal((await upload('a.txt', TEXT, '')).status, 401)
  assert.equal((await upload('a.txt', TEXT, 'eve', 'acme')).status, 403)
  assert.equal((await upload('a.txt', TEXT, 'bob', 'nope')).status, 404)
  assert.equal(puts.length, 0)
  const mine = await upload('a.txt', TEXT, 'bob')
  const theirs = await upload('b.txt', TEXT, 'eve', 'globex')
  await processScans()
  assert.equal(await status(mine.json.id, 'alice'), 200, 'any member of the tenant can download')
  assert.equal(await status(mine.json.id, 'eve'), 403)
  assert.equal(await status(mine.json.id, 'eve', 'globex'), 404, "another tenant's file is not found through your own tenant")
  assert.equal(await status(theirs.json.id, 'bob', 'acme'), 404)
  assert.equal((await request('GET', `/tenants/acme/files/${mine.json.id}`)).status, 401)
  assert.equal(await status('missing', 'bob'), 404)
})

test('authorization-quota: concurrent uploads cannot exceed the tenant quota', async () => {
  config.tenantQuotaBytes = 2.5 * MB
  putDelay = 5
  const results = await Promise.all([1, 2, 3, 4, 5].map(i => upload(`f${i}.png`, pad(PNG, 1 * MB))))
  assert.equal(results.filter(r => r.status === 201).length, 2)
  assert.ok(results.filter(r => r.status !== 201).every(r => r.status === 507 && r.json.error === 'quota_exceeded'))
  assert.equal((await upload('g.png', pad(PNG, 600 * KB))).status, 507)
  assert.equal((await upload('h.png', pad(PNG, 400 * KB))).status, 201, 'what remains of the quota is usable')
  assert.equal((await upload('other.png', pad(PNG, 1 * MB), 'eve', 'globex')).status, 201, 'quotas are per tenant')
})

test('authorization-quota: failed uploads and infected files release their space', async () => {
  config.tenantQuotaBytes = 1.5 * MB
  failPut = () => true
  const failed = await upload('a.png', pad(PNG, 1 * MB))
  assert.ok(failed.status >= 500 && failed.status < 600, `storage failure is a 5xx (got ${failed.status})`)
  failPut = () => false
  const ok = await upload('b.png', pad(PNG, 1 * MB))
  assert.equal(ok.status, 201, 'the failed upload did not keep its reservation')
  verdict = () => 'infected'
  await processScans()
  assert.equal((await upload('c.png', pad(PNG, 1 * MB))).status, 201, 'the infected file no longer counts')
})

// malware-scan
test('malware-scan: uploads stay quarantined until the scanner says clean', async () => {
  const r = await upload('notes.txt', TEXT)
  const res = await download(r.json.id)
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: 'not_scanned' })
  assert.equal(scans.length, 0, 'uploads are scanned only by processScans')
  await processScans()
  assert.equal(scans.length, 1)
  assert.deepEqual(Buffer.from(scans[0]!), Buffer.from(TEXT), 'the scanner sees the stored bytes')
  const ok = await download(r.json.id)
  assert.equal(ok.status, 200)
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), Buffer.from(TEXT))
  await processScans()
  assert.equal(scans.length, 1, 'scanned files are not scanned again')
})

test('malware-scan: infected files are deleted and never served; scanner errors keep the quarantine', async () => {
  const bad = await upload('bad.txt', bytes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'))
  const flaky = await upload('flaky.txt', TEXT)
  verdict = (b) => { if (Buffer.from(b).toString().startsWith('X5O')) return 'infected'; throw new Error('scanner offline') }
  await processScans()
  assert.equal(await status(bad.json.id), 404)
  assert.equal(deletes.length, 1)
  assert.equal(store.size, 1, 'the infected bytes are gone')
  assert.equal(await status(flaky.json.id), 409, 'a scanner error leaves the file quarantined')
  verdict = () => 'clean'
  await processScans()
  assert.equal(await status(flaky.json.id), 200, 'scanned again on a later call')
  assert.equal(await status(bad.json.id), 404)
})

test('malware-scan: overlapping processScans calls scan each file once and apply each verdict once', async () => {
  config.tenantQuotaBytes = 2 * MB
  const a = await upload('a.png', pad(PNG, 1 * MB))
  const b = await upload('b.png', pad(PNG, 1 * MB))
  verdict = () => 'infected'
  await Promise.all([processScans(), processScans(), processScans()])
  assert.equal(scans.length, 2, 'each file scanned once')
  assert.equal(deletes.length, 2, 'each infected file deleted once')
  assert.equal(await status(a.json.id), 404); assert.equal(await status(b.json.id), 404)
  verdict = () => 'clean'
  assert.equal((await upload('c.png', pad(PNG, 1 * MB))).status, 201)
  assert.equal((await upload('d.png', pad(PNG, 1 * MB))).status, 201)
  assert.equal((await upload('e.png', pad(PNG, 1 * MB))).status, 507, 'space was released once per file, not once per call')
})

// safe-serving
test('safe-serving: downloads are attachments with nosniff, the detected type and an RFC 6266 filename', async () => {
  const r = await upload('résumé €.pdf', PDF, 'bob', 'acme', { 'content-type': 'text/html' })
  assert.equal(r.status, 201)
  await processScans()
  const res = await download(r.json.id)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^application\/pdf\b/)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  const disposition = res.headers.get('content-disposition') ?? ''
  assert.match(disposition, /^attachment\s*(;|$)/i)
  const star = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(disposition)
  assert.ok(star, `filename* parameter in ${disposition}`)
  assert.equal(decodeURIComponent(star![1]!), 'résumé €.pdf')
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(PDF))
  const t = await upload('a"b;c.txt', TEXT)
  await processScans()
  const tr = await download(t.json.id)
  assert.match(tr.headers.get('content-type') ?? '', /^text\/plain\b/)
  const td = tr.headers.get('content-disposition') ?? ''
  assert.equal(decodeURIComponent(/filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(td)![1]!), t.json.name, 'quotes and semicolons are encoded, not injected')
  assert.equal(tr.headers.get('x-content-type-options'), 'nosniff')
})
