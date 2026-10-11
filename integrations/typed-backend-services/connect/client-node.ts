// SPDX-License-Identifier: Apache-2.0
import {createClient,type Interceptor} from '@connectrpc/connect';
import {createConnectTransport} from '@connectrpc/connect-node';
import {InventoryService} from '../generated/genlib/inventory/v1/inventory_pb.js';
export function inventoryNodeClient(baseUrl:string,sessionToken:()=>Promise<string>) {
  const authentication:Interceptor=next=>async request=>{request.header.set('authorization','Bearer '+await sessionToken());return next(request);};
  return createClient(InventoryService,createConnectTransport({baseUrl,httpVersion:'1.1',interceptors:[authentication],defaultTimeoutMs:5000}));
}
