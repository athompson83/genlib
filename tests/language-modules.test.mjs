import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync,symlinkSync,mkdirSync,writeFileSync} from 'node:fs';
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
  const plan=JSON.parse(run('plan','python-pagination','--target',dir,'--json'));
  assert.equal(plan.files.length,1);assert.equal(existsSync(join(dir,'genlib/python/pagination.py')),false);
  const added=JSON.parse(run('add','python-pagination','--target',dir,'--json'));
  assert.equal(readFileSync(added.files[0].destination).length>0,true);
  // Text mode: flat copy into a chosen folder, with the API and the command that runs the copied tests.
  // --flat without --into copies straight into the target and says what is already verified.
  const flatDir=mkdtempSync(join(tmpdir(),'genlib-flat-'));
  try{const flatText=run('add','python-totp','--target',flatDir,'--with-tests','--flat');assert.ok(existsSync(join(flatDir,'totp.py'))&&existsSync(join(flatDir,'test_totp.py')));assert.match(flatText,/# repo evidence \(Genlib CI, not this copy\): /);assert.doesNotMatch(flatText,/# caveat:/);const diffText=run('add','python-line-diff','--target',flatDir,'--flat');assert.match(diffText,/# caveat: .*GNU diff/);}finally{rmSync(flatDir,{recursive:true,force:true})}
  // --run-tests copies and runs the tests in one call; the output names what they cover.
  const runDir=mkdtempSync(join(tmpdir(),'genlib-lang-run-'));
  try{const ran=run('add','python-totp','--target',runDir,'--with-tests','--flat','--run-tests');assert.match(ran,/^# tests cover: .*rfc4226_hotp/m);assert.match(ran,/^# tests run: passed on this copy \(Ran 5 tests/m);const java=run('add','java-totp','--target',runDir,'--with-tests','--run-tests');assert.match(java,/# tests run: not supported for java/);}finally{rmSync(runDir,{recursive:true,force:true})}
  const text=run('add','python-rrule','--target',dir,'--with-tests','--into','app','--flat');
  assert.match(text,/app\/rrule\.py/);assert.match(text,/def expand_rrule\(/);assert.match(text,/# test: cd .*app && python3 -m unittest test_rrule/);
  assert.ok(existsSync(join(dir,'app/test_rrule.py')));
  assert.notEqual(spawnSync(process.execPath,['tools/language-modules.mjs','add','python-rrule','--target',dir,'--into','../escape']).status,0);
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
// Regressions from the 2026-10-10 adoption audit: each reproduces a failure seen in an isolated project.
test('plan with tests works before anything is copied',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-plan-'));
 try{const out=run('plan','python-totp','--target',dir,'--with-tests');assert.match(out,/^# tests cover: .*rfc4226_hotp/m);assert.equal(existsSync(join(dir,'genlib')),false);}
 finally{rmSync(dir,{recursive:true,force:true})}
});
test('a failed test run exits non-zero, in text and JSON, and never prints the repository claim',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-fail-')),empty=mkdtempSync(join(tmpdir(),'genlib-nopath-'));
 try{
  // An empty PATH makes python3 unavailable, a deterministic failure without editing copied files.
  const env={...process.env,PATH:empty};
  const text=spawnSync(process.execPath,['tools/language-modules.mjs','add','python-totp','--target',dir,'--with-tests','--flat','--run-tests'],{encoding:'utf8',env});
  assert.equal(text.status,1);assert.match(text.stdout,/# tests run: FAILED on this copy/);assert.doesNotMatch(text.stdout,/repo evidence/);
  const json=spawnSync(process.execPath,['tools/language-modules.mjs','add','python-totp','--target',dir,'--with-tests','--into','j','--run-tests','--json'],{encoding:'utf8',env});
  assert.equal(json.status,1);const result=JSON.parse(json.stdout);assert.equal(result.testRun.status,'failed');assert.deepEqual(result.tests,['j/python/test_totp.py']);
 }finally{rmSync(dir,{recursive:true,force:true});rmSync(empty,{recursive:true,force:true})}
});
test('JSON output runs the tests too',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-json-'));
 try{const r=JSON.parse(run('add','python-totp','--target',dir,'--with-tests','--flat','--run-tests','--json'));assert.equal(r.testRun.status,'passed');assert.match(r.testRun.summary,/^Ran 5 tests/);}
 finally{rmSync(dir,{recursive:true,force:true})}
});
test('a flat copy keeps fixture folders and runs only test modules',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-fixture-'));
 try{
  const r=JSON.parse(run('add','python-webauthn-passkeys','--target',dir,'--with-tests','--flat','--json'));
  assert.ok(existsSync(join(dir,'python/test_passkeys.py'))&&existsSync(join(dir,'fixtures/passkey-es256-none.json')));
  assert.deepEqual(r.tests,['python/test_passkeys.py']);assert.deepEqual(r.testCommand.argv,['python3','-m','unittest','test_passkeys']);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('an existing dependency manifest is kept and its lines reported for merging',()=>{
 const dir=mkdtempSync(join(tmpdir(),'genlib-manifest-'));
 try{
  writeFileSync(join(dir,'requirements.txt'),'flask==3.0.0\n');
  const first=JSON.parse(run('add','python-rich-text-sanitization','--target',dir,'--flat','--json'));
  assert.equal(readFileSync(join(dir,'requirements.txt'),'utf8'),'flask==3.0.0\n');
  assert.equal(first.skipped[0].source.endsWith('requirements.txt'),true);assert.deepEqual(first.skipped[0].merge,['nh3==0.3.7']);
  const second=run('add','python-password-hashing','--target',dir,'--flat');assert.match(second,/^# kept existing requirements\.txt; add: /m);
  assert.ok(existsSync(join(dir,'sanitize.py'))&&existsSync(join(dir,'passwords.py')));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('dependency commands are plain shell commands',()=>{
 for(const m of JSON.parse(readFileSync('examples/languages/modules.json','utf8')).modules)
  for(const d of [...(m.dependencies??[]),...(m.testDependencies??[])])assert.doesNotMatch(d,/[()]/,m.id+': '+d);
});
