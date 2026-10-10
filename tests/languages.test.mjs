import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const run=(...args)=>JSON.parse(execFileSync(process.execPath,['tools/languages.mjs',...args],{encoding:'utf8'}));
test('language catalog validates and covers major mobile and backend stacks',()=>{
 const report=run('validate');assert.ok(report.languages>=25);
 for(const name of ['Swift','Kotlin','Dart','Python','Go','Rust','C#','TypeScript','Java','PHP']){
  const item=run('inspect',name);assert.equal(item.name,name);assert.equal(item.status,'reference-only');
 }
 assert.ok(run('list','swift').some(x=>x.name==='Swift'));
});
