// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invoiceView, type InvoiceDocument } from './invoice.js';

export async function compileTypstInvoice(invoice: InvoiceDocument, options: {
  executable?: string; templatePath?: string | URL; timeoutMs?: number; maxOutputBytes?: number; signal?: AbortSignal;
} = {}): Promise<Uint8Array> {
  const view = invoiceView(invoice), timeout = options.timeoutMs ?? 15_000, maxOutput = options.maxOutputBytes ?? 20_000_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || !Number.isSafeInteger(maxOutput) || maxOutput < 1) throw new Error('Invalid Typst limits.');
  options.signal?.throwIfAborted();
  const template = await readFile(options.templatePath ?? new URL('../src/invoice.typ', import.meta.url));
  if (template.byteLength > 1_048_576) throw new Error('Typst template exceeds 1 MiB.');
  const directory = await mkdtemp(join(tmpdir(), 'genlib-typst-'));
  try {
    await writeFile(join(directory, 'invoice.json'), JSON.stringify(view), { mode: 0o600 });
    await writeFile(join(directory, 'invoice.typ'), template, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.executable ?? 'typst', ['compile', '--root', directory, '--input', 'invoice=invoice.json', 'invoice.typ', 'invoice.pdf'], { cwd: directory, stdio: ['ignore', 'ignore', 'pipe'], shell: false });
      let aborted = false, outputBytes = 0;
      const abort = () => { aborted = true; child.kill('SIGKILL'); };
      const timer = setTimeout(abort, timeout);
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stderr.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > 65_536) abort(); });
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      child.once('error', error => { cleanup(); reject(error); });
      child.once('close', code => { cleanup(); if (aborted) reject(new Error('Typst conversion was cancelled or exceeded its limits.')); else if (code !== 0) reject(new Error(`Typst exited with status ${code}.`)); else resolve(); });
      if (options.signal?.aborted) abort();
    });
    const outputPath = join(directory, 'invoice.pdf'), stat = await lstat(outputPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxOutput) throw new Error('Invalid or oversized Typst output.');
    const bytes = await readFile(outputPath);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Typst did not produce a PDF.');
    return bytes;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
