// SPDX-License-Identifier: Apache-2.0
// Explicit opt-in CLI gate against a disposable loopback server only.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inventoryServer} from '../fixture/server.mjs';
const tool=process.argv[2];
if(!['hurl','schemathesis'].includes(tool))throw new Error('Usage: node http/run-fixture-check.mjs hurl|schemathesis');
const server=inventoryServer();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`;
const args=tool==='hurl'
 ? ['--test','--variable','base_url='+base,'--variable','token=genlib-fixture-token','http/inventory.hurl']
 : ['run','schema/openapi.json','--url',base,'--header','Authorization: Bearer genlib-fixture-token','--checks','all','--phases','examples,coverage,fuzzing','--max-examples','15','--workers','1','--seed','42','--generation-database',':memory:','--max-failures','5'];
try{
 await new Promise((resolve,reject)=>{
  const child=spawn(tool,args,{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit'});
  child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${tool} failed with ${signal??code}`)));
 });
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
