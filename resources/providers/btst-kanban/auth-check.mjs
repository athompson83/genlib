// SPDX-License-Identifier: Apache-2.0
// Server-authorization probes for the BTST Kanban API. Usage: node auth-check.mjs [baseUrl] [identity header name]
// The app's server auth must resolve the identity from that header (evaluation only). Expects 401 for every
// operation anonymously, 403 for every record operation by another user, and the server to ignore a client ownerId.
const base = (process.argv[2] || 'http://localhost:3000') + '/api/data';
const header = process.argv[3] || 'x-demo-user';
async function call(user, method, path, body) {
  const headers = { origin: new URL(base).origin };
  if (user) headers[header] = user;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j };
}
const failures = [];
const check = (ok, message) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); if (!ok) failures.push(message); };
const b = (await call('alice', 'POST', '/boards', { name: 'Alice board ' + Date.now(), ownerId: 'mallory' })).json;
check(b.ownerId === 'alice', `client-supplied ownerId ignored (stored ${b.ownerId})`);
const col = b.columns[0];
const task = (await call('alice', 'POST', '/tasks', { title: 't', columnId: col.id })).json;
const ops = [
  ['GET', '/boards'], ['GET', `/boards/${b.id}`], ['POST', '/boards', { name: 'x' }], ['PUT', `/boards/${b.id}`, { name: 'y' }],
  ['DELETE', `/boards/${b.id}`], ['POST', '/columns', { title: 'c', boardId: b.id }], ['PUT', `/columns/${col.id}`, { title: 'z' }],
  ['DELETE', `/columns/${col.id}`], ['POST', '/columns/reorder', { boardId: b.id, columnIds: b.columns.map(c => c.id).reverse() }],
  ['POST', '/tasks', { title: 'n', columnId: col.id }], ['PUT', `/tasks/${task.id}`, { title: 'q' }], ['DELETE', `/tasks/${task.id}`],
  ['POST', '/tasks/move', { taskId: task.id, targetColumnId: b.columns[1].id, targetOrder: 0 }], ['POST', '/tasks/reorder', { columnId: col.id, taskIds: [task.id] }],
];
// Collection reads and creating one's own board are allowed for any signed-in user.
const open = new Set(['GET /boards', 'POST /boards']);
for (const [method, path, body] of ops) {
  const label = `${method} ${path.replace(/[A-Za-z0-9]{32}/g, ':id')}`;
  const anon = (await call(null, method, path, body)).status;
  check(anon === 401, `${label} anonymous -> ${anon}`);
  if (!open.has(label)) { const other = (await call('bob', method, path, body)).status; check(other === 403, `${label} other user -> ${other}`); }
}
const still = await call('alice', 'GET', `/boards/${b.id}`);
check(still.status === 200 && still.json.columns.length === 3 && still.json.columns[0].tasks.length === 1, 'owner board intact after probes');
console.log(JSON.stringify({ failed: failures.length }));
process.exitCode = failures.length ? 1 : 0;
