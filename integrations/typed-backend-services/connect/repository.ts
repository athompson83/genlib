// SPDX-License-Identifier: Apache-2.0
import {randomUUID} from 'node:crypto';
import {Code,ConnectError} from '@connectrpc/connect';
export type StoredItem={id:string;title:string;completed:boolean};
export interface InventoryRepository {
  create(title:string):Promise<StoredItem>;
  get(id:string):Promise<StoredItem|undefined>;
  list(cursor:number,pageSize:number):Promise<{items:StoredItem[];nextCursor:number}>;
}
export function memoryRepository():InventoryRepository {
  const items=new Map<string,StoredItem>();
  return {
    async create(rawTitle) {
      const title=rawTitle.trim();
      if(!title||[...title].length>200) throw new ConnectError('Title must contain 1 to 200 characters',Code.InvalidArgument);
      if(items.size>=1000) throw new ConnectError('Fixture item limit reached',Code.ResourceExhausted);
      const item={id:randomUUID(),title,completed:false};items.set(item.id,item);return {...item};
    },
    async get(id) {const item=items.get(id);return item?{...item}:undefined;},
    async list(cursor,pageSize) {
      if(!Number.isInteger(cursor)||cursor<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>100) throw new ConnectError('Invalid pagination',Code.InvalidArgument);
      const values=[...items.values()];return {items:values.slice(cursor,cursor+pageSize).map(x=>({...x})),nextCursor:cursor+pageSize<values.length?cursor+pageSize:0};
    },
  };
}
