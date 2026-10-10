// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rewriteImports } from '../codemods/imports.mjs';
import { replaceConsoleLog } from '../codemods/ast-rewrite.mjs';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
test('static migration preserves strings/comments and is idempotent', () => {
  const { source, count } = rewriteImports(read('fixtures/before.ts'), '@legacy/client', '@app/client');
  assert.equal(source, read('fixtures/after.ts')); assert.equal(count, 2);
  assert.deepEqual(rewriteImports(source, '@legacy/client', '@app/client'), { source, count: 0 });
});
test('AST edit excludes textual and other console matches', () => {
  const output = replaceConsoleLog(read('fixtures/console-before.ts'));
  assert.equal(output, read('fixtures/console-after.ts'));
  assert.equal(replaceConsoleLog(output), output);
});
test('architecture profile accepts shared code and rejects client/server edge', () => {
  const root = mkdtempSync(join(tmpdir(),'genlib-architecture-'));
  try {
    mkdirSync(join(root,'client')); mkdirSync(join(root,'server')); mkdirSync(join(root,'shared'));
    writeFileSync(join(root,'shared','label.js'),'export const label = 1;');
    writeFileSync(join(root,'server','secret.js'),'export const secret = 1;');
    writeFileSync(join(root,'client','main.js'),"import { secret } from '../server/secret.js'; export { secret };\n");
    const cli = new URL('../node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', import.meta.url);
    const config = new URL('../dependency-cruiser.config.cjs', import.meta.url);
    const out = spawnSync(process.execPath,[cli.pathname,'.','--config',config.pathname,'--output-type','json'],{cwd:root,encoding:'utf8'});
    assert.ifError(out.error); assert.ok(out.stdout, out.stderr);
    assert.equal(out.status, 0); const report = JSON.parse(out.stdout);
    assert.equal(report.summary.advisedExitCode,1);
    assert.ok(report.summary.violations.some(v=>v.rule.name === 'client-cannot-import-server'));
    const gate = spawnSync(process.execPath,[cli.pathname,'.','--config',config.pathname,'--output-type','err'],{cwd:root,encoding:'utf8'});
    assert.equal(gate.status,1,gate.stdout+gate.stderr);
    writeFileSync(join(root,'client','main.js'),"import { label } from '../shared/label.js'; export { label };\n");
    const valid = spawnSync(process.execPath,[cli.pathname,'.','--config',config.pathname,'--output-type','json'],{cwd:root,encoding:'utf8'});
    assert.equal(valid.status,0,valid.stdout+valid.stderr);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
