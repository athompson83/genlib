import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { resetDb } from '../src/db.ts'
import { handle } from '../src/server.ts'

const call = (method: string, path: string, user?: string, body?: unknown) =>
  handle(new Request('http://app.test' + path, {
    method,
    headers: { ...(user ? { authorization: `Bearer session:${user}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }))

beforeEach(() => resetDb())

test('members create and list their tenant notes', async () => {
  assert.equal((await call('POST', '/tenants/acme/notes', 'bob', { title: 'Hi', body: 'x' })).status, 201)
  const list = await (await call('GET', '/tenants/acme/notes', 'alice')).json()
  assert.equal(list.length, 1)
})

test('other tenants and anonymous users are refused', async () => {
  assert.equal((await call('GET', '/tenants/acme/notes', 'eve')).status, 403)
  assert.equal((await call('GET', '/tenants/acme/notes')).status, 401)
})
