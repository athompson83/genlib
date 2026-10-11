// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { validateRows, type DataQuery, type DataRow, type DataSource } from './model.js';

/** Memoize source/query in the host. New requests abort and supersede older results. */
export function useDataSource(source: DataSource, query: DataQuery) {
  const request = useRef(0);
  const [state, setState] = useState<{ rows: DataRow[]; total: number; loading: boolean; error?: Error }>({ rows: [], total: 0, loading: false });
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const id = ++request.current, controller = new AbortController();
    setState(current => ({ ...current, loading: true, error: undefined }));
    source.list(query, controller.signal).then(result => {
      validateRows(result.rows); if (!Number.isSafeInteger(result.total) || result.total < result.rows.length) throw new Error('Invalid data page.');
      if (id === request.current && !controller.signal.aborted) setState({ ...result, loading: false });
    }).catch(error => { if (id === request.current && !controller.signal.aborted) setState(current => ({ ...current, loading: false, error: error instanceof Error ? error : new Error('Unable to load data.') })); });
    return () => controller.abort();
  }, [source, query, revision]);
  return { ...state, refresh: () => refresh(value => value + 1) };
}
