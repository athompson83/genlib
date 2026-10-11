export type Role = 'admin' | 'member'
export interface User { id: string; email: string; name: string }
export interface Tenant { id: string; name: string; plan: 'free' | 'pro' }
export interface Membership { userId: string; tenantId: string; role: Role }
export interface Note { id: string; tenantId: string; title: string; body: string; authorId: string; createdAt: number }

export interface Db {
  users: Map<string, User>
  tenants: Map<string, Tenant>
  memberships: Membership[]
  notes: Note[]
}

function seed(): Db {
  return {
    users: new Map([
      ['alice', { id: 'alice', email: 'alice@acme.test', name: 'Alice' }],
      ['bob', { id: 'bob', email: 'bob@acme.test', name: 'Bob' }],
      ['eve', { id: 'eve', email: 'eve@globex.test', name: 'Eve' }],
      ['carol', { id: 'carol', email: 'carol@example.test', name: 'Carol' }],
    ]),
    tenants: new Map([
      ['acme', { id: 'acme', name: 'Acme', plan: 'free' }],
      ['globex', { id: 'globex', name: 'Globex', plan: 'free' }],
    ]),
    memberships: [
      { userId: 'alice', tenantId: 'acme', role: 'admin' },
      { userId: 'bob', tenantId: 'acme', role: 'member' },
      { userId: 'eve', tenantId: 'globex', role: 'admin' },
    ],
    notes: [],
  }
}

export let db: Db = seed()
export function resetDb(): void { db = seed() }
