// SPDX-License-Identifier: Apache-2.0
import { TabulatorFull, type CellComponent, type ColumnDefinition, type Options } from 'tabulator-tables';
import { applyEdits, validateColumns, validateRows, type DataColumn, type DataRow, type RowEdit } from './model.js';

export function mountTabulator(element: HTMLElement, options: {
  rows: DataRow[]; columns: DataColumn[]; onCommit: (edits: RowEdit[]) => Promise<DataRow[]>; onError: (error: Error) => void;
  tableOptions?: Pick<Options, 'height' | 'layout' | 'paginationSize' | 'placeholder'>;
}) {
  validateRows(options.rows); validateColumns(options.columns);
  const columns: ColumnDefinition[] = options.columns.map(column => ({
    title: column.label, field: column.key, width: column.width, formatter: 'plaintext',
    editor: column.editable ? (column.kind === 'number' ? 'number' : column.kind === 'boolean' ? 'tickCross' : 'input') : undefined,
  }));
  const table = new TabulatorFull(element, { height: 400, layout: 'fitColumns', pagination: true, paginationSize: 25,
    ...options.tableOptions, index: 'id', data: structuredClone(options.rows), columns });
  const edited = async (cell: CellComponent) => {
    const row = cell.getRow().getData() as DataRow, field = cell.getField();
    const edit: RowEdit = { id: row.id, expectedVersion: row.version, changes: { [field]: cell.getValue() } };
    try {
      applyEdits([{ ...row, [field]: cell.getOldValue() }], options.columns, [edit]);
      const saved = await options.onCommit([edit]); validateRows(saved); await table.updateData(saved);
    } catch (error) { cell.restoreOldValue(); options.onError(error instanceof Error ? error : new Error('Unable to save cell.')); }
  };
  table.on('cellEdited', edited);
  return {
    table,
    async replaceRows(rows: DataRow[]) { validateRows(rows); await table.replaceData(structuredClone(rows)); },
    destroy() { table.off('cellEdited', edited); table.destroy(); },
  };
}
