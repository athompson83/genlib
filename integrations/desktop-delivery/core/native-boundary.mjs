// SPDX-License-Identifier: Apache-2.0
export const MAX_TEXT_BYTES=256*1024;
export function validateToken(value){
 if(typeof value!=='string'||!value||Buffer.byteLength(value,'utf8')>2048||/[\r\n\0]/.test(value))throw new TypeError('A single-line token of at most 2048 UTF-8 bytes is required');
 return value;
}
export function validateTextSelection(name,bytes){
 if(typeof name!=='string'||name.length>200||/[\\/\0]/.test(name)||!/^.+\.(txt|md|json)$/i.test(name))throw new TypeError('Choose a text, Markdown or JSON file');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_TEXT_BYTES)throw new TypeError('File exceeds 256 KiB');
 const contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(contents.includes('\0'))throw new TypeError('Binary files are not supported');
 return {name,contents};
}
export function trustedFeed(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new TypeError('A trusted HTTPS feed without credentials, query or fragment is required');
 return url.href;
}
export function validVersion(value){
 if(typeof value!=='string'||value.length>100||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value))throw new TypeError('Invalid release version');
 return value;
}
export function createCredentialBoundary(store){
 let tail=Promise.resolve();
 const serial=operation=>{const task=tail.then(operation).catch(()=>{throw new Error('OS secure storage is unavailable');});tail=task.catch(()=>{});return task;};
 return Object.freeze({
  save(value){const token=validateToken(value);return serial(async()=>{await store.save(token);return {present:true};});},
  clear(){return serial(async()=>{await store.clear();return {present:false};});},
  status(){return serial(async()=>{const token=await store.load();if(token!==null)validateToken(token);return {present:token!==null};});},
 });
}
export function createUpdateFlow(adapter){
 let state='idle',version=null;
 const status=()=>({state,version});
 return Object.freeze({status,
  async check(){
   if(!['idle','available','failed'].includes(state))throw new Error('Update operation already in progress');
   state='checking';version=null;
   try{const candidate=await adapter.check();if(candidate===null){state='idle';return status();}version=validVersion(candidate);state='available';return status();}
   catch{state='failed';throw new Error('Update check failed');}
  },
  async download(){
   if(state!=='available')throw new Error('Check for an available update first');
   state='downloading';
   try{await adapter.download(version);state='ready';return status();}
   catch{state='failed';throw new Error('Update download or verification failed');}
  },
  async restart(){
   if(state!=='ready')throw new Error('No verified update is ready');
   state='restarting';
   try{await adapter.restart();return status();}
   catch{state='failed';throw new Error('Update restart failed');}
  },
 });
}
