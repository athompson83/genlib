// SPDX-License-Identifier: Apache-2.0
// comments on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL store
// passes the core behaviors, concurrent reactions and flags from many users end with exact counts and hide exactly
// at the threshold, and soft delete keeps replies.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createComments } from '../.build/modules/comments/files/core.js';
import { createSqlCommentStore } from '../.build/modules/comments/files/sql-store.js';

const schema = readFileSync(new URL('../modules/comments/files/schema.sql', import.meta.url), 'utf8');
// Everyone whose id starts with "u" or is alice/bob is an acme member; "mod" moderates acme; nobody else has access.
const authorize = async (actor, action, { tenantId }) => {
  if (tenantId !== 'acme') return false;
  if (actor.userId === 'mod') return true;
  return action !== 'moderate' && (actor.userId === 'alice' || actor.userId === 'bob' || actor.userId.startsWith('u'));
};
const task = { tenantId: 'acme', resourceType: 'task', resourceId: 't-1' };

async function setup(extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  const store = createSqlCommentStore({ query: (text, params) => db.query(text, params) });
  const comments = createComments({ store, authorize, now: () => now, ...extra });
  const post = async (actor, input) => { now += 1000; return comments.post(actor, { ...task, ...input }); };
  return { db, comments, post, advance: ms => { now += ms; } };
}

test('schema applies and the SQL store keeps the core behavior', async () => {
  const { db, comments, post, advance } = await setup({ previewReplies: 1 });
  const top = await post({ userId: 'alice' }, { body: 'Hello @bob and @carol' });
  const row = (await db.query('SELECT mentions, status, flag_count, depth FROM comments WHERE id = $1', [top.id])).rows[0];
  assert.deepEqual(row.mentions, ['bob', 'carol']);
  assert.equal(row.status, 'visible');
  assert.equal(row.flag_count, 0);
  const r1 = await post({ userId: 'bob' }, { body: 'first reply', parentId: top.id });
  await post({ userId: 'alice' }, { body: 'second reply', parentId: top.id });
  const nested = await post({ userId: 'alice' }, { body: 'nested', parentId: r1.id });
  await post({ userId: 'alice' }, { body: 'deeper', parentId: nested.id });
  const last = await post({ userId: 'alice' }, { body: 'newest top' });
  await post({ userId: 'alice' }, { resourceId: 't-2', body: 'other task' });
  await assert.rejects(post({ userId: 'bob' }, { resourceId: 't-2', body: 'cross', parentId: top.id }), { code: 'invalid-parent' });

  const first = await comments.list({ userId: 'bob' }, { ...task, limit: 1 });
  assert.deepEqual(first.comments.map(c => c.id), [last.id]);
  const second = await comments.list({ userId: 'bob' }, { ...task, limit: 1, cursor: first.nextCursor });
  assert.deepEqual(second.comments.map(c => c.id), [top.id]);
  assert.equal(second.comments[0].replyCount, 2);
  assert.deepEqual(second.comments[0].replies.map(c => c.body), ['first reply']);
  assert.equal(second.comments[0].replies[0].replyCount, 1);
  assert.equal(second.nextCursor, null);
  const replies = await comments.listReplies({ userId: 'bob' }, top.id, { limit: 1 });
  const more = await comments.listReplies({ userId: 'bob' }, top.id, { limit: 1, cursor: replies.nextCursor });
  assert.deepEqual([...replies.replies, ...more.replies].map(c => c.body), ['first reply', 'second reply']);
  await assert.rejects(post({ userId: 'bob' }, { body: 'too deep', parentId: (await comments.listReplies({ userId: 'bob' }, nested.id)).replies[0].id }), { code: 'too-deep' });

  const edited = await comments.edit({ userId: 'alice' }, top.id, 'Edited for @dave');
  assert.deepEqual(edited.mentions, ['dave']);
  assert.equal(typeof edited.editedAt, 'number');
  advance(16 * 60_000);
  await assert.rejects(comments.edit({ userId: 'alice' }, top.id, 'late'), { code: 'edit-window-closed' });
  assert.equal((await comments.edit({ userId: 'mod' }, top.id, 'moderator edit')).body, 'moderator edit');
  await assert.rejects(comments.list({ userId: 'eve' }, task), { code: 'forbidden' });
  await assert.rejects(comments.remove({ userId: 'eve' }, top.id), { code: 'not-found' });
  assert.throws(() => createSqlCommentStore({ query: async () => ({ rows: [] }) }, { tables: { comments: 'bad; drop table x' } }), RangeError);
});

test('concurrent reactions from many users end with exact counts', async () => {
  const { db, comments, post } = await setup();
  const comment = await post({ userId: 'alice' }, { body: 'react' });
  const users = Array.from({ length: 25 }, (_, i) => ({ userId: `u${i}` }));
  await Promise.all(users.flatMap(user => [comments.react(user, comment.id, '👍'), comments.react(user, comment.id, '🎉')]));
  const counts = (await db.query('SELECT emoji, count(*)::int AS n FROM comment_reactions GROUP BY emoji ORDER BY emoji')).rows;
  assert.deepEqual(Object.fromEntries(counts.map(r => [r.emoji, r.n])), { '👍': 25, '🎉': 25 });
  // Ten users toggle 👍 off concurrently.
  await Promise.all(users.slice(0, 10).map(user => comments.react(user, comment.id, '👍')));
  const view = (await comments.list({ userId: 'u0' }, task)).comments[0];
  assert.deepEqual(view.reactions, [{ emoji: '👍', count: 15, reacted: false }, { emoji: '🎉', count: 25, reacted: true }]);
  await assert.rejects(comments.react({ userId: 'u1' }, comment.id, 'nope'), { code: 'invalid-emoji' });
});

test('concurrent flags from many users: exact count, hidden exactly at the threshold, repeats refused', async () => {
  const { db, comments, post } = await setup({ flagThreshold: 5 });
  const comment = await post({ userId: 'alice' }, { body: 'flag me' });
  const users = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}` }));
  // Every user flags twice at once: 12 succeed, 12 repeats are refused.
  const results = await Promise.allSettled(users.flatMap(user => [comments.flag(user, comment.id, 'spam'), comments.flag(user, comment.id, 'spam')]));
  const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  assert.equal(ok.length, 12);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'already-flagged'));
  // The hide happens on exactly the flag that reached the threshold and every later one reports hidden.
  assert.equal(ok.filter(r => !r.hidden).length, 4);
  const row = (await db.query('SELECT flag_count, status FROM comments WHERE id = $1', [comment.id])).rows[0];
  assert.deepEqual(row, { flag_count: 12, status: 'hidden' });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM comment_flags')).rows[0].n, 12);
  assert.equal((await comments.list({ userId: 'bob' }, task)).comments[0].body, null);
  assert.equal((await comments.moderate({ userId: 'mod' }, comment.id, 'approve')).status, 'approved');
  assert.equal((await comments.list({ userId: 'bob' }, task)).comments[0].body, 'flag me');
  await assert.rejects(comments.moderate({ userId: 'bob' }, comment.id, 'hide'), { code: 'forbidden' });
});

test('soft delete clears the body and keeps replies on PostgreSQL', async () => {
  const { db, comments, post } = await setup();
  const top = await post({ userId: 'alice' }, { body: 'parent @bob' });
  const reply = await post({ userId: 'bob' }, { body: 'child', parentId: top.id });
  await assert.rejects(comments.remove({ userId: 'bob' }, top.id), { code: 'forbidden' });
  const removed = await comments.remove({ userId: 'alice' }, top.id);
  assert.equal(removed.body, null);
  assert.equal(removed.replyCount, 1);
  const row = (await db.query('SELECT body, mentions, deleted_at FROM comments WHERE id = $1', [top.id])).rows[0];
  assert.equal(row.body, null);
  assert.deepEqual(row.mentions, []);
  assert.ok(Number(row.deleted_at) > 0);
  await assert.rejects(comments.remove({ userId: 'alice' }, top.id), { code: 'deleted' });
  await assert.rejects(comments.react({ userId: 'bob' }, top.id, '👍'), { code: 'deleted' });
  const listed = (await comments.list({ userId: 'bob' }, task)).comments[0];
  assert.equal(listed.body, null);
  assert.deepEqual(listed.replies.map(c => [c.id, c.body]), [[reply.id, 'child']]);
});
