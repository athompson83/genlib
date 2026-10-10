import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const run=(...args)=>JSON.parse(execFileSync(process.execPath,['tools/agent-recipes.mjs',...args],{encoding:'utf8'}));
test('agent recipes offer bounded task-oriented selection',()=>{
 assert.ok(run('validate').entries>=10);
 const results=run('find','shopping cart');
 assert.ok(results.matches.length<=5);
 assert.equal(results.matches[0].id,'storefront-cart');
 assert.ok(run('inspect','csv-export').checks.some(x=>x.includes('authorization')));
});
