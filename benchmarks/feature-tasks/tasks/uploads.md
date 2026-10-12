Add file uploads with size and type checks to this app (teamnotes, TypeScript on Node 22, see README.md).

First add these limits to the `config` object in `src/config.ts` exactly as written; tests replace them, so read them from `config` on every request:

```ts
  // Upload limits in bytes.
  maxUploadBytes: 1_048_576,
  tenantQuotaBytes: 10_485_760,
```

Then create `src/blobs.ts` and `src/scanner.ts` exactly as follows; tests replace these functions, so always call them through `blobs.` and `scanner.`:

```ts
// src/blobs.ts: object storage for file bytes
export const blobs = {
  store: new Map<string, Uint8Array>(),
  put: async (key: string, bytes: Uint8Array): Promise<void> => { blobs.store.set(key, bytes) },
  get: async (key: string): Promise<Uint8Array | undefined> => blobs.store.get(key),
  delete: async (key: string): Promise<void> => { blobs.store.delete(key) },
}
```

```ts
// src/scanner.ts: malware scanner
export const scanner = {
  scan: async (bytes: Uint8Array): Promise<'clean' | 'infected'> => 'clean',
}
```

Endpoints and functions:

- `POST /tenants/:tenantId/files?name=<original filename>` with the raw file bytes as the request body (any `content-type`). Respond `201 { id, name, type, size, status: "quarantined" }`, where `name` is the sanitized filename, `type` the detected type and `size` the byte count. Errors: `400 { "error": "invalid_name" }`, `413 { "error": "too_large" }`, `415 { "error": "unsupported_type" }`, `507 { "error": "quota_exceeded" }`, plus the README's 401, 403 and 404.
- `GET /tenants/:tenantId/files/:id` returns the file's bytes once it has been scanned clean. While it is quarantined, respond `409 { "error": "not_scanned" }`. Unknown files, files of another tenant and infected files are `404`.
- `processScans(): Promise<void>` exported from `src/uploads.ts` scans quarantined files. The app calls it from a background job; uploads are only scanned there.
- `preflight(file: { name: string; size: number; type: string }, maxBytes: number)` exported from `src/upload-preflight.ts` returns `{ ok: true }` or `{ ok: false, error: 'too_large' | 'unsupported_type' | 'invalid_name' }`. It is the browser-side check run before uploading, so that file must not import `node:` modules or server code such as `db.ts` or `config.ts`.

The allowlist (extensions compared case-insensitively):

| Extension | Type | Detected when the bytes |
| --- | --- | --- |
| `.png` | `image/png` | start with `89 50 4E 47 0D 0A 1A 0A` |
| `.jpg`, `.jpeg` | `image/jpeg` | start with `FF D8 FF` |
| `.gif` | `image/gif` | start with `GIF87a` or `GIF89a` |
| `.pdf` | `application/pdf` | start with `%PDF-` |
| `.txt` | `text/plain` | are valid UTF-8 (an initial BOM allowed) without NUL or other control characters except tab, line feed and carriage return, and are not markup: after an optional BOM and whitespace they do not start with `<!`, `<?` or `<` followed by a letter |

Requirements:

- **Server size limit.** Enforce `config.maxUploadBytes` while reading the body as a stream: reject a declared `Content-Length` over the limit with 413 before reading the body, and stop reading and reject with 413 as soon as the bytes received exceed the limit, whatever the declared length. Never buffer more than the limit plus one chunk. A file of exactly the limit is accepted.
- **Content sniffing.** Detect the type from the file's bytes as in the table. The declared `Content-Type` is never trusted; the response, the stored record and the download use the detected type.
- **Type allowlist.** Accept only the types in the table, and only when the detected type is the one for the filename's extension. Anything else, including SVG, HTML, executables and files without an extension, is 415.
- **Safe filenames.** Sanitize the original name before storing or returning it: keep only the part after the last `/` or `\`, remove control characters and Unicode bidirectional formatting characters (U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069), remove leading dots and spaces and trailing dots and spaces, and shorten it to at most 255 characters keeping the extension. If the result is empty, `..`, or a Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, any case, with or without extensions, so `nul.tar.gz` too), respond 400 `invalid_name` (as for a missing name). Check the name before the type. Store bytes under a random key that does not contain the original name.
- **Client preflight.** `preflight` refuses a file larger than `maxBytes` (`too_large`), a name whose extension is not in the allowlist or a non-empty `type` that is not the allowlisted type for that extension (`unsupported_type`), and a name the server would refuse (`invalid_name`), before anything is uploaded.
- **Authorization and quota.** Only members of the tenant upload to it or download its files. The sizes of a tenant's stored files (quarantined or clean) plus uploads in progress never exceed `config.tenantQuotaBytes`, even with concurrent uploads; an upload that would exceed it is 507. An upload that fails (for example `blobs.put` throws, answered with a 5xx status) and a file deleted as infected no longer count.
- **Malware scan.** Every upload starts quarantined and is not served until `scanner.scan` (given the stored bytes) returns `clean`. When it returns `infected`, delete the bytes with `blobs.delete` and treat the file as gone. When the scanner throws, the file stays quarantined and is scanned again on a later `processScans()` call. Files already scanned are not scanned again. Calls of `processScans()` may overlap: a file is never scanned by two calls at once and its verdict takes effect once.
- **Safe serving.** Downloads are served as attachments: `content-type` is the detected type, `content-disposition` is `attachment` with the sanitized name in an RFC 6266 `filename*=UTF-8''<percent-encoded name>` parameter (an ASCII `filename="..."` fallback may be added), and `x-content-type-options: nosniff`.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it); file bytes live only in `blobs`. Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
