// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {MAX_TEXT_BYTES,validateTextSelection,validateToken,trustedFeed,createCredentialBoundary,createUpdateFlow} from '../core/native-boundary.mjs';
import {createNativeServices} from '../electron/native-services.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('selected text rejects traversal, unsupported formats, malformed UTF-8 and oversized bytes',()=>{
 assert.deepEqual(validateTextSelection('fixture.md',Buffer.from('Hello')), {name:'fixture.md',contents:'Hello'});
 for(const name of ['../a.txt','x\\a.md','archive.zip'])assert.throws(()=>validateTextSelection(name,Buffer.from('ok')));
 for(const bytes of [Buffer.from([255]),Buffer.from([0]),Buffer.alloc(MAX_TEXT_BYTES+1)])assert.throws(()=>validateTextSelection('a.txt',bytes));
});
test('tokens and trusted feed inputs fail before native or network work',()=>{
 for(const value of ['',null,'line\nbreak','x'.repeat(2049)])assert.throws(()=>validateToken(value));
 for(const value of ['http://example.invalid/','https://user:pass@example.invalid/','https://example.invalid/?token=secret','https://example.invalid/#fragment'])assert.throws(()=>trustedFeed(value));
 assert.equal(trustedFeed('https://updates.example.invalid/app/'),'https://updates.example.invalid/app/');
});
test('credential operations serialize, expose presence only and sanitize native errors',async()=>{
 let token=null;const pending=deferred(),calls=[];
 const vault=createCredentialBoundary({async save(value){calls.push('save');await pending.promise;token=value;},async load(){calls.push('load');return token;},async clear(){token=null;}});
 const saved=vault.save('private-fixture-token'),status=vault.status();await Promise.resolve();assert.deepEqual(calls,['save']);
 pending.resolve();assert.deepEqual(await saved,{present:true});assert.deepEqual(await status,{present:true});assert.deepEqual(await vault.clear(),{present:false});assert.deepEqual(await vault.status(),{present:false});
 const failing=createCredentialBoundary({async load(){throw new Error('secret native path');}});
 await assert.rejects(failing.status(),error=>error.message==='OS secure storage is unavailable');
});
test('update actions require ordered user consent and reject simultaneous checks',async()=>{
 const check=deferred(),calls=[];const flow=createUpdateFlow({check:()=>check.promise,async download(){calls.push('download');},async restart(){calls.push('restart');}});
 await assert.rejects(flow.restart());await assert.rejects(flow.download());const checking=flow.check();await assert.rejects(flow.check());
 check.resolve('0.2.0');assert.equal((await checking).state,'available');assert.deepEqual(calls,[]);
 assert.equal((await flow.download()).state,'ready');assert.deepEqual(calls,['download']);await assert.rejects(flow.check());
 assert.equal((await flow.restart()).state,'restarting');assert.deepEqual(calls,['download','restart']);
});
test('failed verification never enables install; an explicit new check is required',async()=>{
 let broken=true;const flow=createUpdateFlow({async check(){return '0.2.0';},async download(){if(broken)throw new Error('invalid signature');},async restart(){throw new Error('must not run');}});
 await flow.check();await assert.rejects(flow.download());assert.equal(flow.status().state,'failed');await assert.rejects(flow.restart());await assert.rejects(flow.download());
 broken=false;await flow.check();assert.equal((await flow.download()).state,'ready');
});
class FakeUpdater extends EventEmitter {
 calls=[];setFeedURL(value){this.feed=value;}
 async checkForUpdates(){this.calls.push('check');this.emit('update-available');return {updateInfo:{version:'0.2.0'}};}
 async downloadUpdate(){this.calls.push('download');}
 quitAndInstall(...args){this.calls.push(['restart',...args]);}
}
test('Electron adapter uses picker result, bounded file IO and encrypted fixed-slot persistence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'genlib-desktop-'));try{
 const path=join(root,'fixture.md');await writeFile(path,'Original fixture');let selected={canceled:false,filePaths:[path]};const updater=new FakeUpdater();
 const services=createNativeServices({app:{getPath:()=>root,isPackaged:true},window:{},dialog:{showOpenDialog:async()=>selected},safeStorage:{
  isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:value=>Buffer.from('cipher:'+Buffer.from(value).toString('base64')),decryptString:value=>Buffer.from(value.toString().slice(7),'base64').toString(),
 },autoUpdater:updater,feed:'https://updates.example.invalid/app/'});
 assert.deepEqual(await services.pickText(),{name:'fixture.md',contents:'Original fixture'});
 selected={canceled:true,filePaths:[]};assert.equal(await services.pickText(),null);
 await services.vault.save('private-fixture-token');assert.deepEqual(await services.vault.status(),{present:true});
 assert.equal((await readFile(join(root,'inventory-session.encrypted'),'utf8')).includes('private-fixture-token'),false);
 await services.vault.clear();assert.deepEqual(await services.vault.status(),{present:false});
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);
 await services.updates.check();await services.updates.download();assert.deepEqual(updater.calls,['check','download']);await services.updates.restart();assert.deepEqual(updater.calls.at(-1),['restart',false,true]);
 await writeFile(path,Buffer.alloc(MAX_TEXT_BYTES+1));selected={canceled:false,filePaths:[path]};await assert.rejects(services.pickText());
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Electron secure storage fails closed without a real backend',async()=>{
 const services=createNativeServices({app:{getPath:()=>'/unused',isPackaged:false},dialog:{},safeStorage:{isEncryptionAvailable:()=>false},autoUpdater:new FakeUpdater(),window:{}});
 await assert.rejects(services.vault.save('token'));await assert.rejects(services.vault.status());await assert.rejects(services.updates.check());
});
