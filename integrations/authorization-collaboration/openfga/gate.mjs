// SPDX-License-Identifier: Apache-2.0
export class AuthorizationUnavailable extends Error { constructor() { super('Authorization service unavailable'); } }
export class AccessDenied extends Error { constructor() { super('Access denied'); } }
const ulid = value => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
/** Server-only. Actor must come from trusted session identity, never request body claims. */
export function createOpenFgaGate({apiUrl, storeId, modelId, token, fetch: transport=globalThis.fetch, timeoutMs=3000, allowLocalHttp=false}) {
  const origin = new URL(apiUrl);
  const local = ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(allowLocalHttp && local && origin.protocol==='http:'))) throw new TypeError('Use a trusted HTTPS origin');
  if(!ulid(storeId)||!ulid(modelId)||typeof token!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1) throw new TypeError('Pinned store/model IDs, token callback and positive timeout required');
  return { async assertAllowed({actor, document, relation='viewer', signal}) {
    if(!identifier(actor)||!identifier(document)||!['viewer','editor','owner'].includes(relation)) throw new TypeError('Invalid authorization input');
    let response;
    try {
      const authorization = await token();
      response = await transport(new URL(`/stores/${storeId}/check`,origin), {
        method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+authorization},
        body:JSON.stringify({authorization_model_id:modelId,tuple_key:{user:'user:'+actor,relation,object:'document:'+document},consistency:'HIGHER_CONSISTENCY'}),
        signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])])
      });
      if(!response.ok) throw new Error('Service failure');
      const length = Number(response.headers.get('content-length')||0);
      if(length>65536) throw new Error('Response too large');
      const reader=response.body?.getReader(); let size=0; const parts=[];
      if(!reader) throw new Error('Missing response');
      try { while(true) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>65536) throw new Error('Response too large'); parts.push(value); } }
      finally { await reader.cancel().catch(()=>{}); }
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      const result=JSON.parse(new TextDecoder().decode(bytes));
      if(typeof result.allowed!=='boolean') throw new Error('Invalid decision');
      if(!result.allowed) throw new AccessDenied();
    } catch(error) {
      if(error instanceof AccessDenied) throw error;
      throw new AuthorizationUnavailable();
    }
  }};
}
