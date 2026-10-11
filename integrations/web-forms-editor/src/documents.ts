// SPDX-License-Identifier: Apache-2.0
export interface DocumentEnvelope<T> { id: string; schemaVersion: number; revision: string; data: T }
export interface DocumentStore<T> {
  load(id: string, signal?: AbortSignal): Promise<DocumentEnvelope<T>>;
  /** The backend must atomically compare expectedRevision; return 409/412 on a conflict. */
  save(document: DocumentEnvelope<T>, expectedRevision: string, signal?: AbortSignal): Promise<DocumentEnvelope<T>>;
}
export class RevisionConflict extends Error { override name = 'RevisionConflict' }

export function createHttpDocumentStore<T>(options: {
  /** Same-origin root-relative endpoint, such as /api/pages; never a remote URL. */
  baseUrl: string;
  parse: (value: unknown) => DocumentEnvelope<T>;
  getHeaders?: () => Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}): DocumentStore<T> {
  const base = options.baseUrl.replace(/\/$/u, ''), timeout = options.timeoutMs ?? 15_000, maxBytes = options.maxResponseBytes ?? 2_097_152;
  if (!options.baseUrl.startsWith('/') || options.baseUrl.startsWith('//') || /[?#\\\u0000-\u0020]/u.test(base) ||
      base.split('/').some(part => part === '.' || part === '..') || /%(?:2e|2f|5c|00)/iu.test(base)) throw new Error('Use a same-origin root-relative document endpoint.');
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120_000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10_485_760) throw new Error('Invalid document transport limits.');
  const send = async (id: string, init: RequestInit): Promise<DocumentEnvelope<T>> => {
    if (!id || id.length > 200 || id === '.' || id === '..' || /[\u0000-\u001f]/u.test(id)) throw new Error('Invalid document identifier.');
    const response = await (options.fetch ?? fetch)(`${base}/${encodeURIComponent(id)}`, {
      ...init, redirect: 'error', credentials: 'same-origin',
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      headers: { Accept: 'application/json', ...await options.getHeaders?.(), ...init.headers },
    });
    if (response.status === 409 || response.status === 412) { await response.body?.cancel(); throw new RevisionConflict('The document changed on the server. Reload and reconcile edits.'); }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Document request failed (${response.status}).`); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('Missing document response body.');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
        if (size > maxBytes) throw new Error('Document response byte limit exceeded.'); chunks.push(chunk.value); }
    } catch (error) { await reader.cancel(error); throw error; } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = options.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (parsed.id !== id || !parsed.revision) throw new Error('Unexpected document identity or revision.');
    return parsed;
  };
  return {
    load: (id, signal) => send(id, { method: 'GET', signal }),
    save: (document, revision, signal) => send(document.id, {
      method: 'PUT', signal, headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify(document),
    }),
  };
}

/** A save snapshots data. Edits made while it is in flight stay dirty and are never overwritten. */
export class DraftSession<T> {
  private generation = 0;
  private listeners = new Set<() => void>();
  private pending?: Promise<DocumentEnvelope<T>>;
  private state: { document: DocumentEnvelope<T>; dirty: boolean; saving: boolean; error?: Error };
  private readonly store: DocumentStore<T>;
  constructor(initial: DocumentEnvelope<T>, store: DocumentStore<T>) {
      this.store = store;
    this.state = { document: structuredClone(initial), dirty: false, saving: false };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { for (const listener of this.listeners) listener(); }
  edit(data: T) {
    this.generation++;
    this.state = { ...this.state, document: { ...this.state.document, data: structuredClone(data) }, dirty: true, error: undefined };
    this.notify();
  }
  save(signal?: AbortSignal): Promise<DocumentEnvelope<T>> {
    if (this.pending) return this.pending;
    const generation = this.generation, snapshot = structuredClone(this.state.document);
    this.state = { ...this.state, saving: true, error: undefined }; this.notify();
    this.pending = (async () => {
      try {
        const saved = await Promise.resolve().then(() => this.store.save(snapshot, snapshot.revision, signal));
        if (saved.id !== snapshot.id || !saved.revision) throw new Error('Invalid saved document.');
        this.state = { document: generation === this.generation ? saved : { ...this.state.document, revision: saved.revision }, dirty: generation !== this.generation, saving: false };
        return saved;
      } catch (error) {
        this.state = { ...this.state, saving: false, error: error instanceof Error ? error : new Error('Save failed.') };
        throw error;
      } finally { this.pending = undefined; this.notify(); }
    })();
    return this.pending;
  }
}

export function migrateDocument<T>(document: DocumentEnvelope<unknown>, targetVersion: number,
  migrations: Record<number, (data: unknown) => unknown>, parse: (data: unknown) => T): DocumentEnvelope<T> {
  if (!Number.isSafeInteger(document.schemaVersion) || document.schemaVersion < 1 || document.schemaVersion > targetVersion) throw new Error('Unsupported document schema version.');
  let data = structuredClone(document.data);
  for (let version = document.schemaVersion; version < targetVersion; version++) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`Missing document migration from version ${version}.`);
    data = migrate(data);
  }
  return { ...document, schemaVersion: targetVersion, data: parse(data) };
}
