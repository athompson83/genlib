// SPDX-License-Identifier: Apache-2.0
import {createClient,type Interceptor} from '@connectrpc/connect';
import {createConnectTransport} from '@connectrpc/connect-web';
import {InventoryService} from '../generated/genlib/inventory/v1/inventory_pb.js';
// Browser-compatible transport: use an app session/token intended for this service,
// never a privileged service credential. The server owns CORS and authorization.
export function inventoryClient(baseUrl:string,sessionToken:()=>Promise<string>) {
  const authentication:Interceptor=next=>async request=>{request.header.set('authorization','Bearer '+await sessionToken());return next(request);};
  return createClient(InventoryService,createConnectTransport({baseUrl,interceptors:[authentication]}));
}
