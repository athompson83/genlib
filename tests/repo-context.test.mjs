import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const run=(...args)=>execFileSync(process.execPath,args,{encoding:'utf8'}).trim();
test('task context returns bounded, commit-specific source candidates',()=>{
 run('tools/repo-map.mjs','build');
 run('tools/repo-deps.mjs','build');
 const data=JSON.parse(run('tools/repo-context.mjs','stripe'));
 assert.ok(data.commit);
 assert.ok(data.files.length>0&&data.files.length<=5);
 assert.ok(data.relatedImports.length<=25);
 assert.ok(data.possibleTests.length<=8);
 assert.ok(data.files.some(f=>f.path.includes('stripe')));
});
