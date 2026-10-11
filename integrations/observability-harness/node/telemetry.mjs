// SPDX-License-Identifier: Apache-2.0
import {trace,SpanStatusCode,isSpanContextValid} from '@opentelemetry/api';
import {NodeSDK} from '@opentelemetry/sdk-node';
import {resourceFromAttributes} from '@opentelemetry/resources';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {BatchSpanProcessor,SimpleSpanProcessor} from '@opentelemetry/sdk-trace-base';
const allowed=new Set(['operation','request.id','db.system.name','error.type','http.response.status_code']);
export function safeAttributes(values={}) {
  const result={};
  for(const [key,value] of Object.entries(values)){
    if(!allowed.has(key)) continue;
    if(typeof value==='string') result[key]=value.slice(0,128);
    else if(typeof value==='number'&&Number.isFinite(value)) result[key]=value;
  }
  return result;
}
function eventCode(value){if(typeof value!=='string'||!/^[a-z][a-z0-9._-]{0,79}$/.test(value))throw new TypeError('Static operation code required');return value;}
/** Call once at trusted server startup; automatic instrumentation is intentionally opt-in. */
export function createTelemetry({serviceName,exporter,endpoint,batching=true,sampler}) {
  if(typeof serviceName!=='string'||!/^[a-z][a-z0-9._-]{0,79}$/.test(serviceName))throw new TypeError('Static service name required');
  if(!exporter){
    if(!endpoint)throw new TypeError('Explicit exporter or OTLP endpoint required');
    const url=new URL(endpoint);
    if(url.username||url.password||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new TypeError('Trusted HTTPS or loopback OTLP endpoint required');
    exporter=new OTLPTraceExporter({url:url.href});
  }
  const processor=batching?new BatchSpanProcessor(exporter):new SimpleSpanProcessor(exporter);
  const sdk=new NodeSDK({resource:resourceFromAttributes({'service.name':serviceName}),autoDetectResources:false,sampler,spanProcessors:[processor]});
  sdk.start();
  const tracer=trace.getTracer('genlib.inventory','0.1.0');
  return {
    async operation(name,attributes,run){
      eventCode(name);
      return tracer.startActiveSpan(name,{attributes:safeAttributes(attributes)},async span=>{
        try{return await run();}
        catch(error){span.setStatus({code:SpanStatusCode.ERROR});span.setAttribute('error.type',String(error?.name??'Error').slice(0,64));throw error;}
        finally{span.end();}
      });
    },
    log(write,event,attributes={}){
      // The API's active span helper also works across awaited operations.
      const context=trace.getActiveSpan()?.spanContext();
      const correlation=context&&isSpanContextValid(context)?{traceId:context.traceId,spanId:context.spanId}:{};
      write({event:eventCode(event),...safeAttributes(attributes),...correlation});
    },
    shutdown:()=>sdk.shutdown(),
  };
}
