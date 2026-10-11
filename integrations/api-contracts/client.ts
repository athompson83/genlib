// SPDX-License-Identifier: Apache-2.0
import createClient from 'openapi-fetch';
import type { paths } from './generated/openapi.js';
export class ApiFailure extends Error {
  public readonly kind: 'http'|'network'|'timeout'|'cancelled'|'invalid-response'|'authentication';
  public readonly status: number | undefined;
  constructor(kind: 'http'|'network'|'timeout'|'cancelled'|'invalid-response'|'authentication', message: string, status?: number) { super(message); this.kind = kind; this.status = status; }
}
/** Inject token acquisition and fetch. The target app owns authorization and secret storage. */
export function createInventoryClient(options: { baseUrl: string; token: () => Promise<string>; fetch?: typeof globalThis.fetch; timeoutMs?: number }) {
  const transport = options.fetch ?? globalThis.fetch;
  const timeoutMs=options.timeoutMs ?? 10_000;
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0) throw new TypeError('Positive timeout required');
  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: async request => {
    let token:string;
    try { token=await options.token(); if(!token||token.length>8192||/[\r\n]/.test(token)) throw new Error('Invalid token'); }
    catch { throw new ApiFailure('authentication','Token acquisition failed'); }
    const timeout=AbortSignal.timeout(timeoutMs);
    const outgoing = new Request(request, { signal: AbortSignal.any([request.signal,timeout]) });
    outgoing.headers.set('Authorization','Bearer '+token);
    try { return await transport(outgoing); }
    catch (error) {
      if(request.signal.aborted) throw new ApiFailure('cancelled','Request cancelled');
      if(timeout.aborted) throw new ApiFailure('timeout','Request timed out');
      throw new ApiFailure('network','API transport failed');
    }
  }});
  return { raw: client, async list(cursor?:number, signal?:AbortSignal) {
    const {data,error,response}=await client.GET('/items',{params:{query:{cursor}},signal}).catch(error=>{
      if(error instanceof ApiFailure) throw error;
      throw new ApiFailure('invalid-response','API response could not be decoded');
    });
    if(error) throw new ApiFailure('http',error.message,response.status);
    if(!data || !Array.isArray(data.items) || data.items.some(item=>!item||typeof item.id!=='string'||typeof item.title!=='string'||typeof item.completed!=='boolean') || (data.nextCursor!==undefined && (!Number.isSafeInteger(data.nextCursor)||data.nextCursor<0))) throw new ApiFailure('invalid-response','Invalid inventory page');
    return data;
  }};
}
