// SPDX-License-Identifier: Apache-2.0
import { LoroDoc, LoroMap } from 'loro-crdt';
const validId = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
function title(value) { if(typeof value!=='string'||!value.trim()||[...value.trim()].length>200) throw new TypeError('Invalid title'); return value.trim(); }
export function createInventoryDocument(peerId) {
  const doc = new LoroDoc(); if(peerId!==undefined) doc.setPeerId(String(peerId));
  doc.getMap('meta').set('schema',1); doc.commit(); return doc;
}
export function addItem(doc,{id,title:rawTitle}) {
  if(!validId(id)) throw new TypeError('Invalid item ID');
  const items=doc.getMap('items'); if(items.get(id)!==undefined) throw new Error('Duplicate item');
  const text=title(rawTitle);
  if(Object.keys(items.toJSON()).length>=1000) throw new Error('Item limit reached');
  const item=items.setContainer(id,new LoroMap());
  item.set('title',text); item.set('completed',false); doc.commit();
}
export function completeItem(doc,id,completed) {
  if(!validId(id)||typeof completed!=='boolean') throw new TypeError('Invalid item update');
  const item=doc.getMap('items').get(id); if(!(item instanceof LoroMap)) throw new Error('Unknown item');
  item.set('completed',completed); doc.commit();
}
export function inventory(doc) {
  const json=doc.toJSON();
  if(json.meta?.schema!==1) throw new Error('Unsupported document schema');
  const rows=Object.entries(json.items??{});
  if(rows.length>1000) throw new Error('Item limit reached');
  return rows.map(([id,item])=>{
    if(!validId(id)||!item||typeof item.completed!=='boolean'||title(item.title)!==item.title) throw new Error('Invalid document shape');
    return {id,title:item.title,completed:item.completed};
  }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
/** The server must authorize the document and sender before passing update bytes here. */
export function importValidatedUpdate(doc,bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length>8*1024*1024) throw new TypeError('Bounded binary update required');
  const staged=new LoroDoc(); staged.import(doc.export({mode:'snapshot'})); staged.import(bytes);
  inventory(staged); // Invalid merged state is rejected without changing the live document.
  doc.import(bytes);
}
