// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryClient, ApiFailure } from '../.test-build/client.js';
import { inventoryServer } from '../fixture/server.mjs';
const headers={authorization:'Bearer genlib-fixture-token','content-type':'application/json'};
async function using(run) {
  const server=inventoryServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  try { await run(baseUrl); } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}
test('generated-client transport exercises create/get/pagination',()=>using(async baseUrl=>{
  const adapter=createInventoryClient({baseUrl,token:async()=> 'genlib-fixture-token'});
  const client=adapter.raw;
  const created=[];
  for(const title of ['One','Two','Three']) { const r=await client.POST('/items',{body:{title}}); assert.equal(r.response.status,201); created.push(r.data); }
  const first=await adapter.list(); assert.equal(first.items.length,2); assert.equal(first.nextCursor,2);
  const last=await client.GET('/items',{params:{query:{cursor:2}}}); assert.equal(last.data.items[0].title,'Three'); assert.equal(last.data.nextCursor,undefined);
  const item=await client.GET('/items/{id}',{params:{path:{id:created[0].id}}}); assert.equal(item.data.title,'One');
}));
test('authorization and invalid mutations fail without inserting records',()=>using(async base=>{
  assert.equal((await fetch(base+'/items')).status,401);
  for(const body of ['{','{}','{"title":"","admin":true}','{"title":"ok","extra":1}']) assert.equal((await fetch(base+'/items',{method:'POST',headers,body})).status,400);
  assert.equal((await fetch(base+'/items?cursor=-1',{headers})).status,400);
  assert.equal((await fetch(base+'/items/missing',{headers})).status,404);
  const result=await fetch(base+'/items',{headers}); assert.deepEqual((await result.json()).items,[]);
}));

test('adapter normalizes HTTP, network and malformed response errors',()=>using(async baseUrl=>{
  const rejected=createInventoryClient({baseUrl,token:async()=> 'bad'});
  await assert.rejects(rejected.list(),e=>e instanceof ApiFailure && e.kind==='http' && e.status===401);
  const offline=createInventoryClient({baseUrl,token:async()=> 'token',fetch:async()=> {throw new Error('private transport detail');}});
  await assert.rejects(offline.list(),e=>e.kind==='network' && !e.message.includes('private'));
  const malformed=createInventoryClient({baseUrl,token:async()=> 'token',fetch:async()=> Response.json({items:[{id:1}]})});
  await assert.rejects(malformed.list(),e=>e.kind==='invalid-response');
  const brokenJson=createInventoryClient({baseUrl,token:async()=> 'token',fetch:async()=> new Response('{',{headers:{'content-type':'application/json'}})});
  await assert.rejects(brokenJson.list(),e=>e.kind==='invalid-response');
  const credentials=createInventoryClient({baseUrl,token:async()=> {throw new Error('private credential detail');}});
  await assert.rejects(credentials.list(),e=>e.kind==='authentication'&&!e.message.includes('private'));
}));
test('adapter distinguishes timeout from caller cancellation',()=>using(async baseUrl=>{
  const waitForAbort=request=>new Promise((resolve,reject)=>{
    if(request.signal.aborted) reject(request.signal.reason);
    else request.signal.addEventListener('abort',()=>reject(request.signal.reason),{once:true});
  });
  const client=createInventoryClient({baseUrl,token:async()=> 'token',fetch:waitForAbort,timeoutMs:20});
  await assert.rejects(client.list(),e=>e.kind==='timeout');
  const controller=new AbortController(); controller.abort();
  await assert.rejects(client.list(undefined,controller.signal),e=>e.kind==='cancelled');
}));
