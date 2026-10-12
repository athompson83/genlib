# File upload with size and type checks · 0.2.1

## What installs

Seven original Apache-2.0 files under `file-uploads/`:

- `policy.ts`: browser-safe rules shared by both sides. It holds `normalizePolicy`, `sniffType` (magic bytes and a text heuristic), `checkType` (the allowlist decision), `sanitizeFilename` and the `UPLOAD_TYPES` table.
- `client.ts`: `preflight(file, policy)`, which checks a `File`, a `Blob` or any File-like object in the browser before upload.
- `core.ts`: `createFileUploads`, which provides `upload`, `download`, `remove`, `scan`, `scanPending`, `recordScanResult` and `usage`. It also defines `FileUploadError` and the `UploadMetadataStore` and `BlobStore` interfaces.
- `memory-store.ts`: `MemoryUploadMetadataStore` and `MemoryBlobStore`, reference stores for tests and prototypes.
- `http.ts`: `createFileUploadHandler`, a server-only Fetch `Request`/`Response` adapter, plus `contentDisposition` and `servingHeaders`.
- `schema.sql` and `sql-store.ts`: the `file_uploads` and `file_upload_quotas` tables, and `createSqlUploadMetadataStore(executor, { table?, quotaTable? })` for any `query(text, params)` executor that uses `$1` placeholders.

**No antivirus engine is included.** Scanning is a hook that your application supplies. Without a scanner, or a verdict recorded from your own pipeline, every upload stays quarantined and is never served. The module also includes no object storage, session system or user table.

## When to use it

Use it when signed-in users attach files (avatars, documents, receipts) to records in a multi-tenant server app, and you need a size limit, real type checks, quotas and safe downloads.

Do not use it for:

- resumable or very large uploads (see the `resumable-files` integration)
- direct-to-bucket presigned uploads, where the bytes never pass through your server
- public static assets

## Integration points

| Point | What the application supplies |
| --- | --- |
| `policy` | `{ maxBytes, allow?, allowActiveContent?, allowGenericDeclaredType?, maxFilenameBytes?, extensions?, filenameControls?, invalidFilenames? }`. The default allowlist is png, jpeg, gif, webp and pdf. Pass the same object to `preflight`. |
| `blobs` | A `BlobStore` (`put`, `get`, `delete`) over S3, R2, GCS or disk, keyed by the random `storageKey`. |
| `metadata` | On PostgreSQL, apply `schema.sql` and call `createSqlUploadMetadataStore(db)`. Elsewhere, implement `reserve` and `claimScan` as one conditional statement each, and implement `setStatus` and `delete` as conditional statements that return the row. |
| `authorize(user, tenantId, action)` | Your membership check for `upload`, `read` and `delete`. |
| `quotaBytes` | A number, or `(tenantId) => number` for per-plan limits. |
| `scanner(bytes, record)` | Your antivirus, such as a ClamAV daemon or a scanning API. It returns `"clean"` or `"infected"`, and throws when the scan could not finish. Call `scanPending()` from a background job, or `scan(id)` from a queue worker. |
| `checkDeclaredType`, `lengthMismatch`, `scanLeaseMs` | Optional. Default `true` (the declared `Content-Type` must agree), `"bad-request"` (a body longer than its `Content-Length`) and 15 minutes (how long a scan claim lasts). |
| `userId(user)` | Optional. The owner id stored on each record. The default is `user.id`. |
| HTTP `authenticate(request)`, `allowedOrigins` | Your session lookup, and the exact origins allowed to POST and DELETE. |

```ts
import { createFileUploads } from "./genlib/file-uploads/core.js";
import { createSqlUploadMetadataStore } from "./genlib/file-uploads/sql-store.js";
import { createFileUploadHandler } from "./genlib/file-uploads/http.js";

export const policy = { maxBytes: 10 * 1024 * 1024, allow: ["png", "jpeg", "pdf"] } as const;
const uploads = createFileUploads({
  metadata: createSqlUploadMetadataStore(db), blobs: s3BlobStore, policy,
  authorize: (user, tenantId, action) => memberships.can(user.id, tenantId, action),
  quotaBytes: (tenantId) => plans.storageBytes(tenantId),
  scanner: (bytes) => clamav.scan(bytes), // returns "clean" | "infected"
});
export const handler = createFileUploadHandler({
  uploads, prefix: "/api/uploads", allowedOrigins: [APP_ORIGIN], authenticate: (request) => sessions.user(request),
});
// From a background job: await uploads.scanPending()  (or uploads.scan(record.id) from a queue worker)
```

Client:

```ts
import { preflight } from "./genlib/file-uploads/client.js";
const check = await preflight(file, policy);
if (!check.ok) showError(check.message);
else await fetch(`/api/uploads/tenants/${tenantId}/files?filename=${encodeURIComponent(file.name)}`, { method: "POST", body: file, headers: { "content-type": file.type } });
```

## Behavior

- **Upload order.** `upload` runs these steps in order:
  1. Authorizes the user for the tenant.
  2. Refuses a declared `Content-Length` over `maxBytes`.
  3. Sanitizes the name (with `invalidFilenames: "reject"`, refuses it with `invalid-name`).
  4. Checks that the sanitized name's extension and the declared type name an allowlisted type.
  5. Reserves quota for a declared `Content-Length`.
  6. Reads the stream while counting bytes, reserving quota as bytes arrive when there was no `Content-Length`.
  7. Sniffs the bytes.
  8. Stores them under a random key.
  9. Inserts the metadata row as `quarantined`.
  10. Settles the quota to the real size.

  Steps 1 to 5 read no body, and a rejection there cancels the request stream unread.
- **Size.** Bytes are counted per chunk. The first chunk past the limit cancels the reader and fails with `too-large`. A body longer than its declared `Content-Length` fails at the first chunk past it with `bad-request` (or `too-large` with `lengthMismatch: "too-large"`); a shorter body fails with `bad-request`. Empty files are refused.
- **Sniffing.** Files are recognized by their leading bytes: png (`89 50 4E 47 0D 0A 1A 0A`), jpeg (`FF D8 FF`), gif (`GIF87a`/`GIF89a`), webp (`RIFF....WEBP`), pdf (`%PDF-`) and zip (`PK 03 04`/`PK 05 06`). Text must be valid UTF-8 across the whole file, with no NUL and no control characters other than tab, LF, FF and CR. Text that starts (after a BOM and whitespace) with `<` followed by a letter, `!`, `?` or `/` is markup: `svg` when an `<svg` tag appears in the first 1 KiB, otherwise `html`. Other text starting with `<`, such as `<3`, is plain text.
- **Allowlist.** The detected type must be allowlisted. The extension must belong to that same type, for example `jpg`, `jpeg` or `jpe` for jpeg; `policy.extensions` replaces a type's list (`{ text: ["txt"] }`), and an extension may belong to only one allowed type. The declared type must equal its media type (`image/jpg` is accepted for jpeg). An empty or `application/octet-stream` declared type is accepted unless `allowGenericDeclaredType: false`. With `checkDeclaredType: false` the server ignores the declared type entirely; `preflight` still checks it. svg and html can only be allowlisted with `allowActiveContent: true`. Serve those types only from a separate, cookieless origin.
- **Names and keys.** `sanitizeFilename` keeps only the last path segment. It removes every Unicode format character (`\p{Cf}`, which includes bidi controls such as U+202E and U+061C, zero-width characters, the soft hyphen and the BOM) and blank-rendering fillers (U+115F, U+1160, U+3164, U+FFA0, U+2800). A stem left empty by that removal becomes `file`, so `\u3164.png` is stored as `file.png`. It replaces controls (or removes them, with `filenameControls: "remove"`) and `<>:"|?*` with `_`, and trims leading and trailing dots and spaces. It prefixes Windows device names (`CON`, `NUL`, `COM1` and so on, with any extension) with `_` and turns an empty result (`..`, `/`) into `file`; with `invalidFilenames: "reject"` both fail with `invalid-name` (HTTP 400) instead, and `preflight` answers `bad-name`. It caps the name at `maxFilenameBytes` UTF-8 bytes while keeping the extension. The name is only displayed. Bytes are stored under `newId()`, which defaults to `crypto.randomUUID()`.
- **Quota.** `reserve(tenant, bytes, limit)` is atomic. In memory it is a synchronous check-and-add. On PostgreSQL it is one `INSERT ... ON CONFLICT DO UPDATE ... WHERE used + bytes <= limit`. A declared `Content-Length` is reserved up front. Without it, the upload reserves the rest of `maxBytes` at once while that fits the quota (so concurrent uploads cannot starve each other), and otherwise exactly each chunk's bytes, so a file that fits what remains is accepted and one that does not is cut off with `quota-exceeded`. Every failure after the reservation releases it, including a storage error, a rejected type or a failed metadata insert (which also deletes the stored blob). `remove` releases the file's size.
- **Quarantine and scanning.** New records are `quarantined`, and `download` refuses them. `scan(id)` first claims the file with one conditional update (`claimScan`, a lease of `scanLeaseMs`), so overlapping workers never scan one file twice; a file another worker holds, or one already decided, is returned unchanged. It then passes the stored bytes to your scanner. `scanPending({limit?})` scans up to 100 unclaimed quarantined files, oldest first, and returns `{clean, infected, failed, skipped}`. A `clean` verdict makes the file servable. An `infected` verdict deletes the bytes and releases the quota. A thrown error or any other return value leaves the file quarantined (`scan-failed`) and drops the claim, so the next pass scans it again. A worker that crashes mid-scan holds the file until its claim expires. Status changes are conditional on `quarantined`, so a stale or concurrent verdict cannot flip a decided file.
- **Identifiers.** Tenant ids and file ids must match `[A-Za-z0-9_-]{1,128}`. Map other tenant keys to such an id.
- **Authorization.** `download` and `remove` look up the record and call `authorize(user, record.tenantId, action)`. A file in another tenant fails exactly like a missing one (`not-found`).

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `POST {prefix}/tenants/{tenantId}/files?filename=` | raw file bytes; `Content-Type` is the file type | `201 {id, filename, contentType, size, status, createdAt}` |
| `GET {prefix}/files/{id}` | none | `200` file bytes (clean files only) |
| `DELETE {prefix}/files/{id}` | none | `204` |

Errors are JSON `{error}`:

| Status | Codes |
| --- | --- |
| 400 | `bad-request`, `invalid-name` |
| 401 | `unauthenticated` |
| 403 | `bad-origin`, `forbidden` |
| 404 | `not-found` |
| 405 | method not allowed |
| 409 | `quarantined` |
| 410 | `infected` |
| 413 | `too-large`, `quota-exceeded` |
| 415 | `unsupported-type`, `type-mismatch` |

Downloads carry these headers:

- `Content-Type`: the stored detected type, with `; charset=utf-8` for text. It is never the client's declared type.
- `Content-Disposition: attachment; filename="<ASCII fallback>"; filename*=UTF-8''<RFC 8187 encoding>`.
- `X-Content-Type-Options: nosniff`.
- `Content-Security-Policy: default-src 'none'; sandbox`.
- `Cross-Origin-Resource-Policy: same-origin`.
- `Cache-Control: private, no-store`.
- `Referrer-Policy: no-referrer`.

## Verify

`npm run build && node --test tests/file-uploads.test.mjs tests/file-uploads-sql.test.mjs` covers these cases:

- a declared or streamed size over the limit, with cancellation and no further reads
- sniffing vectors
- allowlist agreement between the type, the extension and the declared type
- svg and html refusal, including when renamed
- filename sanitizing and random storage keys
- `preflight` on File-like objects and real `File` objects
- tenant authorization
- concurrent uploads against a quota (memory and PGlite), streamed uploads without `Content-Length` that fit the remaining quota, and release on failure
- markup detection (`<3` is text), `policy.extensions`, `filenameControls`, `invalidFilenames`, `checkDeclaredType` and `lengthMismatch`
- overlapping `scanPending` passes and concurrent `scan(id)` calls scanning each file once, retry after a failed scan, and claim expiry (memory and PGlite)
- quarantine, clean, infected, failed and vague scans
- serving headers, and every HTTP status above

In the receiving app, run the same cases against your real BlobStore, database and scanner. Include two concurrent uploads against a nearly full quota, and an EICAR test file through your scanner.

## If something fails

- **Every upload returns 415:** the extension, the declared `Content-Type` and the bytes must all name one allowlisted type. Check that the client sends `file.type` and the original file name.
- **Streamed uploads fail near a full quota:** without `Content-Length` several concurrent uploads may each be cut off partway (none exceeds the quota). Send `Content-Length`.
- **Files never download (409):** no scanner ran. Call `scanPending()` from a background job or `scan(id)` from a worker, or call `recordScanResult` from your pipeline.
- **Upgrading from 0.1.0:** run `ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS scan_claimed_until bigint;` and add `claimScan`, `releaseScanClaim` and `listQuarantined` to a custom metadata store.
- **Usage drifts from stored bytes:** a release failed after a delete. Recompute `used_bytes` from `SUM(size)` of non-infected rows on a schedule.

## Limits

- **Antivirus.** No engine is included, and detection quality is entirely your scanner's.
- **Buffering.** Accepted bytes are held in memory up to `maxBytes` before `BlobStore.put`. There is no streaming to storage, multipart parsing or resumable upload. Cap body size at your proxy too, because one oversized chunk is already in memory when it is counted.
- **Sniffing depth.** Only leading signatures and a text heuristic are checked, not full file structure. Re-encode images you render, and treat PDFs as untrusted.
- **zip-based formats.** docx, xlsx and similar formats are refused, not identified.
- **Reconciliation.** If a release or blob deletion fails after a metadata delete, quota or an orphaned blob needs a scheduled fix.
- **Testing scope.** PGlite runs as a single connection, so the concurrency tests check the conditional statements, not real multi-connection contention.

Production storage, scanner accuracy, proxy limits and consuming-application acceptance remain project responsibilities.
