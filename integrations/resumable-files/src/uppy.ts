// SPDX-License-Identifier: Apache-2.0
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import Tus, { type TusBody } from '@uppy/tus';
import { assertUploadUrl, resumeFingerprint, validatePolicy, type UploadPolicy } from './policy.js';

export function createUploader(options: {
  policy: UploadPolicy;
  getHeaders: () => Promise<Record<string, string>>;
  onUploaded: (file: { id: string; name: string; url: string }) => void;
  onError: (error: Error) => void;
  /** Omit for a headless Uppy instance. Include core and Dashboard CSS in the host application. */
  dashboardTarget?: HTMLElement;
}) {
  const endpoint = validatePolicy(options.policy).href;
  const uppy = new Uppy<Record<string, unknown>, TusBody>({
    id: `genlib-${options.policy.scope}`,
    autoProceed: false,
    restrictions: {
      maxFileSize: options.policy.maxFileBytes,
      maxNumberOfFiles: options.policy.maxFiles,
      allowedFileTypes: options.policy.allowedMimeTypes,
    },
  });
  uppy.use(Tus, {
    endpoint,
    limit: 3,
    allowedMetaFields: ['name', 'type'],
    removeFingerprintOnSuccess: true,
    fingerprint: file => resumeFingerprint(file, options.policy),
    onBeforeRequest: async request => {
      assertUploadUrl(request.getURL(), options.policy);
      for (const [name, value] of Object.entries(await options.getHeaders())) request.setHeader(name, value);
    },
  });
  if (options.dashboardTarget) uppy.use(Dashboard, { target: options.dashboardTarget, inline: true, proudlyDisplayPoweredByUppy: false });
  uppy.on('upload-success', (file, response) => {
    if (!file || !response.uploadURL) return;
    try { options.onUploaded({ id: file.id, name: file.name ?? file.id, url: assertUploadUrl(response.uploadURL, options.policy) }); }
    catch (error) { options.onError(error instanceof Error ? error : new Error('Invalid upload response.')); }
  });
  uppy.on('upload-error', (_file, error) => options.onError(error));
  return { uppy, dispose: () => uppy.destroy() };
}
