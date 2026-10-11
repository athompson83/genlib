// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from 'react';
import { Tree, type NodeRendererProps } from 'react-arborist';
import { insertNode, moveNodes, removeNodes, renameNode, validateTree, type FileNode } from './tree-model.js';

function FileRow({ node, style, dragHandle }: NodeRendererProps<FileNode>) {
  return <div ref={dragHandle} style={style} className={`genlib-tree-row${node.isSelected ? ' is-selected' : ''}`}>
    {node.isInternal && <button type="button" tabIndex={-1} aria-label={node.isOpen ? 'Collapse folder' : 'Expand folder'} onClick={event => { event.stopPropagation(); node.toggle(); }}>{node.isOpen ? '−' : '+'}</button>}
    {node.isEditing ? <input autoFocus defaultValue={node.data.name} aria-label="File name" onFocus={event => event.currentTarget.select()}
      onBlur={() => node.reset()} onKeyDown={event => { if (event.key === 'Escape') node.reset(); if (event.key === 'Enter') node.submit(event.currentTarget.value); }} /> : <span>{node.data.name}</span>}
  </div>;
}
export function FileTree({ nodes, onChange, onActivate, onCreate, onError, height = 480, width = 360 }: {
  nodes: FileNode[]; onChange: (nodes: FileNode[]) => Promise<void>; onActivate: (node: FileNode) => void;
  onCreate?: (type: 'file' | 'folder') => Promise<FileNode>; onError: (error: Error) => void; height?: number; width?: number;
}) {
  validateTree(nodes);
  const [busy, setBusy] = useState(false), [search, setSearch] = useState('');
  const pending = useRef(false);
  const commit = async (update: () => FileNode[]) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true);
    try { await onChange(update()); return true; }
    catch (error) { onError(error instanceof Error ? error : new Error('Tree update failed.')); return false; }
    finally { pending.current = false; setBusy(false); }
  };
  return <section aria-label="Files" aria-busy={busy}><label>Find files <input value={search} onChange={event => setSearch(event.target.value)} /></label>
    <Tree data={nodes} childrenAccessor={node => node.kind === 'folder' ? (node.children ?? []) : null}
      height={height} width={width} rowHeight={34} searchTerm={search} searchMatch={(node, term) => node.data.name.toLowerCase().includes(term.toLowerCase())}
      disableDrag={busy} disableDrop={busy} disableEdit={busy}
      onActivate={node => onActivate(node.data)}
      onMove={async args => { await commit(() => moveNodes(nodes, args.dragIds, args.parentId, args.index)); }}
      onRename={async args => { await commit(() => renameNode(nodes, args.id, args.name)); }}
      onDelete={async args => { await commit(() => removeNodes(nodes, args.ids)); }}
      onCreate={onCreate ? async args => { const created = await onCreate(args.type === 'internal' ? 'folder' : 'file'); return await commit(() => insertNode(nodes, created, args.parentId, args.index)) ? created : null; } : undefined}>
      {FileRow}
    </Tree>
  </section>;
}
