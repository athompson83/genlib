"use client";

// Genlib original source, Apache-2.0.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

export type DataTableValue = string | number | boolean | null | undefined;
export interface DataTableColumn<T> {
  id: string;
  header: string;
  value: (row: T) => DataTableValue;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  searchable?: boolean;
  compare?: (left: T, right: T) => number;
  align?: "start" | "end";
}
export interface DataTableSort { columnId: string; direction: "asc" | "desc" }
export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  rowId: (row: T) => string;
  caption: string;
  pageSize?: number;
  initialSort?: DataTableSort;
  searchable?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  noResultsMessage?: ReactNode;
  className?: string;
}

function compareValues(left: DataTableValue, right: DataTableValue): number {
  if (typeof left === "number" && typeof right === "number" && Number.isFinite(left) && Number.isFinite(right)) {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

/** Search only caller-supplied data; preserve the input array and stable ordering for ties. */
export function selectTableRows<T>(
  rows: readonly T[],
  columns: readonly DataTableColumn<T>[],
  query: string,
  sort?: DataTableSort,
): T[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => columns.some((column) =>
      column.searchable !== false && String(column.value(row) ?? "").toLowerCase().includes(needle)))
    : [...rows];
  const column = columns.find((candidate) => candidate.id === sort?.columnId && candidate.sortable);
  if (!column || !sort) return filtered;
  const direction = sort.direction === "asc" ? 1 : -1;
  return filtered.sort((left, right) => {
    if (column.compare) return direction * column.compare(left, right);
    const leftValue = column.value(left);
    const rightValue = column.value(right);
    // Missing values stay last in either direction.
    if (leftValue == null) return rightValue == null ? 0 : 1;
    if (rightValue == null) return -1;
    return direction * compareValues(leftValue, rightValue);
  });
}

/** Client-side table for small, already-authorized datasets. */
export function DataTable<T>({
  rows,
  columns,
  rowId,
  caption,
  pageSize = 10,
  initialSort,
  searchable = true,
  searchLabel = "Search records",
  searchPlaceholder = "Search…",
  emptyMessage = "No records yet.",
  noResultsMessage = "No matching records.",
  className = "",
}: DataTableProps<T>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DataTableSort | undefined>(initialSort);
  const [page, setPage] = useState(0);
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 10;
  const filtered = useMemo(
    () => selectTableRows(rows, columns, searchable ? query : "", sort),
    [rows, columns, query, searchable, sort],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * size;
  const pageRows = filtered.slice(start, start + size);
  useEffect(() => setPage((previous) => Math.min(previous, pageCount - 1)), [pageCount]);

  if (columns.length === 0) throw new Error("DataTable requires at least one column.");

  function toggleSort(column: DataTableColumn<T>) {
    setSort((previous) => ({
      columnId: column.id,
      direction: previous?.columnId === column.id && previous.direction === "asc" ? "desc" : "asc",
    }));
    setPage(0);
  }

  return (
    <section className={`gl-table ${className}`.trim()} aria-label={caption}>
      {searchable && (
        <div className="gl-table__search">
          <label htmlFor={`${id}-search`}>{searchLabel}</label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            aria-controls={`${id}-table`}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
          />
        </div>
      )}
      <div className="gl-table__scroll" role="region" aria-label={`${caption} table`} tabIndex={0}>
        <table id={`${id}-table`}>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  data-align={column.align ?? "start"}
                  aria-sort={column.sortable && sort?.columnId === column.id ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      aria-label={`Sort ${column.header} ${sort?.columnId === column.id && sort.direction === "asc" ? "descending" : "ascending"}`}
                    >
                      {column.header}
                      <span aria-hidden="true">{sort?.columnId === column.id ? (sort.direction === "asc" ? " ↑" : " ↓") : " ↕"}</span>
                    </button>
                  ) : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={columns.length} className="gl-table__empty">{rows.length === 0 ? emptyMessage : noResultsMessage}</td></tr>
            ) : pageRows.map((row) => (
              <tr key={rowId(row)}>
                {columns.map((column) => (
                  <td key={column.id} data-align={column.align ?? "start"}>
                    {column.render ? column.render(row) : String(column.value(row) ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gl-table__footer">
        <p className="gl-table__status" role="status" aria-live="polite">
          {filtered.length === 0 ? "0 records" : `Showing ${start + 1}–${Math.min(start + size, filtered.length)} of ${filtered.length} records`}
        </p>
        <nav className="gl-table__pagination" aria-label={`${caption} pagination`}>
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>Page {currentPage + 1} of {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>
      </div>
    </section>
  );
}
