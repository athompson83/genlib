// SPDX-License-Identifier: Apache-2.0
import { useCallback, useMemo } from 'react';
import DataEditor, { GridCellKind, type GridCell, type Item } from '@glideapps/glide-data-grid';
import { applyEdits, displayValue, validateColumns, validateRows, type DataColumn, type DataRow, type RowEdit } from './model.js';
import { PlainDataTable } from './TanStackTable.js';

export function GlideGrid({ rows, columns, caption, onCommit, onError, height = 420 }: {
  rows: DataRow[]; columns: DataColumn[]; caption: string; onCommit: (edits: RowEdit[]) => Promise<unknown>;
  onError: (error: Error) => void; height?: number;
}) {
  validateRows(rows); validateColumns(columns);
  const gridColumns = useMemo(() => columns.map(column => ({ id: column.key, title: column.label, width: column.width ?? 160 })), [columns]);
  const getCellContent = useCallback(([columnIndex, rowIndex]: Item): GridCell => {
    const column = columns[columnIndex], row = rows[rowIndex];
    if (!column || !row) return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false, readonly: true };
    const data = displayValue(row[column.key]);
    return { kind: GridCellKind.Text, data, displayData: data, allowOverlay: !!column.editable, readonly: !column.editable };
  }, [columns, rows]);
  return <section aria-label={caption} className="genlib-grid"><DataEditor columns={gridColumns} rows={rows.length} getCellContent={getCellContent}
    height={height} width="100%" getCellsForSelection onCellEdited={async ([columnIndex, rowIndex], cell) => {
      const column = columns[columnIndex], row = rows[rowIndex]; if (!column || !row || cell.kind !== GridCellKind.Text) return;
      const edit = { id: row.id, expectedVersion: row.version, changes: { [column.key]: cell.data } };
      try { applyEdits(rows, columns, [edit]); await onCommit([edit]); }
      catch (error) { onError(error instanceof Error ? error : new Error('Unable to save cell.')); }
    }} />
    <details><summary>Read this page as a table</summary><PlainDataTable rows={rows.slice(0, 100)} columns={columns} caption={caption} />
      {rows.length > 100 && <p>Table view shows the first 100 rows. Use source pagination to access subsequent rows.</p>}</details>
  </section>;
}
