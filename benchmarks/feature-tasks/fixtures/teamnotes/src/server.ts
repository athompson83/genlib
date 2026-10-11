import { HttpError, requireMember } from './auth.ts'
import { clock } from './clock.ts'
import { db } from './db.ts'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json()
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {}
  throw new HttpError(400, 'invalid_json')
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  try {
    const notes = /^\/tenants\/([a-z0-9-]+)\/notes$/.exec(url.pathname)
    if (notes) {
      const tenantId = notes[1]!
      if (!db.tenants.has(tenantId)) throw new HttpError(404, 'not_found')
      const { user } = requireMember(request, tenantId)
      if (request.method === 'GET') {
        return json(200, db.notes.filter(n => n.tenantId === tenantId).map(({ tenantId: _t, ...note }) => note))
      }
      if (request.method === 'POST') {
        const body = await readJson(request)
        if (typeof body.title !== 'string' || !body.title.trim() || typeof body.body !== 'string') throw new HttpError(400, 'invalid_note')
        const note = { id: crypto.randomUUID(), tenantId, title: body.title.trim(), body: body.body, authorId: user.id, createdAt: clock.now() }
        db.notes.push(note)
        const { tenantId: _t, ...out } = note
        return json(201, out)
      }
      throw new HttpError(405, 'method_not_allowed')
    }
    throw new HttpError(404, 'not_found')
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.code })
    console.error(error)
    return json(500, { error: 'internal' })
  }
}
