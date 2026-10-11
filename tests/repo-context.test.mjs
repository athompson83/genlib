import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
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

test('a stale AST dependency graph from an earlier commit falls back to the current relative-import graph',()=>{
 run('tools/repo-map.mjs','build');
 run('tools/repo-deps.mjs','build');
 const file='.genlib/ast-dependencies.json';
 const saved=existsSync(file)?readFileSync(file):null;
 writeFileSync(file,JSON.stringify({schemaVersion:1,commit:'0000000000000000000000000000000000000000',edges:[]}));
 try{
  const data=JSON.parse(run('tools/repo-context.mjs','stripe'));
  assert.ok(data.files.some(f=>f.path.includes('stripe')));
 }finally{if(saved)writeFileSync(file,saved);else rmSync(file,{force:true})}
});
