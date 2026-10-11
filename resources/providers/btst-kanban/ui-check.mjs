// SPDX-License-Identifier: Apache-2.0
// Browser check for the BTST Kanban pages. Usage: node ui-check.mjs [baseUrl] [identity header name]
// Needs the playwright package resolvable from the working directory (the app's or a tools directory) and a
// Chromium it can launch. Creates a board with a task assigned to user-1, then loads the list, new-board and board
// pages and fails on any console error, page error, same-origin 5xx or failed (not cancelled) request, or if the board page does not
// show the assignee's display name (proving resolveUser reads the app's user store).
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire(path.join(process.cwd(), 'noop.js'))('playwright');
const base = process.argv[2] || 'http://localhost:3000';
const header = process.argv[3] || 'x-demo-user';
const assignee = process.env.GENLIB_ASSIGNEE_NAME || 'Ada Lovelace';
const api = async (method, route, body) => {
  const res = await fetch(`${base}/api/data${route}`, { method, headers: { 'content-type': 'application/json', origin: base, [header]: 'alice' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}`);
  return res.json();
};
const board = await api('POST', '/boards', { name: 'UI check ' + Date.now() });
await api('POST', '/tasks', { title: 'Assigned task', columnId: board.columns[0].id, assigneeId: 'user-1' });

const browser = await chromium.launch();
const context = await browser.newContext({ extraHTTPHeaders: { [header]: 'alice' } });
const problems = [];
let failed = 0;
for (const route of ['/pages/kanban', '/pages/kanban/new', `/pages/kanban/${board.id}`]) {
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') problems.push(`${route} console: ${message.text()}`); });
  page.on('pageerror', error => problems.push(`${route} pageerror: ${error.message}`));
  // Prefetches the router cancels when the page closes end with net::ERR_ABORTED; anything else is a failure.
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText ?? '';
    if (request.url().startsWith(base) && reason !== 'net::ERR_ABORTED') problems.push(`${route} request failed (${reason}): ${request.url()}`);
  });
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 500) problems.push(`${route} HTTP ${response.status()}: ${response.url()}`); });
  const response = await page.goto(base + route, { waitUntil: 'networkidle' });
  const status = response?.status();
  let ok = status === 200;
  if (route.endsWith(board.id)) {
    const shown = await page.getByText(assignee).first().isVisible({ timeout: 10000 }).catch(() => false);
    const titled = await page.getByText('Assigned task').first().isVisible().catch(() => false);
    ok = ok && shown && titled;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${route} status=${status} task=${titled} assignee "${assignee}" shown=${shown}`);
  } else console.log(`${ok ? 'PASS' : 'FAIL'} ${route} status=${status}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
for (const problem of problems) console.log(`FAIL ${problem}`);
console.log(JSON.stringify({ failed: failed + problems.length }));
process.exitCode = failed + problems.length ? 1 : 0;
