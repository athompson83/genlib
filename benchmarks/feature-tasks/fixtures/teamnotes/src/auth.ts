import { db, type Membership, type User } from './db.ts'

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}

/** The signed-in user. Real sessions are out of scope; `Bearer session:<userId>` stands in for them. */
export function currentUser(request: Request): User | null {
  const match = /^Bearer session:([a-z0-9-]+)$/i.exec(request.headers.get('authorization') ?? '')
  return match ? db.users.get(match[1]!) ?? null : null
}

export function requireUser(request: Request): User {
  const user = currentUser(request)
  if (!user) throw new HttpError(401, 'unauthenticated')
  return user
}

export function membership(userId: string, tenantId: string): Membership | undefined {
  return db.memberships.find(m => m.userId === userId && m.tenantId === tenantId)
}

export function requireMember(request: Request, tenantId: string): { user: User; membership: Membership } {
  const user = requireUser(request)
  const found = membership(user.id, tenantId)
  if (!found) throw new HttpError(403, 'forbidden')
  return { user, membership: found }
}
