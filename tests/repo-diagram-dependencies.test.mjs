import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const run=(...args)=>execFileSync(process.execPath,args,{encoding:'utf8'}).trim();
test('diagram includes stable dependency group edges from AST graph',()=>{
 run('tools/repo-map.mjs','build');
 run('tools/repo-deps.mjs','build');
 run('tools/repo-ast.mjs','build');
 const output=run('tools/repo-diagram.mjs');
 assert.match(output,/Generated docs\/diagrams\/repository.mmd/);
 const before=readFileSync('docs/diagrams/repository.mmd','utf8');
 assert.match(before,/flowchart TD/);
 assert.match(before,/ROOT --> G/);
 run('tools/repo-diagram.mjs');
 assert.equal(readFileSync('docs/diagrams/repository.mmd','utf8'),before);
});
