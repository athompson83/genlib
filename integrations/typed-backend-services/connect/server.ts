// SPDX-License-Identifier: Apache-2.0
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {ConnectError,Code,type Interceptor} from '@connectrpc/connect';
import {connectNodeAdapter} from '@connectrpc/connect-node';
import {InventoryService} from '../generated/genlib/inventory/v1/inventory_pb.js';
import {memoryRepository,type InventoryRepository} from './repository.js';
export function inventoryRpcServer({repository,authorize}:{repository:InventoryRepository;authorize:(headers:Headers)=>Promise<void>}) {
  const authentication:Interceptor=next=>async request=>{await authorize(request.header);return next(request);};
  return createServer(connectNodeAdapter({
    interceptors:[authentication],
    readMaxBytes:65536,
    routes(router) {router.service(InventoryService,{
      async createItem(request){return {item:await repository.create(request.title)};},
      async getItem(request){
        const item=await repository.get(request.id);
        if(!item) throw new ConnectError('Item not found',Code.NotFound);
        return {item};
      },
      async listItems(request){return repository.list(request.cursor,request.pageSize||20);},
    });},
  }));
}
export function fixtureAuthorization(expectedToken:string) {
  return async(headers:Headers)=>{if(headers.get('authorization')!=='Bearer '+expectedToken) throw new ConnectError('Authentication required',Code.Unauthenticated);};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=inventoryRpcServer({repository:memoryRepository(),authorize:fixtureAuthorization('genlib-fixture-token')});
  server.listen(4320,'127.0.0.1',()=>console.log('Local Connect RPC fixture http://127.0.0.1:4320'));
}
