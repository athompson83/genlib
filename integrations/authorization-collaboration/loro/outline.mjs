// SPDX-License-Identifier: Apache-2.0
// Optional movable-tree structure for user-editable outline data.
export function addOutlineNode(doc,title,parent) {
  if(typeof title!=='string'||!title.trim()||title.length>200) throw new TypeError('Invalid title');
  const tree=doc.getTree('outline');
  const node=tree.createNode(parent);
  node.data.set('title',title.trim()); doc.commit(); return node.id;
}
export function moveOutlineNode(doc,node,newParent) {
  doc.getTree('outline').move(node,newParent); doc.commit();
}
