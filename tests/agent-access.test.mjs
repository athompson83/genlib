import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function mcp(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [root + 'bin/genlib-mcp.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('error', reject);
    child.on('close', () => resolve(out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))));
    for (const request of requests) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n');
    child.stdin.end();
  });
}

test('MCP server initializes, lists tools and answers tool calls in order', async () => {
  const replies = await mcp([
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'genlib_find', arguments: { query: 'verify stripe webhook', limit: 3 } } },
    { id: 4, method: 'tools/call', params: { name: 'genlib_capability', arguments: { id: 'totp', language: 'go' } } },
    { id: 5, method: 'tools/call', params: { name: 'genlib_read_doc', arguments: { id: 'docs/capabilities.md#adding-a-capability' } } },
    { id: 6, method: 'tools/call', params: { name: 'genlib_jev', arguments: { task: 'pdf form fill java', limit: 3 } } },
    { id: 7, method: 'tools/call', params: { name: 'genlib_inspect', arguments: { type: 'resource', id: 'no-such-thing' } } },
    { id: 8, method: 'nope' },
    { id: 9, method: 'tools/call', params: { name: 'genlib_quick', arguments: { query: 'signed pagination cursor', language: 'kotlin' } } },
    { id: 10, method: 'tools/call', params: { name: 'genlib_outline', arguments: { ref: 'ics-events', language: 'rust' } } },
    { id: 11, method: 'tools/call', params: { name: 'genlib_find', arguments: { query: 'verify stripe webhook', limit: 2, detail: 'full' } } },
  ]);
  assert.deepEqual(replies.map(reply => reply.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  assert.ok(replies[0].result.capabilities.tools);
  const names = replies[1].result.tools.map(tool => tool.name);
  for (const name of ['genlib_quick', 'genlib_find', 'genlib_outline', 'genlib_jev', 'genlib_capability', 'genlib_coverage', 'genlib_inspect', 'genlib_read_doc', 'genlib_catalog']) assert.ok(names.includes(name), name);
  assert.ok(replies[1].result.tools.every(tool => tool.inputSchema?.type === 'object'));
  assert.match(replies[2].result.structuredContent.results[0].id, /^webhook-(?:verification|signature)$/);
  assert.match(replies[3].result.structuredContent.implementations.go.commands[0], /add go-totp/);
  assert.match(replies[4].result.structuredContent.text, /^## Adding a capability/);
  assert.ok(replies[5].result.structuredContent.questions.length >= 1);
  assert.equal(replies[6].result.isError, true);
  assert.equal(replies[7].error.code, -32601);
  // Brief tools answer with compact text for the model and the structured result alongside it.
  assert.equal(replies[8].result.structuredContent.best, 'capability:signed-cursors');
  assert.match(replies[8].result.content[0].text, /add kotlin-signed-cursors/);
  assert.ok(replies[8].result.content[0].text.length < 600);
  assert.match(replies[9].result.content[0].text, /pub fn ics_calendar/);
  assert.equal(replies[2].result.structuredContent.results[0].summary, undefined);
  assert.ok(replies[10].result.structuredContent.results[0].summary.length > 0);
});

test('MCP server falls back to its newest protocol version and rejects malformed JSON', async () => {
  const replies = await mcp([{ id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }]);
  assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  const child = spawnSync(process.execPath, [root + 'bin/genlib-mcp.mjs'], { input: '{not json\n', encoding: 'utf8' });
  assert.equal(JSON.parse(child.stdout.trim()).error.code, -32700);
});

test('the read-only MCP can inspect an integration returned by its search', async () => {
  const replies = await mcp([
    { id: 1, method: 'tools/list' },
    { id: 2, method: 'tools/call', params: { name: 'genlib_find', arguments: { query: 'resumable file uploads', type: 'integration', limit: 1 } } },
    { id: 3, method: 'tools/call', params: { name: 'genlib_inspect', arguments: { type: 'integration', id: 'resumable-files' } } },
  ]);
  const inspect = replies[0].result.tools.find(tool => tool.name === 'genlib_inspect');
  assert.ok(inspect.inputSchema.properties.type.enum.includes('integration'));
  assert.equal(replies[1].result.structuredContent.results[0].id, 'resumable-files');
  assert.equal(replies[2].result.isError, false);
  assert.equal(replies[2].result.structuredContent.id, 'resumable-files');
  assert.match(replies[2].result.structuredContent.contract, /resumable/i);
  assert.ok(replies[2].result.structuredContent.files.length > 0);
});

test('the committed navigation graph is current and connects types, languages and capabilities', () => {
  const check = spawnSync(process.execPath, [root + 'scripts/build-graph.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, 'Run npm run graph:build: ' + check.stdout);
  const graph = JSON.parse(readFileSync(root + 'registry/graph.json', 'utf8'));
  const ids = new Set(graph.nodes.map(node => node.id));
  for (const id of ['genlib', 'type:capability', 'type:resource', 'type:doc', 'language:go', 'capability:totp']) assert.ok(ids.has(id), id);
  assert.ok(graph.links.every(edge => ids.has(edge.source) && ids.has(edge.target)));
  assert.ok(graph.links.some(edge => edge.source === 'capability:totp' && edge.target === 'language:swift'));
});

test('Obsidian export writes linked notes and never replaces a user note', t => {
  const vault = mkdtempSync(path.join(tmpdir(), 'genlib-vault-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const out = path.join(vault, 'genlib');
  mkdirSync(out);
  writeFileSync(path.join(out, 'Genlib.md'), 'my own note\n');
  const run = () => spawnSync(process.execPath, [root + 'scripts/export-obsidian.mjs', '--out', out, '--types', 'capability'], { encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).skippedUserNotes, 1);
  assert.equal(readFileSync(path.join(out, 'Genlib.md'), 'utf8'), 'my own note\n');
  const totp = readFileSync(path.join(out, 'Entries/capability/totp.md'), 'utf8');
  assert.match(totp, /^---\ngenerator: "genlib"/);
  assert.match(totp, /\[\[Types\/capability\]\]/);
  assert.match(totp, /\[\[Languages\/go\]\]/);
  assert.ok(existsSync(path.join(out, 'Languages/go.md')));
  // A second run replaces its own notes (and still skips the user note).
  const second = JSON.parse(run().stdout);
  assert.ok(second.written > 0);
  assert.equal(second.skippedUserNotes, 1);
});

test('every wikilink in an exported vault resolves to a note, including links from record text', t => {
  const vault = mkdtempSync(path.join(tmpdir(), 'genlib-vault-links-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  // The API index holds a description with literal [[Demo]](url) text; it must not become a wikilink.
  const run = spawnSync(process.execPath, [root + 'scripts/export-obsidian.mjs', '--out', vault, '--types', 'api,capability,doc'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const files = readdirSync(vault, { recursive: true }).filter(name => name.endsWith('.md'));
  const notes = new Set(files.map(name => name.replace(/\.md$/, '')));
  const bases = new Set(files.map(name => path.basename(name, '.md')));
  const broken = [];
  for (const name of files) for (const match of readFileSync(path.join(vault, name), 'utf8').matchAll(/\[\[([^\]|#]+)/g)) {
    const target = match[1].trim();
    if (!notes.has(target) && !bases.has(target)) broken.push(`${name} -> ${target}`);
  }
  assert.deepEqual(broken.slice(0, 5), []);
});
