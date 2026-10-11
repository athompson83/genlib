// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { LoroDoc, LoroMap } from 'loro-crdt';
import { createInventoryDocument, addItem, completeItem, inventory, importValidatedUpdate } from '../loro/inventory.mjs';
import { addOutlineNode, moveOutlineNode } from '../loro/outline.mjs';
test('offline replicas converge and duplicate delivery is idempotent',()=>{
  const alice=createInventoryDocument('1'); addItem(alice,{id:'shared',title:'Start'});
  const bob=new LoroDoc(); bob.import(alice.export({mode:'snapshot'})); bob.setPeerId('2');
  addItem(alice,{id:'alice',title:'By Alice'}); completeItem(alice,'shared',true);
  addItem(bob,{id:'bob',title:'By Bob'});
  const a=alice.export({mode:'update'}), b=bob.export({mode:'update'});
  importValidatedUpdate(alice,b); importValidatedUpdate(bob,a);
  const state=inventory(alice); assert.deepEqual(inventory(bob),state);
  assert.deepEqual(state.map(x=>x.id),['alice','bob','shared']); assert.equal(state[2].completed,true);
  importValidatedUpdate(alice,b); assert.deepEqual(inventory(alice),state);
});
test('invalid remote state is staged and rejected without corrupting the live doc',()=>{
  const doc=createInventoryDocument('3');addItem(doc,{id:'valid',title:'Keep'});
  const attacker=new LoroDoc();attacker.import(doc.export({mode:'snapshot'}));attacker.setPeerId('4');
  const invalid=attacker.getMap('items').setContainer('invalid',new LoroMap());invalid.set('title','');invalid.set('completed',false);attacker.commit();
  const before=inventory(doc);assert.throws(()=>importValidatedUpdate(doc,attacker.export({mode:'update'})));
  assert.deepEqual(inventory(doc),before);assert.throws(()=>addItem(doc,{id:'valid',title:'Duplicate'}));
});
test('movable outline reparenting is replicated',()=>{
  const doc=createInventoryDocument('5');const parent=addOutlineNode(doc,'Folder');const child=addOutlineNode(doc,'Child');
  moveOutlineNode(doc,child,parent);
  const other=new LoroDoc();other.import(doc.export({mode:'snapshot'}));
  assert.deepEqual(other.getTree('outline').toJSON(),doc.getTree('outline').toJSON());
  assert.equal(doc.getTree('outline').toJSON()[0].children[0].parent,parent);
});
