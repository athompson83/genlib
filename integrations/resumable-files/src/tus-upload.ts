// SPDX-License-Identifier: Apache-2.0
import { Upload, type UploadOptions } from 'tus-js-client';
import { assertFile, assertUploadUrl, resumeFingerprint, validatePolicy, type UploadPolicy } from './policy.js';

export interface TusUploadOptions {
  policy: UploadPolicy;
  /** Called for every HEAD/POST/PATCH/DELETE; credentials are never persisted by this adapter. */
  getHeaders: () => Promise<Record<string, string>>;
  onProgress?: (sent: number, total: number) => void;
  onComplete: (url: string) => void;
  onError: (error: Error) => void;
  /** Explicit user/application choice; no automatic selection of an old upload. */
  choosePrevious?: (uploads: Awaited<ReturnType<Upload['findPreviousUploads']>>) => Promise<number | null>;
  transport?: Pick<UploadOptions, 'httpStack' | 'urlStorage' | 'chunkSize' | 'fileReader'>;
}

export function createTusUpload(file: File, options: TusUploadOptions) {
  assertFile(file, options.policy);
  let disposed = false;
  const upload = new Upload(file, {
    ...options.transport,
    endpoint: validatePolicy(options.policy).href,
    metadata: { filename: file.name, filetype: file.type },
    fingerprint: input => resumeFingerprint(input, options.policy),
    removeFingerprintOnSuccess: true,
    retryDelays: [0, 1_000, 3_000, 5_000],
    onShouldRetry: error => {
      const status = error.originalResponse?.getStatus();
      return status === undefined || status === 408 || status === 409 || status === 423 || status === 429 || status >= 500;
    },
    onBeforeRequest: async request => {
      assertUploadUrl(request.getURL(), options.policy);
      for (const [name, value] of Object.entries(await options.getHeaders())) request.setHeader(name, value);
    },
    onProgress: options.onProgress,
    onError: options.onError,
    onSuccess: () => {
      if (upload.url) options.onComplete(assertUploadUrl(upload.url, options.policy));
    },
  });
  return {
    upload,
    async start() {
      if (disposed) throw new Error('Upload has been disposed.');
      const previous = (await upload.findPreviousUploads()).filter(item => {
        try { return item.uploadUrl !== null && !!assertUploadUrl(item.uploadUrl, options.policy); } catch { return false; }
      });
      if (options.choosePrevious && previous.length) {
        const index = await options.choosePrevious(previous);
        if (index !== null) {
          const selected = previous[index];
          if (!Number.isInteger(index) || !selected) throw new Error('Invalid previous upload selection.');
          upload.resumeFromPreviousUpload(selected);
        }
      }
      if (!disposed) upload.start();
    },
    pause: () => upload.abort(false),
    /** Termination performs an authorized DELETE on the configured tus resource. */
    cancel: () => upload.abort(true),
    async dispose() { disposed = true; await upload.abort(false); },
  };
}
