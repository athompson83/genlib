# Desktop picker, secure storage and delivery profiles

Original host glue, fixtures, SVG/icon exports and tests are Apache-2.0. Electron, electron-builder/updater, Wails, go-keyring, go-selfupdate, Avalonia, ktsu.CredentialCache and Velopack are MIT; Tauri core/plugins and Rust keyring use MIT OR Apache-2.0. Resolved dependencies and bundled OS/browser runtimes retain their own notices. No third-party implementation, installer, SDK runtime or private signing key is vendored.

## Authored behavior and boundaries

All four hosts provide title validation, a native text-file picker, a fixed OS credential slot, and an explicit update workflow. The shared web renderer and the native Avalonia window expose actual controls for these operations.

| Operation | Contract |
| --- | --- |
| Choose file | Open the host's native file dialog; accept one `.txt`, `.md` or `.json` file; read at most 256 KiB; require valid UTF-8 and reject NUL bytes. Return only its leaf name and text. Cancellation returns no selection. No caller supplies a path. File contents render as text. |
| Save session | Accept one nonempty, single-line token of at most 2048 UTF-8 bytes. Persist to a fixed app-specific service/account. Clear the input after submission. This fixture stores an opaque token; it does not authenticate it or log in to a service. |
| Session status / clear | Return only a boolean indicating presence, or remove this fixed credential. The UI cannot retrieve a secret, select a different key/account, enumerate credentials or use generic storage APIs. Native failures surface a generic error. |
| Update | Check only a trusted host-configured HTTPS feed; reject downgrade policy violations; download and validate an artifact; require a separate final install/restart action. No startup update check, automatic download, automatic install-on-quit or publishing step is added. |

Electron uses isolated, sandboxed preload capabilities with exact argument counts, main-frame identity checks and blocked renderer navigation/new windows. Its encrypted credential file lives at a fixed `userData` path; `safeStorage` must have an available OS backend. Linux `basic_text` and unknown/plaintext fallback backends are rejected. The file contains ciphertext, and writes serialize. macOS Keychain and Windows DPAPI retain their platform-specific security properties.

Tauri registers only the authored commands, checks the local main window, and grants the renderer no direct dialog, filesystem, HTTP, keyring or updater plugin permissions. Blocking dialogs/keyring IO run off the UI thread. Rust keyring uses native Keychain, Windows Credential Manager or a Secret Service implementation; failure to initialize secure storage fails closed.

Wails binds the `App` capability methods; native paths, service/account and release configuration remain private. It uses the Wails native file dialog and go-keyring's Windows Credential Manager, macOS Keychain and Linux Secret Service backends. Avalonia uses `StorageProvider.OpenFilePickerAsync` and `ktsu.CredentialCache`'s native store factory, without an in-memory fallback. Linux secure-storage acceptance requires an unlocked desktop Secret Service session (and libsecret for the .NET backend). Portable mocks do not establish OS vault behavior.

## Versions and portable checks

Direct pins are recorded in the npm/Cargo/Go/.NET manifests: Electron 44.7.0; electron-builder 26.15.3 and electron-updater 6.8.9; Tauri CLI 2.12.1/core 2.12.2, dialog 2.8.1, updater 2.13.2 and keyring 4.2.0; Wails 2.14.0, go-keyring 0.2.8 and go-selfupdate 1.6.0; Avalonia 12.1.4, ktsu.CredentialCache 1.3.62 and Velopack/vpk 1.2.161. The Go module requires Go 1.25.12+. Rust 1.99.0 is the selected check lane; the new plugin dependencies require at least Rust 1.90.

Run from this pack:

```sh
npm ci --ignore-scripts
npm test
go -C wails test app.go app_test.go delivery.go delivery_test.go
rustc --edition 2021 --test tauri/src-tauri/src/boundary.rs -o /tmp/genlib-desktop-boundary-tests
/tmp/genlib-desktop-boundary-tests
dotnet test avalonia-tests/GenlibInventory.Tests.csproj
```

Node 24.19.0 passed 9 tests, including bounded real file IO, serialized credential operations with injected backends, ordered updater consent and failed-verification behavior. Go 1.27.2 passed 5 portable tests, including an ephemeral TLS source, real ECDSA validation and replacement of a synthetic temporary file only after final consent; the test never executes that file or replaces its own binary. Three standalone Rust validation tests passed. A Windows amd64 Wails host cross-build also passed on Linux (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -tags desktop,production`); this is compilation evidence only. The .NET tests, Tauri native build, desktop GUI sessions and real installed update round trips were not run locally.

## Native launch and host compilation

| Host | Commands and prerequisites |
| --- | --- |
| Electron | Deliberately provision the reviewed Electron binary with `node node_modules/electron/install.js`, then `npm run electron`. A real desktop session is required. `npm run electron:unpacked` makes a local unpacked build. |
| Tauri | Install the selected OS's WebView/GUI build prerequisites, then `npm run tauri:dev` or `npm run tauri:build`. Linux needs WebKitGTK and other Tauri system libraries; Windows needs MSVC/WebView2; macOS needs Xcode. `cargo check --locked --manifest-path tauri/src-tauri/Cargo.toml` is a compile gate. Original icon PNG/ICO exports are included for context generation. |
| Wails | Install `github.com/wailsapp/wails/v2/cmd/wails@v2.14.0`, then in `wails/` run `wails doctor` and `wails build`. A Windows compile-only gate can run `go -C wails build -tags desktop,production -o ../build/wails-fixture.exe .`. The frontend is original static source; no generated third-party binding tree is delivered. |
| Avalonia | With .NET 10, run `dotnet test avalonia-tests/GenlibInventory.Tests.csproj` and `dotnet run --project avalonia/GenlibInventory.csproj`. Exercise the picker, vault, keyboard/focus, DPI and appearance on each selected OS. |

## Deliberate local release profiles

Release commands require explicit version/feed configuration and produce local artifacts only. A receiving release owner supplies signing material, chooses the approved feed and performs publication separately. The pack contains no publish credentials or automatic upload command. Preserve application/user data outside the install/bundle directory.

**Electron.** Set `GENLIB_RELEASE_VERSION`, `GENLIB_UPDATE_FEED` and the receiving project's electron-builder signing variables, then run `npm run electron:package`. Windows additionally requires `GENLIB_WINDOWS_PUBLISHER`. The script forces code signing on Windows/macOS and uses `publish: never`. It creates NSIS, DMG/ZIP or AppImage targets on their matching hosts, embeds the reviewed HTTPS feed, and configures electron-updater to disable automatic download/install-on-quit and downgrades. The updater verifies package checksums; platform code-signature validation and publisher identity apply where supported. Linux AppImage distribution relies on the trusted HTTPS feed and published checksums; it is not described as an independent signed release protocol. [Updater and signing documentation](https://www.electron.build/auto-update.html).

**Tauri.** Set `GENLIB_RELEASE_VERSION`, `GENLIB_UPDATE_FEED`, `GENLIB_UPDATE_PUBLIC_KEY` and the release owner's `TAURI_SIGNING_PRIVATE_KEY` (plus its password when applicable), then run `npm run tauri:package`. The script generates icons from the original SVG and creates native bundles plus updater artifacts; it does not upload them. Version/feed/public key are embedded during the build. `requireSignedVersion` is enabled: pinned CLI 2.12.1 signs artifacts with their app version, and updater 2.13.2 rejects a mismatched signed version. The Rust adapter rejects non-HTTPS/cross-origin artifact URLs and redirects, verifies the signed artifact before retaining bytes, and installs only on the final action. The host must publish the matching [Tauri update JSON](https://v2.tauri.app/plugin/updater/) and supply OS code signing/notarization as required; updater signatures do not replace those platform requirements.

**Wails.** `npm run wails:package` supports standalone Windows/Linux x64/arm64 executables. Set `GENLIB_RELEASE_VERSION`, a platform-specific `GENLIB_UPDATE_FEED` directory URL, and `GENLIB_UPDATE_SIGNING_KEY_FILE` pointing to an existing ECDSA P-256 private key owned by the release process. The build embeds the version, feed and public key, then writes the binary, DER ECDSA signature, `manifest.yaml` and `manifest.yaml.sig` under `artifacts/wails/`. JSON-formatted metadata is valid YAML and is parsed using the pinned upstream manifest types. The updater verifies the signed metadata before version selection and the signed executable before staging; this binds the announced version to the authorized metadata. Requests reject redirects/cross-origin paths and bound metadata, signatures and artifacts to 1 MiB, 64 KiB and 256 MiB. Verified bytes remain in memory until final installation using go-selfupdate's replacement/rollback implementation. Restart launches only that fixed executable, with no renderer-provided path or arguments. No synthetic test binary is ever launched. macOS `.app` self-replacement is explicitly unsupported because replacing a file within a signed bundle invalidates its signature; select Tauri/Electron or a reviewed bundle updater for automatic macOS delivery. Wails' macOS picker/vault/build remain separate native profiles. [go-selfupdate](https://github.com/creativeprojects/go-selfupdate/tree/v1.6.0).

**Avalonia/Velopack.** The host calls `VelopackApp.Build().SetAutoApplyOnStartup(false).Run()` before UI startup. On Windows PowerShell:

```powershell
./velopack/package-windows.ps1 -Version 0.1.0 -UpdateFeed https://updates.example.invalid/inventory/windows-x64/
```

The script restores pinned vpk, publishes the .NET host, embeds the validated feed and creates local release files; it does not upload or invent a code-signing certificate. Add the receiving Windows release's signing configuration before distribution. Velopack's download validation finishes before enabling the final install/restart button; failures leave a reachable retry. An uninstalled debug app is not a valid update acceptance environment. This authored packaging script targets Windows x64. macOS/Linux Avalonia windows, pickers and vaults require their own installed-package delivery profiles before claiming those releases. [Velopack integration](https://docs.velopack.io/integrating/overview).

## Required installed-app acceptance

On every selected release host, install a signed/reviewed v0.1.0 fixture, deliberately make v0.1.1 available through the controlled feed, and exercise check, cancel/defer, download, failed transport, tampered signature/checksum, refused downgrade, final consent, restart, locked files and user-data survival. Verify secure-store unavailable/locked errors, persistence across a real app restart and fixed-key deletion. Use only disposable fixture credentials. Never infer GUI sandbox, native keychain or release acceptance from a portable test or successful source copy.
