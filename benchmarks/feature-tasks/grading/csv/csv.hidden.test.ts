import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { db } from '../../src/db.ts'
import { call, reset } from './helpers.ts'

beforeEach(reset)
const imp = (csv: string, mapping?: Record<string, string>, user = 'bob', tenant = 'acme') =>
  call('POST', `/tenants/${tenant}/notes/import`, user, mapping ? { csv, mapping } : { csv })
const notes = (tenant = 'acme') => db.notes.filter(n => n.tenantId === tenant)

test('imports rows with the default title/body headers', async () => {
  const r = await imp('title,body\nFirst,one\nSecond,two\n')
  assert.equal(r.status, 201)
  assert.equal(r.json.imported, 2)
  assert.deepEqual(notes().map(n => [n.title, n.body, n.authorId]), [['First', 'one', 'bob'], ['Second', 'two', 'bob']])
})

test('RFC 4180: quoted commas, escaped quotes and newlines inside quotes', async () => {
  const r = await imp('title,body\r\n"Hello, world","She said ""hi""\r\nand left"\r\nPlain,"x"\r\n')
  assert.equal(r.status, 201)
  assert.deepEqual(notes().map(n => [n.title, n.body]), [['Hello, world', 'She said "hi"\r\nand left'], ['Plain', 'x']])
})

test('a UTF-8 BOM, case-insensitive headers and extra columns are handled', async () => {
  const r = await imp('﻿Title,Extra,BODY\nÉté,ignored,ünïcode\n')
  assert.equal(r.status, 201)
  assert.deepEqual(notes().map(n => [n.title, n.body]), [['Été', 'ünïcode']])
})

test('a column mapping picks other headers', async () => {
  const r = await imp('Heading,Text,Tag\nA,aa,t\nB,bb,t\n', { title: 'Heading', body: 'Text' })
  assert.equal(r.status, 201)
  assert.deepEqual(notes().map(n => [n.title, n.body]), [['A', 'aa'], ['B', 'bb']])
})

test('invalid rows are all reported with their record numbers and nothing is imported', async () => {
  const long = 'x'.repeat(201)
  const r = await imp(`title,body\nok,1\n   ,2\nok,3\n${long},4\n`)
  assert.equal(r.status, 422)
  assert.ok(Array.isArray(r.json.errors))
  const rows = r.json.errors.map((e: any) => e.row).sort()
  assert.deepEqual(rows, [2, 4])
  assert.ok(r.json.errors.every((e: any) => e.field === 'title'))
  assert.equal(notes().length, 0, 'all-or-nothing')
})

test('body length is limited to 10,000 characters', async () => {
  assert.equal((await imp(`title,body\nok,${'y'.repeat(10_000)}\n`)).status, 201)
  const r = await imp(`title,body\nok,${'y'.repeat(10_001)}\n`)
  assert.equal(r.status, 422)
  assert.deepEqual(r.json.errors.map((e: any) => [e.row, e.field]), [[1, 'body']])
})

test('more than 1,000 data rows is 413 and imports nothing', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => `t${i},b`).join('\n')
  assert.equal((await imp('title,body\n' + rows)).status, 413)
  assert.equal(notes().length, 0)
  const ok = Array.from({ length: 1000 }, (_, i) => `t${i},b`).join('\n')
  assert.equal((await imp('title,body\n' + ok)).json.imported, 1000)
})

test('missing mapped columns, duplicate headers and malformed CSV are 400', async () => {
  const missing = await imp('name,body\nA,b\n')
  assert.equal(missing.status, 400)
  assert.equal(missing.json.error, 'missing_column')
  assert.equal((await imp('Heading,Text\nA,b\n', { title: 'Nope', body: 'Text' })).json.error, 'missing_column')
  assert.equal((await imp('title,title,body\nA,B,c\n')).status, 400)
  const bad = await imp('title,body\n"unterminated,x\n')
  assert.equal(bad.status, 400)
  assert.equal(bad.json.error, 'malformed_csv')
  assert.equal(notes().length, 0)
})

test('a header-only file imports nothing', async () => {
  const r = await imp('title,body\n')
  assert.equal(r.status, 201)
  assert.equal(r.json.imported, 0)
})

test('only members of the tenant can import', async () => {
  assert.equal((await imp('title,body\nA,b\n', undefined, 'eve')).status, 403)
  assert.equal((await call('POST', '/tenants/acme/notes/import', undefined, { csv: 'title,body\nA,b\n' })).status, 401)
  assert.equal(notes().length, 0)
})
