import { clock } from '../../src/clock.ts'
import { db, resetDb } from '../../src/db.ts'
import { handle } from '../../src/server.ts'

export const realNow = clock.now
export let now = 1_800_000_000_000
export function setNow(value: number) { now = value; clock.now = () => now }
export function advance(ms: number) { setNow(now + ms) }
export function reset() { resetDb(); setNow(1_800_000_000_000) }

export async function call(method: string, path: string, user?: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...(user ? { authorization: `Bearer session:${user}` } : {}), ...headers } }
  if (body !== undefined) {
    if (typeof body === 'string') init.body = body
    else { init.body = JSON.stringify(body); (init.headers as Record<string, string>)['content-type'] = 'application/json' }
  }
  const res = await handle(new Request('http://app.test' + path, init))
  const text = await res.text()
  let json: any; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}

/** Everything in the in-memory database, Maps and Sets included. */
export function dbText(): string {
  return JSON.stringify(db, (_k, v) => v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : (typeof v === 'object' && v && ArrayBuffer.isView(v)) ? Buffer.from(v.buffer).toString('hex') : v)
}
export const isMember = (userId: string, tenantId: string) => db.memberships.some(m => m.userId === userId && m.tenantId === tenantId)
export const tenantPlan = (tenantId: string) => db.tenants.get(tenantId)!.plan
