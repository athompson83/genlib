# Desktop shell and update profiles

Original host glue, fixtures and tests are Apache-2.0. Electron, Wails, Avalonia and Velopack are MIT; Tauri core uses MIT OR Apache-2.0. Bundled Chromium/WebView runtimes, OS redistributables and transitive packages retain their own notices. No runtime, installer or third-party implementation is vendored.

## Choose a host

All four shells implement the same bounded title normalization interaction. Electron exposes one named IPC capability through a sandboxed, isolated preload, rejects non-main-frame calls, and blocks renderer navigation/new windows. The renderer receives no generic IPC sender, shell, filesystem or Node capability. Tauri registers one validated Rust command and grants no file/shell/network plugin permission. Its local frontend uses the Tauri IPC scheme. Wails binds one Go method and embeds original static assets. Avalonia supplies a native .NET window and the same title bounds. These source profiles do not expand existing Genlib web modules into universal native modules.

`npm ci --ignore-scripts && npm test` runs pure IPC boundary/validation tests. To launch Electron, deliberately provision its reviewed binary (`node node_modules/electron/install.js`) and run `npm run electron` on a supported desktop. No binary downloads occur during Genlib installation. The Electron dependency is pinned at 44.7.0. Package/sign using the receiving project's selected Electron packaging tool; no unreviewed packager is executed by this pack.

For Tauri, install the OS build prerequisites and run `npm run tauri:dev` from this pack. For a build use `npm run tauri:build`. These commands run in `tauri/` where `src-tauri` is detected. Bundling is disabled in the fixture; configure app icons, signing, updater and target formats in the receiving app. Linux needs WebKitGTK development libraries; macOS needs Xcode; Windows needs its MSVC/WebView prerequisites. The separate authored Tauri HTML allows only its IPC transport; the Electron HTML has no network connection allowance. Tauri API permissions are independent of the registered application command's input validation.

For Wails 2.14.0, install its Go CLI with `go install github.com/wailsapp/wails/v2/cmd/wails@v2.14.0`; run `go test app.go app_test.go` in `wails/` for the original Go method without a GUI dependency, then `wails doctor` and `wails build` in that directory. Static frontend assets need no package-manager/build command, so the Wails frontend command fields are intentionally empty. A working build still requires the platform WebView/toolchain. The `frontend/dist` assets are authored source, not a vendored web bundle.

For Avalonia, run `dotnet test avalonia-tests/GenlibInventory.Tests.csproj` and `dotnet run --project avalonia/GenlibInventory.csproj` with .NET 10. The fixture pins Avalonia 12.1.4. Test accessibility, keyboard/focus, DPI, theming and each supported OS on the actual app.

## Velopack integration

The .NET host calls `VelopackApp.Build().SetAutoApplyOnStartup(false).Run()` before UI startup. With a trusted build/deployment-provided `GENLIB_UPDATE_FEED` HTTPS URL, the update button checks/downloads an update and requires a separate restart click. No update feed or credentials are embedded. Preserve user data outside the application install/bundle directory. An uninstalled debug app is not a valid update acceptance environment.

On Windows PowerShell, run `./velopack/package-windows.ps1 -Version 0.1.0` to build local release files with pinned vpk/Velopack 1.2.161. It does not upload a release or sign with an invented certificate. Add the receiving release's code signing and a controlled update feed, install v0.1.0, then test an explicitly published v0.1.1 in a disposable VM. Verify restart, locked files, failed download, checksum failure, downgrade/channel policy, uninstall and user-data survival. [Velopack integration and update behavior](https://docs.velopack.io/integrating/overview). Windows fast hooks and platform packaging constraints must not be assumed identical on macOS/Linux; those need separate packaging commands and runtime acceptance.

## Verification scope

Node tests cover the extracted IPC validation code, not Electron's Chromium sandbox or a GUI launch. Go method tests are separate from a Wails build. .NET, display server, WebView SDKs, Xcode, Windows packaging and signed update round trips are unavailable in the implementation environment. Every desktop runtime/release profile is experimental until its stated native gates pass. Do not report an installer or update check as passed merely because source files copied successfully.
