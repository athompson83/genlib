import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { outlineSource, outline } from '../lib/outline.mjs';
import { actionCommands, briefResult, quickPick } from '../lib/brief.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = (...args) => execFileSync(process.execPath, [root + 'bin/genlib.mjs', ...args], { cwd: root, encoding: 'utf8' });
const bytes = text => Buffer.byteLength(text);
// Budgets are measured with the placeholder path, so they do not depend on where the checkout lives.
const sized = (...args) => execFileSync(process.execPath, [root + 'bin/genlib.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GENLIB_ROOT: '$GENLIB_ROOT' } });

test('quick prints only the best match, its acting commands and an outline hint', () => {
  const text = cli('quick', 'csv', 'export', '--language', 'python');
  assert.match(text, /^capability:csv-safe /);
  assert.match(text, /language-modules\.mjs add python-csv-safe --target "\$APP_ROOT" --with-tests --flat/);
  // Text output names the real checkout path instead of "$GENLIB_ROOT", so commands run as printed.
  assert.match(text, /# api: node "[^"$]+"\/bin\/genlib\.mjs outline capability:csv-safe --language python/);
  assert.doesNotMatch(text, /inspect|Read docs/);
  const quickSize = bytes(sized('quick', 'csv', 'export', '--language', 'python'));
  assert.ok(quickSize <= 600, 'quick budget: ' + quickSize);
  // A capability's known limit is shown before copying, within the same budget.
  const diff = cli('quick', 'unified', 'diff', '--language', 'python');
  assert.match(diff, /^# caveat: .*GNU diff/m);
  const diffSize = bytes(sized('quick', 'unified', 'diff', '--language', 'python'));
  assert.ok(diffSize <= 600, 'quick budget with caveat: ' + diffSize);
  const json = JSON.parse(cli('quick', 'verify', 'stripe', 'webhook', '--json'));
  // Both are Genlib's tested code for this task: the 9-language capability or the TypeScript module.
  assert.match(json.best, /^(?:capability:webhook-signature|module:webhook-verification)$/);
  assert.ok(json.alternatives.some(ref => /webhook-(?:signature|verification)$/.test(ref)));
  assert.ok(json.alternatives.length <= 3);
});

test('find text output stays compact while --json keeps full records', () => {
  const text = cli('find', 'verify', 'stripe', 'webhook');
  assert.match(text, /^1\. (?:capability:webhook-signature|module:webhook-verification) /);
  const findSize = bytes(sized('find', 'verify', 'stripe', 'webhook'));
  assert.ok(findSize <= 2000, 'find budget: ' + findSize);
  const full = JSON.parse(cli('find', 'verify', 'stripe', 'webhook', '--json'));
  assert.ok(full.results[0].summary.length > 0);
  const brief = JSON.parse(cli('find', 'verify', 'stripe', 'webhook', '--json', '--brief'));
  assert.equal(brief.results[0].summary, undefined);
  assert.equal(spawnSync(process.execPath, [root + 'bin/genlib.mjs', 'find', 'csv', '--brief'], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync(process.execPath, [root + 'bin/genlib.mjs', 'find', 'csv', '--language', 'cobol'], { encoding: 'utf8' }).status, 1);
});

test('brief views drop passive commands but keep a lone command', () => {
  assert.deepEqual(actionCommands(['node x inspect a --json', 'npm install a', 'Docs: https://a']), ['npm install a']);
  assert.deepEqual(actionCommands(['node x inspect a --json']), ['node x inspect a --json']);
  const result = briefResult({ type: 'resource', id: 'a', title: 'x'.repeat(100), languages: ['any'], integrationMode: 'license-review', next: ['npm i a'] });
  assert.equal(result.title.length, 72);
  assert.equal(result.review, 'license');
  assert.equal(result.languages, undefined);
  assert.equal(quickPick({ query: 'q', results: [] }).best, null);
});

test('outline extracts public signatures and docs per language and skips private names', () => {
  assert.deepEqual(outlineSource('// Adds.\nexport function add(a: number, b: number): number {\n  return a + b;\n}\nfunction hidden() {}\n', 'typescript'),
    [{ signature: 'export function add(a: number, b: number): number', doc: 'Adds.' }]);
  assert.deepEqual(outlineSource('def run(x: int) -> str:\n    """Runs it."""\n    return ""\n\ndef _private():\n    pass\n', 'python'),
    [{ signature: 'def run(x: int) -> str', doc: 'Runs it.' }]);
  // Quotes inside a docstring's first line do not cut it short.
  assert.equal(outlineSource('def ops(a: str) -> list:\n    """List of ["=" | "-", line] pairs."""\n    return []\n', 'python')[0].doc, 'List of ["=" | "-", line] pairs.');
  assert.deepEqual(outlineSource('// Sum adds.\nfunc Sum(a, b int) int {\n\treturn a + b\n}\nfunc private() {}\n', 'go'), [{ signature: 'func Sum(a, b int) int', doc: 'Sum adds.' }]);
  assert.deepEqual(outlineSource('/// Doubles.\npub fn double(x: i64) -> i64 {\n    x * 2\n}\nfn hidden() {}\n', 'rust'), [{ signature: 'pub fn double(x: i64) -> i64', doc: 'Doubles.' }]);
  assert.deepEqual(outlineSource('export interface Opts {\n  // the size\n  size: number;\n}\n', 'typescript'), [{ signature: 'export interface Opts { size: number; }' }]);
  assert.deepEqual(outlineSource('    /// <summary>Gets <paramref name="x"/>.</summary>\n    public static int Get(int x) {\n    private static int Hide() {\n', 'csharp'),
    [{ signature: 'public static int Get(int x)', doc: 'Gets x.' }]);
});

test('outline resolves capabilities per language and reports measured sizes', async () => {
  for (const language of ['typescript', 'python', 'go', 'rust', 'java', 'kotlin', 'csharp', 'dart', 'swift']) {
    const result = await outline(root, 'capability:money', { language });
    const declarations = result.files.flatMap(file => file.declarations);
    assert.ok(declarations.length >= 3, language + ' has declarations');
    assert.ok(declarations.some(item => /allocate/i.test(item.signature)), language + ' exposes allocate');
    assert.ok(result.outlineBytes * 2 <= result.sourceBytes, `${language} outline budget ${result.outlineBytes}/${result.sourceBytes}`);
  }
  const defaulted = await outline(root, 'totp');
  assert.equal(defaulted.language, 'typescript');
  assert.match(defaulted.note, /--language/);
  const module = await outline(root, 'webhook-verification');
  assert.ok(module.files.every(file => !/\.test\./.test(file.path)));
  await assert.rejects(outline(root, 'no-such-thing'), /No module named/);
  await assert.rejects(outline(root, '../etc/passwd'), /Provide one reference/);
  await assert.rejects(outline(root, 'saml-sso', { language: 'cobol' }), /Language must be one of/);
});

test('the skill, MCP tool list and token report stay within budget and current', () => {
  assert.ok(bytes(readFileSync(root + 'skills/genlib-use/SKILL.md', 'utf8')) <= 5000, 'SKILL.md budget');
  const list = execFileSync(process.execPath, [root + 'bin/genlib-mcp.mjs'], { input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n', encoding: 'utf8' });
  assert.ok(bytes(JSON.stringify(JSON.parse(list).result)) <= 4500, 'tools/list budget');
  const check = spawnSync(process.execPath, [root + 'scripts/token-report.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, 'Run npm run tokens:report: ' + check.stdout);
});
