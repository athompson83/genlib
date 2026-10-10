import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const run=(...args)=>execFileSync(process.execPath,['tools/language-modules.mjs',...args],{encoding:'utf8'});
test('all fourteen language examples are discoverable and have source files',()=>{
 const list=JSON.parse(run('list'));assert.equal(list.length,14);
 for(const item of list){const detail=JSON.parse(run('inspect',item.id));assert.ok(detail.files.length);}
});
test('safe plan and copy without overwrites',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-modules-'));
 try{
  const plan=JSON.parse(run('plan','python-pagination','--target',dir));
  assert.equal(plan.files.length,1);assert.equal(existsSync(join(dir,'genlib/python/pagination.py')),false);
  const added=JSON.parse(run('add','python-pagination','--target',dir));
  assert.equal(readFileSync(added.files[0].destination).length>0,true);
  assert.notEqual(spawnSync(process.execPath,['tools/language-modules.mjs','add','python-pagination','--target',dir]).status,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('rejects symlinked target directories',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-modules-'));
 try{
  mkdirSync(join(dir,'real'));symlinkSync(join(dir,'real'),join(dir,'link'));
  const result=spawnSync(process.execPath,['tools/language-modules.mjs','plan','python-pagination','--target',join(dir,'link')]);
  assert.notEqual(result.status,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
