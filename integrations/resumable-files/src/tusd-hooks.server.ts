// SPDX-License-Identifier: Apache-2.0
/** Original adapters for a private tusd HTTP hook endpoint and its authenticated gateway. */
export interface UploadPrincipal { tenantId: string; subjectId: string }
export interface TusdHook {
  Type: 'pre-create' | 'post-finish' | 'pre-terminate' | 'post-terminate';
  Event: {
    Upload: { ID: string; Size: number; Offset: number; SizeIsDeferred?: boolean; MetaData?: Record<string, string> };
    HTTPRequest?: { Header?: Record<string, string[]> };
  };
}
export interface TusdHookAdapters {
  maxFileBytes: number;
  /** Authenticate the original user/session forwarded by the trusted tusd service. */
  principal: (headers: Record<string, string[]>) => Promise<UploadPrincipal | null>;
  /** Atomically reserve quota and an opaque upload ID, keyed to this principal. */
  reserve: (input: { principal: UploadPrincipal; bytes: number; filename: string; mimeType: string }) => Promise<{ id: string }>;
  owns: (principal: UploadPrincipal, uploadId: string) => Promise<boolean>;
  /** Persist idempotently, then queue scanning/finalization; do not perform long work in the hook. */
  completed: (uploadId: string, bytes: number) => Promise<void>;
  released: (uploadId: string) => Promise<void>;
}
function uploadId(id: string) { if (!/^[a-zA-Z0-9_-]{1,200}$/u.test(id)) throw new Error('Invalid upload ID.'); }

/** Call this gateway guard before forwarding every resource HEAD/PATCH/DELETE to tusd. */
export async function authorizeTusResource(principal: UploadPrincipal | null, id: string, adapters: Pick<TusdHookAdapters, 'owns'>): Promise<boolean> {
  uploadId(id); return !!principal && adapters.owns(principal, id);
}

/** The HTTP route must authenticate tusd itself (private network + mTLS/service authentication) before calling this function. */
export async function handleTusdHook(hook: TusdHook, adapters: TusdHookAdapters): Promise<Record<string, unknown>> {
  if (!hook || !hook.Event?.Upload) throw new Error('Invalid tusd hook.');
  const upload = hook.Event.Upload;
  if (hook.Type === 'pre-create') {
    const principal = await adapters.principal(hook.Event.HTTPRequest?.Header ?? {});
    if (!principal) return { RejectUpload: true, HTTPResponse: { StatusCode: 401, Body: 'Authentication required.' } };
    const metadata = upload.MetaData ?? {}, filename = metadata.filename ?? metadata.name ?? '', mimeType = metadata.filetype ?? metadata.type ?? 'application/octet-stream';
    if (!Number.isSafeInteger(adapters.maxFileBytes) || adapters.maxFileBytes < 1) throw new Error('Invalid server upload limit.');
    if (upload.SizeIsDeferred || !Number.isSafeInteger(upload.Size) || upload.Size < 0 || upload.Size > adapters.maxFileBytes ||
        !filename || filename.length > 255 || /[/\\\u0000-\u001f]/u.test(filename)) {
      return { RejectUpload: true, HTTPResponse: { StatusCode: 400, Body: 'Invalid upload metadata or size.' } };
    }
    const reserved = await adapters.reserve({ principal, bytes: upload.Size, filename, mimeType }); uploadId(reserved.id);
    return { ChangeFileInfo: { ID: reserved.id, MetaData: { filename, filetype: mimeType } } };
  }
  uploadId(upload.ID);
  if (hook.Type === 'post-finish') {
    if (!Number.isSafeInteger(upload.Size) || upload.Size < 0 || upload.Offset !== upload.Size) throw new Error('Upload completion size mismatch.');
    await adapters.completed(upload.ID, upload.Size); return {};
  }
  if (hook.Type === 'pre-terminate') {
    const principal = await adapters.principal(hook.Event.HTTPRequest?.Header ?? {});
    return { RejectTermination: !await authorizeTusResource(principal, upload.ID, adapters) };
  }
  if (hook.Type === 'post-terminate') { await adapters.released(upload.ID); return {}; }
  throw new Error('Unsupported tusd hook type.');
}
