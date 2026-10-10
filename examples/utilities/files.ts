/** Metadata-only upload preflight; server must inspect bytes and enforce storage policies. */
export interface FileCandidate { name: string; size: number; type: string }
export interface FilePolicy { maxBytes: number; extensions: readonly string[]; mimeTypes: readonly string[] }
export function validateUpload(file: FileCandidate, policy: FilePolicy): { ok: boolean; reason?: string } {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || !Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 1) return {ok:false,reason:"Invalid size"};
  if (file.size > policy.maxBytes) return {ok:false,reason:"File too large"};
  if (!file.name || /[\\/\u0000-\u001f]/.test(file.name) || file.name === "." || file.name === "..") return {ok:false,reason:"Invalid filename"};
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!policy.extensions.map(x=>x.toLowerCase()).includes(extension)) return {ok:false,reason:"Unsupported extension"};
  if (!policy.mimeTypes.includes(file.type)) return {ok:false,reason:"Unsupported declared type"};
  return {ok:true};
}
