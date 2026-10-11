// SPDX-License-Identifier: Apache-2.0
export interface ConversionFile { name: string; data: Blob }
export function createGotenbergConverter(options: {
  /** Trusted static deployment endpoint. Never accept it from a request parameter. */
  baseUrl: string; fetch?: typeof fetch; getHeaders?: () => Promise<Record<string, string>>;
  timeoutMs?: number; maxInputBytes?: number; maxOutputBytes?: number;
}) {
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use a trusted Gotenberg origin without credentials or path.');
  const timeout = options.timeoutMs ?? 30_000, maxInput = options.maxInputBytes ?? 20_000_000, maxOutput = options.maxOutputBytes ?? 25_000_000;
  for (const limit of [timeout, maxInput, maxOutput]) if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid conversion limit.');
  return async function convert(kind: 'html' | 'office', files: ConversionFile[], signal?: AbortSignal): Promise<Uint8Array> {
    if (!files.length || files.length > 50) throw new Error('Supply 1–50 conversion files.');
    const form = new FormData(), seen = new Set<string>(); let bytes = 0;
    for (const file of files) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,150}$/u.test(file.name) || file.name === '.' || file.name === '..' || seen.has(file.name.toLowerCase())) throw new Error('Conversion files require unique flat filenames.');
      seen.add(file.name.toLowerCase()); bytes += file.data.size;
      if (bytes > maxInput) throw new Error('Conversion input byte limit exceeded.');
      form.append('files', file.data, file.name);
    }
    if (kind === 'html' && !files.some(file => file.name === 'index.html')) throw new Error('HTML conversion requires index.html.');
    if (kind !== 'html' && kind !== 'office') throw new Error('Unsupported conversion route.');
    const response = await (options.fetch ?? fetch)(new URL(kind === 'html' ? '/forms/chromium/convert/html' : '/forms/libreoffice/convert', base), {
      method: 'POST', body: form, redirect: 'error', headers: await options.getHeaders?.(),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Gotenberg conversion failed (${response.status}).`); }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')) { await response.body?.cancel(); throw new Error('Gotenberg did not return a PDF. Use one Office document per request.'); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('Missing PDF response body.');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > maxOutput) throw new Error('Conversion output byte limit exceeded.'); chunks.push(value); }
    } catch (error) { await reader.cancel(error); throw error; } finally { reader.releaseLock(); }
    const output = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    if (new TextDecoder().decode(output.subarray(0, 5)) !== '%PDF-') throw new Error('Invalid PDF response signature.');
    return output;
  };
}
