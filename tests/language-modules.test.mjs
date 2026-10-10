import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const run=(...args)=>execFileSync(process.execPath,['tools/language-modules.mjs',...args],{encoding:'utf8'});
test('every registered language example is discoverable and its files exist',()=>{
 const catalog=JSON.parse(readFileSync('examples/languages/modules.json','utf8')).modules;
 const list=JSON.parse(run('list'));assert.equal(list.length,catalog.length);assert.ok(list.length>=54);
 assert.equal(new Set(list.map(item=>item.id)).size,list.length);
 for(const item of catalog){
  const base=item.base==='cookbook'?'examples/cookbook':'examples/languages';
  assert.ok(item.files.length,item.id);
  for(const file of [...item.files,...item.tests])assert.ok(existsSync(join(base,file)),item.id+': '+file);
 }
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
