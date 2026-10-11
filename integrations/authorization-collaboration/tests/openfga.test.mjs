// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenFgaGate, AccessDenied, AuthorizationUnavailable } from '../openfga/gate.mjs';
const base={apiUrl:'https://fga.example.test',storeId:'01ARZ3NDEKTSV4RRFFQ69G5FAV',modelId:'01ARZ3NDEKTSV4RRFFQ69G5FAW',token:async()=> 'injected-test-token'};
test('server check pins model, authenticated actor and consistency',async()=>{
  let calls=0;
  const gate=createOpenFgaGate({...base,fetch:async(url,init)=>{
    calls++;assert.equal(url.href,'https://fga.example.test/stores/'+base.storeId+'/check');
    const body=JSON.parse(init.body);assert.equal(body.authorization_model_id,base.modelId);
    assert.deepEqual(body.tuple_key,{user:'user:alice',relation:'editor',object:'document:inventory'});
    assert.equal(body.consistency,'HIGHER_CONSISTENCY');assert.equal(init.headers.authorization,'Bearer injected-test-token');
    return Response.json({allowed:true});
  }});
  await gate.assertAllowed({actor:'alice',document:'inventory',relation:'editor'});assert.equal(calls,1);
});
test('denied, unavailable, oversized and malformed results prevent access',async()=>{
  const check=response=>createOpenFgaGate({...base,fetch:async()=>response}).assertAllowed({actor:'alice',document:'inventory'});
  await assert.rejects(check(Response.json({allowed:false})),AccessDenied);
  await assert.rejects(check(Response.json({allowed:'true'})),AuthorizationUnavailable);
  await assert.rejects(check(new Response('private-service-details',{status:503})),e=>e instanceof AuthorizationUnavailable&&!e.message.includes('private'));
  await assert.rejects(check(new Response('x'.repeat(65537))),AuthorizationUnavailable);
  await assert.rejects(createOpenFgaGate({...base,fetch:async()=>{throw new Error('offline');}}).assertAllowed({actor:'alice',document:'inventory'}),AuthorizationUnavailable);
});
test('untrusted origins and malformed IDs are rejected before transport',async()=>{
  assert.throws(()=>createOpenFgaGate({...base,apiUrl:'http://remote.example.test'}));
  assert.throws(()=>createOpenFgaGate({...base,apiUrl:'https://user:secret@fga.example.test'}));
  const gate=createOpenFgaGate({...base,fetch:()=>{throw new Error('must not be called');}});
  await assert.rejects(gate.assertAllowed({actor:'user:forged',document:'inventory'}),TypeError);
});
