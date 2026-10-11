// SPDX-License-Identifier: Apache-2.0
export interface DataRow { id: string; version: string; [field: string]: unknown }
export interface DataColumn {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean';
  editable?: boolean;
  width?: number;
  validate?: (value: unknown, row: DataRow) => string | undefined;
}
export interface RowEdit { id: string; expectedVersion: string; changes: Record<string, unknown> }
export interface DataQuery { page: number; pageSize: number; search: string; sort: { field: string; descending: boolean }[] }
export interface DataSource {
  list(query: DataQuery, signal: AbortSignal): Promise<{ rows: DataRow[]; total: number }>;
  /** Atomically validate authorization, versions and all edits on the server. */
  commit(edits: RowEdit[], signal?: AbortSignal): Promise<DataRow[]>;
}

export function validateRows(rows: readonly DataRow[]): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || typeof row.id !== 'string' || !row.version || typeof row.version !== 'string' || ids.has(row.id)) throw new Error('Rows require unique IDs and versions.');
    ids.add(row.id);
  }
}

export function validateColumns(columns: readonly DataColumn[]): void {
  const seen = new Set<string>();
  for (const column of columns) {
    if (!column.key || ['__proto__', 'prototype', 'constructor', 'id', 'version'].includes(column.key) || seen.has(column.key)) throw new Error('Invalid or duplicate column key.');
    seen.add(column.key);
  }
}

export function parseCellInput(value: unknown, column: DataColumn): string | number | boolean {
  if (column.kind === 'text' && typeof value === 'string') return value;
  if (column.kind === 'number' && ((typeof value === 'string' && value.trim() !== '') || typeof value === 'number')) {
    const number = Number(value); if (Number.isFinite(number)) return number;
  }
  if (column.kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 'false') return value === 'true';
  }
  throw new Error(`${column.label} requires a ${column.kind} value.`);
}

/** Preflight an entire batch before changing any rows. It does not replace server validation. */
export function applyEdits(rows: readonly DataRow[], columns: readonly DataColumn[], edits: readonly RowEdit[]): DataRow[] {
  validateRows(rows); validateColumns(columns);
  const working = new Map(rows.map(row => [row.id, structuredClone(row)]));
  const fields = new Map(columns.map(column => [column.key, column]));
  const changed = new Set<string>();
  for (const edit of edits) {
    const row = working.get(edit.id);
    if (!row || row.version !== edit.expectedVersion) throw new Error('Row missing or revision conflict.');
    for (const [key, input] of Object.entries(edit.changes)) {
      const column = fields.get(key), cell = `${edit.id}\0${key}`;
      if (!column?.editable || changed.has(cell)) throw new Error('Column is not editable or cell appears twice in the batch.');
      const value = parseCellInput(input, column), error = column.validate?.(value, row);
      if (error) throw new Error(error);
      changed.add(cell); row[key] = value;
    }
  }
  return rows.map(row => working.get(row.id)!);
}

export function normalizeQuery(query: Partial<DataQuery>, columns: readonly DataColumn[]): DataQuery {
  const page = query.page ?? 0, pageSize = query.pageSize ?? 25;
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('Invalid pagination.');
  const allowed = new Set(columns.map(column => column.key));
  const sort = query.sort ?? [];
  if (sort.length > 5 || sort.some(item => !allowed.has(item.field) || typeof item.descending !== 'boolean')) throw new Error('Invalid sort columns.');
  return { page, pageSize, search: (query.search ?? '').slice(0, 500), sort };
}

export function displayValue(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
