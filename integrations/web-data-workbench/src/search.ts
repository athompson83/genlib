// SPDX-License-Identifier: Apache-2.0
import MiniSearch from 'minisearch';
import { validateRows, type DataRow } from './model.js';

export function createLocalSearch(rows: DataRow[], fields: string[]) {
  validateRows(rows);
  if (!fields.length || fields.some(field => ['__proto__', 'constructor', 'prototype'].includes(field))) throw new Error('Select searchable fields.');
  const index = new MiniSearch<DataRow>({ fields, idField: 'id', storeFields: ['id'], extractField: (row, field) => {
    const value = row[field]; return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  } });
  const documents = new Map(rows.map(row => [row.id, row]));
  index.addAll(rows);
  return {
    search(query: string, limit = 50): DataRow[] {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid result limit.');
      if (!query.trim()) return [...documents.values()].slice(0, limit);
      return index.search(query.slice(0, 500), { prefix: true, fuzzy: 0.2 }).slice(0, limit).map(result => documents.get(String(result.id))!);
    },
    upsert(row: DataRow) { validateRows([row]); if (documents.has(row.id)) index.replace(row); else index.add(row); documents.set(row.id, row); },
    remove(id: string) { if (documents.has(id)) { index.discard(id); documents.delete(id); } },
  };
}
