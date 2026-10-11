// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('ETag revalidation returns bodyless 304, respects authentication and invalidates a changed page',()=>using(async base=>{
  const create=title=>fetch(base+'/items',{method:'POST',headers,body:JSON.stringify({title})});
  const item=await (await create('First')).json();
  const first=await fetch(base+'/items',{headers}), tag=first.headers.get('etag');
  assert.match(tag,/^"[a-f0-9]{64}"$/); assert.equal(first.headers.get('cache-control'),'private, max-age=0, must-revalidate');
  assert.equal(first.headers.get('vary'),'Authorization'); await first.body.cancel();
  const same=await fetch(base+'/items',{headers:{...headers,'if-none-match':'"other", W/'+tag}});
  assert.equal(same.status,304); assert.equal(await same.text(),''); assert.equal(same.headers.get('etag'),tag);
  assert.equal((await fetch(base+'/items',{headers:{'if-none-match':tag}})).status,401);
  await create('Second');
  const changed=await fetch(base+'/items',{headers:{...headers,'if-none-match':tag}});
  assert.equal(changed.status,200); assert.notEqual(changed.headers.get('etag'),tag); assert.equal((await changed.json()).items.length,2);
  const single=await fetch(base+'/items/'+item.id,{headers}); const singleTag=single.headers.get('etag'); await single.body.cancel();
  assert.equal((await fetch(base+'/items/'+item.id,{headers:{...headers,'if-none-match':singleTag}})).status,304);
}));

test('chunk upload resumes at the stored offset and completes the exact bytes once',()=>using(async base=>{
  const create=await fetch(base+'/uploads',{method:'POST',headers,body:JSON.stringify({filename:'hello.txt',length:11})});
  assert.equal(create.status,201); const upload=await create.json(), url=base+'/uploads/'+upload.id;
  assert.equal(create.headers.get('location'),'/uploads/'+upload.id);
  assert.equal((await fetch(url+'/complete',{method:'POST',headers})).status,409);
  const patch=(offset,body)=>fetch(url,{method:'PATCH',headers:{...headers,'content-type':'application/octet-stream','upload-offset':String(offset)},body});
  assert.equal((await patch(0,'Hello ')).headers.get('upload-offset'),'6');
  const resumed=await fetch(url,{method:'HEAD',headers}); assert.equal(resumed.headers.get('upload-offset'),'6'); assert.equal(resumed.headers.get('upload-length'),'11');
  assert.equal((await patch(0,'Hello ')).status,409);
  assert.equal((await patch(6,'world')).status,204);
  const result=await (await fetch(url+'/complete',{method:'POST',headers})).json();
  assert.equal(result.offset,11); assert.equal(result.completed,true); assert.equal(result.sha256,createHash('sha256').update('Hello world').digest('hex'));
  assert.deepEqual(await (await fetch(url+'/complete',{method:'POST',headers})).json(),result);
  assert.equal((await patch(11,'!')).status,409);
  assert.deepEqual(await (await fetch(url,{headers})).json(),result);
}));

test('upload failures and competing chunks cannot corrupt offsets or bypass authorization',()=>using(async base=>{
  assert.equal((await fetch(base+'/uploads',{method:'POST',headers:{'content-type':'application/json'},body:'{"filename":"x.txt","length":1}'})).status,401);
  for(const body of [{filename:'../outside',length:1},{filename:'x.txt',length:-1},{filename:'x.txt',length:1048577}])
    assert.equal((await fetch(base+'/uploads',{method:'POST',headers,body:JSON.stringify(body)})).status,400);
  const created=await fetch(base+'/uploads',{method:'POST',headers,body:'{"filename":"x.txt","length":2}'}); const {id}=await created.json(), url=base+'/uploads/'+id;
  assert.equal((await fetch(url,{method:'HEAD'})).status,401);
  assert.equal((await fetch(url,{method:'PATCH',headers:{...headers,'upload-offset':'0'},body:'a'})).status,415);
  const patch=(body,offset='0')=>fetch(url,{method:'PATCH',headers:{...headers,'content-type':'application/octet-stream','upload-offset':offset},body});
  assert.equal((await patch('abc')).status,409); assert.equal((await patch('a','invalid')).status,400);
  const responses=await Promise.all([patch('a'),patch('b')]); assert.deepEqual(responses.map(response=>response.status).sort(),[204,409]);
  const current=await (await fetch(url,{headers})).json(); assert.equal(current.offset,1); assert.equal(current.completed,false);
  assert.equal((await fetch(url+'/complete',{method:'POST',headers})).status,409);
}));
