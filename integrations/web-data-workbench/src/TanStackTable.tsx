// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react';
import { useTable, tableFeatures, rowSortingFeature, rowPaginationFeature, columnVisibilityFeature,
  createSortedRowModel, createPaginatedRowModel, sortFns, type ColumnDef } from '@tanstack/react-table';
import { displayValue, validateColumns, validateRows, type DataColumn, type DataRow } from './model.js';

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature, columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(), paginatedRowModel: createPaginatedRowModel(), sortFns });

export function TanStackTable({ rows, columns, caption, pageSize = 25 }: {
  rows: DataRow[]; columns: DataColumn[]; caption: string; pageSize?: number;
}) {
  validateRows(rows); validateColumns(columns);
  const definitions = useMemo<ColumnDef<typeof features, DataRow>[]>(() => columns.map(column => ({
    id: column.key, accessorFn: row => row[column.key], header: column.label,
  })), [columns]);
  const table = useTable({ features, data: rows, columns: definitions, getRowId: row => row.id,
    initialState: { pagination: { pageIndex: 0, pageSize } } });
  return <section className="genlib-data-table"><table><caption>{caption}</caption>
    <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => {
      const sorted = header.column.getIsSorted();
      return <th key={header.id} scope="col" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}>
        <button type="button" onClick={header.column.getToggleSortingHandler()}>{String(header.column.columnDef.header)}{sorted ? ` (${sorted})` : ''}</button>
      </th>;
    })}</tr>)}</thead>
    <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td key={cell.id}>{displayValue(cell.getValue())}</td>)}</tr>)}</tbody>
  </table>
    {!rows.length && <p role="status">No results.</p>}
    <nav aria-label={`${caption} pages`}><button type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
      <span> Page {table.state.pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())} </span>
      <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button></nav>
  </section>;
}

export function PlainDataTable({ rows, columns, caption }: { rows: readonly DataRow[]; columns: readonly DataColumn[]; caption: string }) {
  return <table className="genlib-data-table"><caption>{caption}</caption><thead><tr>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>{columns.map(column => <td key={column.key}>{displayValue(row[column.key])}</td>)}</tr>)}</tbody></table>;
}
