# Resumable files

Original Apache-2.0 adapters for Uppy 6, tus-js-client 4 and zip.js 2. The pack supplies usable upload lifecycles, a server hook contract and export actions. It does not provision storage or run an upload service when imported.

## Install and verify

From this pack directory, use Node 24 (the measured profile is 24.19.0):

```sh
npm ci --ignore-scripts
npm test
```

`package.json` and `package-lock.json` pin optional dependencies. `npm test` compiles `src/` into `.build/` and runs six tests. The receiving application can import the editable TypeScript or the compiled files with its own build. No dependencies are added to Genlib's core CLI.

## Client adapters

`createUploader` in `src/uppy.ts` returns a real Uppy instance and `dispose()`. Supply `policy`, `getHeaders`, `onUploaded` and `onError`; supply `dashboardTarget` to mount Dashboard, or omit it for a headless instance. Import these styles in the browser entrypoint:

```ts
import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';
```

Use Uppy methods to add files, start uploads and update the UI. Call `dispose()` on unmount or account change. The instance limits file count/size and upload concurrency, sends only name/type metadata, and refreshes headers for every tus request. Recreate it when tenant or user scope changes.

`createTusUpload(file, options)` in `src/tus-upload.ts` is the single-file alternative. Its controller exposes `start()`, `pause()`, `cancel()` and `dispose()`. `cancel()` requests termination of the server resource; pause/dispose leave it resumable. `choosePrevious` explicitly selects among validated stored uploads. `onProgress` reports bytes; `onComplete` receives the validated upload URL. `transport` permits an application-owned HTTP stack/storage/file reader without changing the lifecycle.

`UploadPolicy` requires a credential-free HTTPS endpoint, non-secret tenant/user `scope`, `maxFileBytes` and `maxFiles`; MIME restrictions are optional. HTTP is allowed only for explicit localhost development. Before sending credentials, the adapter checks resumed URLs against the configured origin/path and rejects credentials, queries, fragments and encoded separators. A fingerprint hashes file metadata and scope; it is a resume hint, not proof of content or permission. Browser MIME and size preflight never replace server checks. Clear the application's resume state on logout according to its privacy policy.

## tusd authorization and persistence

`src/tusd-hooks.server.ts` contains `handleTusdHook` and `authorizeTusResource`. Mount the hook behind a bounded JSON route that authenticates the tusd service itself. A private network alone may be insufficient for the application's trust model; supply service authentication. Return the hook JSON in an HTTP 200 response with JSON content type, including logical rejection responses, as required by [tusd HTTP hooks](https://tus.github.io/tusd/advanced-topics/hooks/).

Provide these application adapters:

| Adapter | Required behavior |
|---|---|
| `principal` | Authenticate original user/session headers forwarded by trusted tusd |
| `reserve` | Atomically reserve quota and a globally unique opaque upload ID owned by that principal |
| `owns` | Check persisted tenant/user ownership of an upload ID |
| `completed` | Idempotently persist completion and queue scanning/finalization after matching offsets |
| `released` | Idempotently release resources after termination; reconcile replayed or out-of-order hooks |

Run the gateway ownership guard before **every HEAD, PATCH and DELETE**, with tusd inaccessible directly. Hooks alone do not authorize every chunk. Enable pre-create, post-finish, pre-terminate and post-terminate hooks; disable downloads with tusd's `-disable-download` setting. Configure streaming proxy limits, origin allowlists, storage isolation, abandoned-upload cleanup and scanning in the host. The pack replaces user-supplied ownership metadata with server-reserved identity; metadata never decides ownership. See [tusd configuration](https://tus.github.io/tusd/getting-started/configuration/) and [Uppy Tus](https://uppy.io/docs/tus/).

## ZIP exports and customization

`createZip(files, options)` returns a Blob. `streamZip(files, destination, options)` writes to a caller-owned `WritableStream<Uint8Array>`. Both accept Blob inputs, cancellation, progress and bounded quotas (defaults: 1,000 files, 256 MiB total input). Paths are relative, portable and normalized; traversal, reserved names, case-insensitive duplicates and file/directory collisions fail before writing. There is no extraction or filesystem write. Use streaming for large output and connect any browser save action through the application's explicit user interaction.

## Evidence and license boundaries

Node 24.19.0 tests execute a real tus client against a local HTTP fixture, including HEAD-offset resume and refreshed credentials; execute zip.js export/readback and streaming; and exercise hook quota/ownership/completion boundaries. Uppy Dashboard interaction and a deployed tusd gateway/storage service were not exercised. Run interruption/reload, concurrent quota, session change, CORS, malware-finalization and keyboard acceptance in the receiving application.

Uppy and tus upstream code retain MIT terms; [zip.js](https://github.com/gildas-lormeau/zip.js) retains BSD-3-Clause terms. No upstream source, hosted service, S3 signing profile or Companion deployment is included. Review upstream release notes and rerun these tests before changing pins; preserve dependency notices.
