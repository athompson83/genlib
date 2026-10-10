// SPDX-License-Identifier: Apache-2.0
export interface UploadPolicy {
  endpoint: string;
  /** Tenant/user scope for local resume records. Never put a secret in this value. */
  scope: string;
  maxFileBytes: number;
  maxFiles: number;
  allowedMimeTypes?: string[];
  allowLocalHttp?: boolean;
}

export function validatePolicy(policy: UploadPolicy): URL {
  const url = new URL(policy.endpoint);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search ||
      !(url.protocol === 'https:' || (policy.allowLocalHttp && local && url.protocol === 'http:'))) {
    throw new Error('Use a credential-free HTTPS upload endpoint (or explicit localhost HTTP).');
  }
  if (!policy.scope.trim() || !Number.isSafeInteger(policy.maxFileBytes) || policy.maxFileBytes <= 0 ||
      !Number.isSafeInteger(policy.maxFiles) || policy.maxFiles <= 0) throw new Error('Invalid upload limits or scope.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** Apply before sending credentials to a resumed URL returned by local storage or the server. */
export function assertUploadUrl(candidate: string, policy: UploadPolicy): string {
  const base = validatePolicy(policy);
  const url = new URL(candidate, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || /%(?:2f|5c|00)/iu.test(url.pathname) || url.username || url.password || url.hash || url.search) {
    throw new Error('Upload URL is outside the configured upload endpoint.');
  }
  return url.href;
}

export function assertFile(file: Pick<File, 'name' | 'size' | 'type'>, policy: UploadPolicy): void {
  validatePolicy(policy);
  if (!file.name || /[\u0000-\u001f]/u.test(file.name) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > policy.maxFileBytes) {
    throw new Error('File name or size violates the upload policy.');
  }
  if (policy.allowedMimeTypes?.length && !policy.allowedMimeTypes.some(type =>
    type === file.type || (type.endsWith('/*') && file.type.startsWith(type.slice(0, -1))))) {
    throw new Error('File type is not allowed.');
  }
}

/** A resume hint, not content authentication. The server must authorize every resource. */
export async function resumeFingerprint(file: Pick<File, 'name' | 'size' | 'type' | 'lastModified'>, policy: UploadPolicy): Promise<string> {
  const key = JSON.stringify([validatePolicy(policy).href, policy.scope, file.name, file.size, file.type, file.lastModified]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return `genlib-tus-v1-${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
