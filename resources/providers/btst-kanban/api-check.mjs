// SPDX-License-Identifier: Apache-2.0
// Exercises the BTST Kanban HTTP API of a running app (adapted from upstream e2e/tests/smoke.kanban.spec.ts, MIT). Usage: node api-check.mjs [baseUrl] [identity header k:v]. Exits 1 on any failed check.
const base = process.argv[2] || 'http://localhost:3000';
const extra = process.argv[3] ? Object.fromEntries([process.argv[3].split(/:(.*)/s).slice(0, 2)]) : {};
const H = { 'content-type': 'application/json', origin: base, ...extra };
const results = [];
async function call(method, path, body) {
  const headers = { ...H }; if (!body) delete headers['content-type'];
  const res = await fetch(base + '/api/data' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
function rec(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`); }

const b = await call('POST', '/boards', { name: 'E2E ' + Date.now() });
rec('create board', b.status === 200 && b.json.columns?.map(c => c.title).join('|') === 'To Do|In Progress|Done', `status=${b.status} columns=${b.json.columns?.map(c => c.title).join('|')}`);
const board = b.json; const [todo, doing, done] = board.columns;
const list = await call('GET', '/boards');
rec('list boards', list.status === 200 && JSON.stringify(list.json).includes(board.id), `status=${list.status}`);
const ren = await call('PUT', `/boards/${board.id}`, { name: 'Renamed' });
rec('rename board', ren.status === 200 && ren.json.name === 'Renamed', `status=${ren.status} name=${ren.json?.name}`);
const col = await call('POST', '/columns', { title: 'Review', boardId: board.id });
rec('add column', col.status === 200 && col.json.title === 'Review', `status=${col.status} order=${col.json?.order}`);
const colEd = await call('PUT', `/columns/${col.json.id}`, { title: 'QA' });
rec('edit column', colEd.status === 200 && colEd.json.title === 'QA', `status=${colEd.status}`);
const reorderCols = await call('POST', '/columns/reorder', { boardId: board.id, columnIds: [col.json.id, done.id, doing.id, todo.id] });
let g = await call('GET', `/boards/${board.id}`);
const colOrder = g.json.columns?.slice().sort((a, b) => a.order - b.order).map(c => c.title).join('|');
rec('reorder columns', reorderCols.status === 200 && colOrder === 'QA|Done|In Progress|To Do', `status=${reorderCols.status} order=${colOrder}`);

const tasks = [];
for (const [i, p] of ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].entries()) {
  const t = await call('POST', '/tasks', { title: `T${i}`, priority: p, columnId: todo.id, assigneeId: i === 0 ? 'user-1' : undefined });
  tasks.push(t.json);
  rec(`create task ${p}`, t.status === 200 && t.json.priority === p, `status=${t.status} order=${t.json?.order} assignee=${t.json?.assigneeId ?? null}`);
}
const badPrio = await call('POST', '/tasks', { title: 'bad', priority: 'NOPE', columnId: todo.id });
rec('reject invalid priority', badPrio.status >= 400 && badPrio.status < 500, `status=${badPrio.status}`);
const ed = await call('PUT', `/tasks/${tasks[0].id}`, { title: 'T0 edited', priority: 'HIGH' });
rec('edit task', ed.status === 200 && ed.json.title === 'T0 edited', `status=${ed.status}`);
const mv = await call('POST', '/tasks/move', { taskId: tasks[1].id, targetColumnId: doing.id, targetOrder: 0 });
g = await call('GET', `/boards/${board.id}`);
const inDoing = g.json.columns.find(c => c.id === doing.id).tasks.map(t => t.title);
const inTodo = g.json.columns.find(c => c.id === todo.id).tasks.slice().sort((a, b) => a.order - b.order).map(t => `${t.title}@${t.order}`);
rec('move task between columns', mv.status === 200 && inDoing.includes('T1'), `status=${mv.status} doing=${inDoing} todo=${inTodo}`);
const ro = await call('POST', '/tasks/reorder', { columnId: todo.id, taskIds: [tasks[3].id, tasks[2].id, tasks[0].id] });
g = await call('GET', `/boards/${board.id}`);
const todoOrder = g.json.columns.find(c => c.id === todo.id).tasks.slice().sort((a, b) => a.order - b.order).map(t => `${t.title}@${t.order}`).join(',');
rec('reorder tasks', ro.status === 200 && todoOrder === 'T3@0,T2@1,T0 edited@2', `status=${ro.status} todo=${todoOrder}`);

// Competing moves of one task to two columns at once: both may succeed (last wins) but order must stay dense and the task must be in exactly one column.
const [m1, m2] = await Promise.all([
  call('POST', '/tasks/move', { taskId: tasks[2].id, targetColumnId: done.id, targetOrder: 0 }),
  call('POST', '/tasks/move', { taskId: tasks[2].id, targetColumnId: col.json.id, targetOrder: 0 }),
]);
g = await call('GET', `/boards/${board.id}`);
const homes = g.json.columns.filter(c => c.tasks.some(t => t.id === tasks[2].id)).map(c => c.title);
const dense = g.json.columns.every(c => c.tasks.slice().sort((a, b) => a.order - b.order).every((t, i) => t.order === i));
rec('concurrent moves leave one home and dense order', homes.length === 1 && dense, `statuses=${m1.status},${m2.status} homes=${homes} dense=${dense}`);

const delT = await call('DELETE', `/tasks/${tasks[3].id}`);
rec('delete task', delT.status === 200, `status=${delT.status}`);
const delC = await call('DELETE', `/columns/${col.json.id}`);
rec('delete column', delC.status === 200, `status=${delC.status}`);
const delB = await call('DELETE', `/boards/${board.id}`);
const after = await call('GET', `/boards/${board.id}`);
const orphan = await call('PUT', `/tasks/${tasks[0].id}`, { title: 'orphan?' });
rec('delete board cascades', delB.status === 200 && after.status === 404 && orphan.status === 404, `delete=${delB.status} getAfter=${after.status} updateChildTask=${orphan.status}`);
console.log(JSON.stringify({ passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length }));
process.exitCode = results.every(r => r.ok) ? 0 : 1;
process.exitCode = results.every(r => r.ok) ? 0 : 1;
