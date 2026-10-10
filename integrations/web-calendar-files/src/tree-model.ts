// SPDX-License-Identifier: Apache-2.0
import { adjustMoveIndex } from 'react-arborist';
export interface FileNode { id: string; name: string; kind: 'file' | 'folder'; children?: FileNode[] }
interface Location { node: FileNode; siblings: FileNode[]; parentId: string | null; ancestors: string[] }

export function safeNodeName(name: string): string {
  const normalized = name.normalize('NFC').trim();
  if (!normalized || normalized === '.' || normalized === '..' || normalized.length > 200 || /[/\\\u0000-\u001f]/u.test(normalized)) throw new Error('Invalid file name.');
  return normalized;
}

function indexTree(nodes: FileNode[]): Map<string, Location> {
  const result = new Map<string, Location>();
  const visit = (siblings: FileNode[], parentId: string | null, ancestors: string[]) => {
    if (ancestors.length > 100) throw new Error('Tree is too deep.');
    const names = new Set<string>();
    for (const node of siblings) {
      const name = safeNodeName(node.name).toLowerCase();
      if (!node.id || result.has(node.id) || names.has(name) || result.size >= 10_000 ||
          (node.kind !== 'file' && node.kind !== 'folder') || (node.kind === 'file' && node.children !== undefined)) throw new Error('Invalid tree identity, sibling name or node kind.');
      names.add(name); result.set(node.id, { node, siblings, parentId, ancestors });
      if (node.children) visit(node.children, node.id, [...ancestors, node.id]);
    }
  };
  visit(nodes, null, []); return result;
}

export function validateTree(nodes: FileNode[]): void { indexTree(nodes); }
export function renameNode(nodes: FileNode[], id: string, name: string): FileNode[] {
  const copy = structuredClone(nodes), index = indexTree(copy), found = index.get(id);
  if (!found) throw new Error('Node not found.'); found.node.name = safeNodeName(name); indexTree(copy); return copy;
}
export function removeNodes(nodes: FileNode[], ids: string[]): FileNode[] {
  const index = indexTree(nodes); if (ids.some(id => !index.has(id))) throw new Error('Node not found.');
  const remove = new Set(ids);
  const prune = (items: FileNode[]): FileNode[] => items.filter(item => !remove.has(item.id)).map(item => ({ ...item, ...(item.children ? { children: prune(item.children) } : {}) }));
  return prune(structuredClone(nodes));
}
export function insertNode(nodes: FileNode[], node: FileNode, parentId: string | null, position: number): FileNode[] {
  const copy = structuredClone(nodes), index = indexTree(copy);
  const parent = parentId === null ? null : index.get(parentId)?.node;
  if (parentId !== null && parent?.kind !== 'folder') throw new Error('Destination must be a folder.');
  const target = parent ? (parent.children ??= []) : copy;
  if (!Number.isInteger(position) || position < 0 || position > target.length) throw new Error('Invalid insertion index.');
  target.splice(position, 0, structuredClone(node)); indexTree(copy); return copy;
}
/** onMove index is pre-removal. Correct it before splicing, including multi-row moves. */
export function moveNodes(nodes: FileNode[], ids: string[], parentId: string | null, position: number): FileNode[] {
  const copy = structuredClone(nodes), index = indexTree(copy), selected = new Set(ids);
  if (!ids.length || selected.size !== ids.length) throw new Error('Select distinct nodes.');
  const moving = ids.map(id => { const found = index.get(id); if (!found) throw new Error('Node not found.'); return found; });
  const parent = parentId === null ? null : index.get(parentId);
  if (parentId !== null && parent?.node.kind !== 'folder') throw new Error('Destination must be a folder.');
  if (moving.some(item => item.ancestors.some(id => selected.has(id))) ||
      (parent && (selected.has(parent.node.id) || parent.ancestors.some(id => selected.has(id))))) throw new Error('Cannot move an ancestor into its subtree or select nested ancestors together.');
  const target = parent ? (parent.node.children ??= []) : copy;
  if (!Number.isInteger(position) || position < 0 || position > target.length) throw new Error('Invalid move index.');
  const adjusted = adjustMoveIndex({ index: position, dragIds: ids, siblingIds: target.map(node => node.id) });
  for (const item of moving) item.siblings.splice(item.siblings.indexOf(item.node), 1);
  target.splice(adjusted, 0, ...moving.map(item => item.node)); indexTree(copy); return copy;
}
