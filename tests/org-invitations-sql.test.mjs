// SPDX-License-Identifier: Apache-2.0
// org-invitations on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL
// store passes the core behaviors, concurrent accepts have one winner, and the membership insert shares the
// accepting transaction (a failing insert rolls the accept back).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createInvitations } from '../.build/modules/org-invitations/files/core.js';
import { createSqlInvitationStore } from '../.build/modules/org-invitations/files/sql-store.js';

const schema = readFileSync(new URL('../modules/org-invitations/files/schema.sql', import.meta.url), 'utf8');
const authorize = async (actor, action, { tenantId, role }) => actor.userId === 'alice' && tenantId === 'acme' && (action !== 'invite' || role !== 'owner');
const executor = db => ({ query: (text, params) => db.query(text, params), transaction: work => db.transaction(tx => work({ query: (text, params) => tx.query(text, params) })) });

async function setup(options = {}) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec('CREATE TABLE memberships (tenant_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, PRIMARY KEY (tenant_id, user_id))');
  let now = 1_000_000;
  const store = createSqlInvitationStore(executor(db), options);
  const invitations = createInvitations({ store, authorize, roles: ['member', 'admin', 'owner'], now: () => now });
  return { db, invitations, advance: ms => { now += ms; } };
}

test('schema applies and the SQL store keeps the core behavior', async () => {
  const { db, invitations, advance } = await setup();
  const { invitation, token } = await invitations.invite({ userId: 'alice' }, { tenantId: 'acme', email: 'New@Example.COM', role: 'member' });
  const row = (await db.query('SELECT token_hash, status, created_at FROM org_invitations WHERE id = $1', [invitation.id])).rows[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.token_hash.length, 64);
  assert.ok(!JSON.stringify(row).includes(token), 'the token itself is never stored');
  assert.equal((await invitations.inspect(token)).email, 'New@example.com');
  // Re-inviting rotates the link through a conditional UPDATE.
  const fresh = await invitations.invite({ userId: 'alice' }, { tenantId: 'acme', email: 'new@example.com', role: 'admin' });
  assert.equal((await invitations.inspect(token)).status, 'revoked');
  assert.deepEqual((await invitations.listPending({ userId: 'alice' }, 'acme')).map(item => item.id), [fresh.invitation.id]);
  assert.equal((await invitations.accept(fresh.token, { userId: 'u1', verifiedEmail: 'new@example.com' })).acceptedBy, 'u1');
  await assert.rejects(invitations.accept(fresh.token, { userId: 'u1', verifiedEmail: 'new@example.com' }), { code: 'already-accepted' });
  const third = await invitations.invite({ userId: 'alice' }, { tenantId: 'acme', email: 'x@example.com', role: 'member' });
  advance(8 * 86_400_000);
  await assert.rejects(invitations.accept(third.token, { userId: 'u2', verifiedEmail: 'x@example.com' }), { code: 'expired' });
  assert.throws(() => createSqlInvitationStore(executor(db), { table: 'bad; drop table x' }), RangeError);
});

test('concurrent accepts against the database: exactly one wins', async () => {
  const { invitations } = await setup();
  const { token } = await invitations.invite({ userId: 'alice' }, { tenantId: 'acme', email: 'a@example.com', role: 'member' });
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => invitations.accept(token, { userId: 'u', verifiedEmail: 'a@example.com' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('onAccepted creates the membership in the accepting transaction; a failure rolls the accept back', async () => {
  const onAccepted = async (tx, invitation) => {
    await tx.query('INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)', [invitation.tenantId, invitation.acceptedBy, invitation.role]);
  };
  const { db, invitations } = await setup({ onAccepted });
  const first = await invitations.invite({ userId: 'alice' }, { tenantId: 'acme', email: 'b@example.com', role: 'admin' });
  await invitations.accept(first.token, { userId: 'bob', verifiedEmail: 'b@example.com' });
  assert.deepEqual((await db.query('SELECT user_id, role FROM memberships')).rows, [{ user_id: 'bob', role: 'admin' }]);
  // Bob is already a member: the membership insert violates the primary key, so the second accept rolls back.
  const second = await invitations.invite({ userId: 'alice' }, { tenantId: 'acme', email: 'b2@example.com', role: 'member' });
  await assert.rejects(invitations.accept(second.token, { userId: 'bob', verifiedEmail: 'b2@example.com' }));
  assert.equal((await invitations.inspect(second.token)).status, 'pending', 'the invitation is still usable');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n, 1);
});
