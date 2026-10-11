// SPDX-License-Identifier: Apache-2.0
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js';

export interface ArchiveFile { path: string; data: Blob; modified?: Date }
export interface ArchiveOptions {
  maxFiles?: number;
  maxInputBytes?: number;
  signal?: AbortSignal;
  onProgress?: (path: string, written: number, total: number) => void;
}

export function safeArchivePath(path: string): string {
  const normalized = path.normalize('NFC');
  if (!normalized || normalized.length > 1_024 || normalized.startsWith('/') || /[\\:<>"|?*\u0000-\u001f\u007f]/u.test(normalized) ||
      normalized.split('/').some(part => !part || part.length > 255 || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error('Archive paths must be portable, relative paths without traversal.');
  }
  return normalized;
}

function preflight(files: readonly ArchiveFile[], options: ArchiveOptions): ArchiveFile[] {
  const maxFiles = options.maxFiles ?? 1_000, maxBytes = options.maxInputBytes ?? 256 * 1024 * 1024;
  if (!Number.isSafeInteger(maxFiles) || maxFiles <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid archive limits.');
  if (files.length > maxFiles) throw new Error('Archive file count limit exceeded.');
  const seen = new Set<string>();
  let total = 0;
  const checked = files.map(file => {
    const path = safeArchivePath(file.path), key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate archive path: ${path}`);
    seen.add(key);
    total += file.data.size;
    if (!Number.isSafeInteger(total) || total > maxBytes) throw new Error('Archive byte limit exceeded.');
    if (file.modified && !Number.isFinite(file.modified.getTime())) throw new Error('Invalid archive modification date.');
    return { ...file, path };
  });
  for (const key of seen) {
    const parts = key.split('/');
    for (let index = 1; index < parts.length; index++) if (seen.has(parts.slice(0, index).join('/'))) throw new Error('Archive file/directory path collision.');
  }
  return checked;
}

async function writeEntries<T>(writer: ZipWriter<T>, files: ArchiveFile[], options: ArchiveOptions): Promise<T> {
  for (const file of files) {
    options.signal?.throwIfAborted();
    await writer.add(file.path, new BlobReader(file.data), {
      signal: options.signal,
      lastModDate: file.modified ?? new Date('2000-01-01T00:00:00Z'),
      onprogress: (written, total) => options.onProgress?.(file.path, written, total),
    });
  }
  return writer.close();
}

/** Bounded in-memory export for small archives. No extraction or filesystem writes. */
export async function createZip(files: readonly ArchiveFile[], options: ArchiveOptions = {}): Promise<Blob> {
  const checked = preflight(files, options);
  return writeEntries(new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false }), checked, options);
}

/** Streams large output to a caller-owned destination; input quotas still apply. */
export async function streamZip(files: readonly ArchiveFile[], destination: WritableStream<Uint8Array>, options: ArchiveOptions = {}): Promise<void> {
  const checked = preflight(files, options);
  try { await writeEntries(new ZipWriter(destination, { useWebWorkers: false }), checked, options); }
  catch (error) { if (!destination.locked) await destination.abort(error); throw error; }
}
