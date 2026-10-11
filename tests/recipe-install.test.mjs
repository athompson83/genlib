import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const call=(file,...args)=>JSON.parse(execFileSync(process.execPath,['tools/'+file+'.mjs',...args],{encoding:'utf8'}));
test('compatibility requires explicit platform confirmation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-compat-'));
 try{
  const profile=join(dir,'project.json');
  writeFileSync(profile,JSON.stringify({language:'typescript',framework:'react',runtime:'node'}));
  assert.equal(call('recipe-compat','assess','storefront-cart','--project',profile).status,'candidate');
  assert.equal(call('recipe-compat','assess','ui-primitives','--project',profile).status,'review-required');
  writeFileSync(profile,JSON.stringify({language:'python',framework:'django',runtime:'python'}));
  assert.equal(call('recipe-compat','assess','storefront-cart','--project',profile).status,'review-required');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('recipe source installation plans, copies and refuses overwrite and symlinks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-copy-'));
 try{
  const plan=call('recipe-install','plan','storefront-cart','--target',dir);
  const added=call('recipe-install','add','storefront-cart','--target',dir);
  assert.equal(plan.sha256,added.sha256);
  assert.ok(readFileSync(added.destination).length>0);
  assert.notEqual(spawnSync(process.execPath,['tools/recipe-install.mjs','add','storefront-cart','--target',dir]).status,0);
  mkdirSync(join(dir,'elsewhere'));
  symlinkSync(join(dir,'elsewhere'),join(dir,'link'));
  assert.notEqual(spawnSync(process.execPath,['tools/recipe-install.mjs','plan','csv-export','--target',join(dir,'link')]).status,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('recipes land as one file under genlib/ or --into, not under Genlib\'s own folder tree',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-into-'));
 try{
  const flat=call('recipe-install','add','webhook-signature','--target',dir);
  assert.equal(flat.destination,join(dir,'genlib','webhook-signature.ts'));
  const into=call('recipe-install','add','csv-safe','--target',dir,'--into','src/lib');
  assert.equal(into.destination,join(dir,'src','lib','csv-safe.ts'));
  for(const bad of ['../outside','/abs','a/../b','.git'])assert.notEqual(spawnSync(process.execPath,['tools/recipe-install.mjs','plan','csv-export','--target',dir,'--into',bad]).status,0,bad);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
