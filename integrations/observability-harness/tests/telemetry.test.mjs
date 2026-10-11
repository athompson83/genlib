// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {InMemorySpanExporter,AlwaysOnSampler} from '@opentelemetry/sdk-trace-base';
import {createTelemetry,safeAttributes} from '../node/telemetry.mjs';
test('real spans retain correlation and omit sensitive input and exception details',async()=>{
 const exporter=new InMemorySpanExporter();const telemetry=createTelemetry({serviceName:'inventory-test',exporter,batching:false,sampler:new AlwaysOnSampler()});
 const logs=[];
 try{
  await telemetry.operation('inventory.list',{'request.id':'fixture-1','authorization':'secret-token','db.query.text':'private query'},async()=>{
    await Promise.resolve();telemetry.log(line=>logs.push(line),'inventory.loaded',{'request.id':'fixture-1','password':'secret-password'});
  });
  await assert.rejects(telemetry.operation('inventory.fail',{},async()=>{throw new Error('secret exception payload');}));
  const spans=exporter.getFinishedSpans();assert.equal(spans.length,2);
  assert.equal(logs[0].traceId,spans[0].spanContext().traceId);assert.ok(logs[0].spanId);
  assert.equal(spans[0].attributes['request.id'],'fixture-1');assert.equal(spans[0].attributes.authorization,undefined);
  assert.equal(spans[1].status.code,2);assert.equal(spans[1].events.length,0);
  assert.ok(!JSON.stringify({logs,attributes:spans.map(s=>s.attributes),events:spans.map(s=>s.events)}).includes('secret'));
 }finally{await telemetry.shutdown();}
});
test('operational attributes use an explicit bounded allowlist',()=>{
 assert.deepEqual(safeAttributes({'operation':'list','private.title':'Sensitive',cookie:'token','request.id':'x'.repeat(200)}),{'operation':'list','request.id':'x'.repeat(128)});
 assert.throws(()=>createTelemetry({serviceName:'valid',endpoint:'http://remote.example.test'}));
});
