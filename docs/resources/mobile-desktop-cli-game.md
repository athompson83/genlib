# Mobile, desktop, CLI and game resources

Maintained projects for mobile apps, desktop apps, command-line tools and games, so agents reuse them instead of hand-writing navigation, packaging, argument parsing, terminal UIs or game loops. Search with `node tools/resources.mjs search <need> --project mobile-app` (or `desktop-app`, `cli-tool`, `game`).

## How to choose

Pick within the stack the project already uses before switching languages. For **mobile**, React teams start with Expo (React Native) plus Expo Router, Flutter teams with Riverpod or Bloc plus go_router and dio, an existing web app can ship through Capacitor, and Kotlin teams can share logic with Kotlin Multiplatform. For **desktop**, Electron has the largest ecosystem, Tauri gives smaller and tighter-permission builds with a Rust core, Wails suits Go backends, and Avalonia or .NET MAUI suit C# teams. Rust-native GUIs (egui, Iced, Slint) suit tools. For **CLIs**, use the language's standard parser (Commander/yargs, Click/Typer, Cobra/urfave/cli, clap). Add prompts, colors and a TUI framework only when the tool is interactive, and always keep non-interactive flags for CI. Ship binaries with GoReleaser, dist (cargo-dist) or Node single executable applications. For **games**, Godot is a full editor engine, Phaser and KAPLAY cover 2D browser games, Babylon.js and PlayCanvas cover 3D web, Bevy is Rust ECS, and Rapier or Matter.js provide physics. three.js is listed in the media resources.

Records are checked automatically (`verification: partial`): on 2026-10-10 the repository was confirmed to exist, links resolved, and npm/PyPI/crates licenses were compared with the recorded license. No resource is installed, reviewed or tested in Genlib. Records marked `license-review` (Slint, Defold) use non-OSI or multi-option licenses. Read the terms before shipping.

## Mobile frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Framework for building native iOS and Android apps with React and JavaScript/TypeScript | [`react-native`](https://reactnative.dev) | Use instead of maintaining separate Swift and Kotlin codebases when a team already works in React (JS/TS) | MIT |
| React Native framework and SDK with managed native modules, config plugins and build tooling | [`expo`](https://expo.dev) | Use instead of hand-configuring Xcode/Gradle projects and writing common native modules (camera, notifications, file system) for a React Native app (JS/TS) | MIT |
| Google UI toolkit for building natively compiled mobile, desktop and web apps from one Dart codebase | [`flutter`](https://flutter.dev) | Use instead of maintaining separate native UI codebases when pixel-consistent cross-platform UI is the goal | BSD-3-Clause |
| Native runtime that ships an existing web app to iOS and Android with a plugin API | [`capacitor`](https://capacitorjs.com) | Use instead of rewriting a working web app natively or hand-writing WebView bridges for camera, files and push (JS/TS) | MIT |
| Kotlin technology for sharing business logic (and optionally UI) across Android, iOS, desktop and server | [`kotlin-multiplatform`](https://kotlinlang.org/docs/multiplatform.html) | Use instead of duplicating networking, persistence and domain logic in Swift and Kotlin while keeping native UIs — reference | Apache-2.0 |
| JetBrains declarative UI framework that brings Jetpack Compose to iOS, desktop and web | [`compose-multiplatform`](https://www.jetbrains.com/compose-multiplatform/) | Use instead of writing separate SwiftUI and Compose screens when a Kotlin team wants shared UI | Apache-2.0 |

## Mobile navigation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| File-based router for Expo and React Native apps built on React Navigation, with deep linking | [`expo-router`](https://docs.expo.dev/router/introduction/) | Use instead of hand-writing navigator trees and deep-link URL mapping in an Expo app (JS/TS) | MIT |
| Stack, tab and drawer navigation library for React Native apps | [`react-navigation`](https://reactnavigation.org) | Use instead of hand-building screen stacks, tab bars, back handling and navigation state persistence in React Native (JS/TS) | MIT |
| Declarative URL-based router for Flutter maintained by the Flutter team | [`go-router`](https://pub.dev/packages/go_router) | Use instead of hand-writing Navigator 2.0 Router delegates, deep links and redirect guards (Dart) | BSD-3-Clause |

## Mobile UI and styling

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Tailwind CSS utility classes for React Native components | [`nativewind`](https://www.nativewind.dev) | Use instead of hand-writing StyleSheet objects and responsive/dark-mode style logic when the team already uses Tailwind tokens (JS/TS) | MIT |
| Universal UI kit and optimizing style compiler for React Native and web | [`tamagui`](https://tamagui.dev) | Use instead of building a shared design-token system and component set separately for React Native and React web (JS/TS) | MIT |
| Copy-paste accessible React Native and web components styled with NativeWind/Tailwind | [`gluestack-ui`](https://gluestack.io) | Use instead of hand-writing accessible buttons, inputs, modals and menus for a React Native + NativeWind app (JS/TS) | MIT |
| High-performance recycling list component for React Native from Shopify | [`flash-list`](https://shopify.github.io/flash-list/) | Use instead of tuning FlatList windowing by hand for long, heterogeneous feeds (JS/TS) | MIT |
| Mobile-styled web component library with React, Angular and Vue bindings | [`ionic-framework`](https://ionicframework.com) | Use instead of hand-building iOS/Material-styled tabs, sheets and lists for a hybrid (Capacitor) app (JS/TS) | MIT |

## Mobile animation, input, storage and networking

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| UI-thread animation library for React Native with shared values, layout animations and worklets | [`react-native-reanimated`](https://docs.swmansion.com/react-native-reanimated/) | Use instead of hand-writing Animated API code that drops frames when the JS thread is busy (JS/TS) | MIT |
| Native-driven gesture system (pan, pinch, swipe, long-press) for React Native | [`react-native-gesture-handler`](https://docs.swmansion.com/react-native-gesture-handler/) | Use instead of hand-writing PanResponder gesture logic and conflict resolution between nested scrollables (JS/TS) | MIT |
| Fast synchronous key-value storage for React Native backed by Tencent MMKV | [`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) | Use instead of AsyncStorage wrappers and hand-written caching for settings, flags and small persisted state (JS/TS) | MIT |
| HTTP client for Dart with interceptors, cancellation, form data and timeouts | [`dio`](https://pub.dev/packages/dio) | Use instead of hand-writing retry/auth interceptors, multipart uploads and timeout handling on top of package:http (Dart) | MIT |

## Mobile state (Flutter)

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Compile-safe reactive state management and dependency injection for Dart and Flutter | [`riverpod`](https://riverpod.dev) | Use instead of hand-written InheritedWidget/ChangeNotifier plumbing for app state, caching and async loading (Dart) | MIT |
| Predictable event-driven state management (Bloc/Cubit) for Dart and Flutter | [`flutter-bloc`](https://bloclibrary.dev) | Use instead of ad-hoc setState and stream controllers when business logic needs testable, explicit state transitions (Dart) | MIT |

## Mobile references

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Official Android sample apps demonstrating Jetpack Compose UI patterns | [`jetpack-compose-samples`](https://developer.android.com/develop/ui/compose) | Use as a reference instead of inventing Compose architecture, theming and navigation patterns from scratch — reference | Apache-2.0 |
| Apple reference documentation and tutorials for building SwiftUI apps on iOS, macOS and other Apple platforms | [`swiftui-docs`](https://developer.apple.com/xcode/swiftui/) | Use as the authoritative API reference instead of guessing SwiftUI APIs or availability per OS version — reference | Apple terms (reference) |

## Mobile release automation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Automation tool for building, signing, screenshotting and releasing iOS and Android apps | [`fastlane`](https://fastlane.tools) | Use instead of hand-written shell scripts for code signing, TestFlight/Play uploads and store metadata (Ruby) | MIT |

## Desktop frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Framework for cross-platform desktop apps with Chromium and Node.js | [`electron`](https://www.electronjs.org) | Use instead of separate native desktop codebases when the app is a web UI that needs OS integration (JS/TS) | MIT |
| Rust-based framework for small, secure desktop and mobile apps with a web frontend and system WebView | [`tauri`](https://tauri.app) | Use instead of Electron when bundle size and memory matter, or instead of hand-writing native shells around a web UI (JS/TS) | Apache-2.0 OR MIT |
| Official Tauri plugins for file system, updater, store, notifications, dialogs, shell and more | [`tauri-plugins`](https://v2.tauri.app/plugin/) | Use instead of hand-writing Rust commands for common OS features like auto-update, dialogs and persisted settings in a Tauri app (JS/TS) | Apache-2.0 OR MIT |
| Go framework for desktop apps with a web frontend rendered in the system WebView | [`wails`](https://wails.io) | Use instead of Electron when the backend is Go and you want generated TypeScript bindings to Go methods (Go) | MIT |
| Lightweight cross-platform desktop runtime using the OS WebView and a small native binary | [`neutralinojs`](https://neutralino.js.org) | Use instead of Electron for small utility apps where a tiny download matters and Node APIs are not needed (JS/TS) | MIT |
| Cross-platform XAML-based .NET UI framework for Windows, macOS, Linux, mobile and WebAssembly | [`avalonia`](https://avaloniaui.net) | Use instead of WPF-only code when a .NET desktop app must also run on macOS and Linux (.NET) | MIT |
| Microsoft cross-platform .NET UI framework for Android, iOS, macOS and Windows | [`dotnet-maui`](https://dotnet.microsoft.com/apps/maui) | Use instead of separate Xamarin/native projects when a C# team targets mobile and Windows/macOS together (.NET) | MIT |
| Declarative native UI toolkit for Rust, C++, JavaScript and Python apps, including embedded devices | [`slint`](https://slint.dev) | Use instead of hand-drawing native widgets when a Rust/C++ app needs a lightweight declarative GUI (Rust) — license-review | GPL-3.0-only OR LicenseRef-Slint-Royalty-free-2.0 OR LicenseRef-Slint-Software-3.0 |
| Immediate-mode GUI library for Rust with the eframe app framework for native and web | [`egui`](https://www.egui.rs) | Use instead of building widget toolkits by hand for Rust tools, debug panels and in-game editors (Rust) | MIT OR Apache-2.0 |
| Cross-platform Elm-inspired GUI library for Rust | [`iced`](https://iced.rs) | Use instead of hand-written retained-mode UI state handling in a Rust desktop app (Rust) | MIT |
| Cross-platform GUI toolkit for Go apps on desktop and mobile | [`fyne`](https://fyne.io) | Use instead of binding native GUI toolkits by hand when a Go app needs a simple desktop UI (Go) | BSD-3-Clause |

## Desktop packaging and updates

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Packaging and installer builder for Electron apps (dmg, NSIS, AppImage, snap) with signing support | [`electron-builder`](https://www.electron.build) | Use instead of hand-scripting installers, code signing and notarization for Electron releases (JS/TS) | MIT |
| Official Electron toolchain for scaffolding, packaging and publishing desktop apps | [`electron-forge`](https://www.electronforge.io) | Use instead of assembling bundler, packager and publisher scripts by hand for a new Electron app (JS/TS) | MIT |
| Auto-update module for Electron apps packaged with electron-builder | [`electron-updater`](https://www.electron.build/features/auto-update) | Use instead of hand-writing update download, signature verification and restart logic for Electron (JS/TS) | MIT |

## CLI argument parsing

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Complete command-line argument parser and subcommand framework for Node.js | [`commander`](https://github.com/tj/commander.js) | Use instead of hand-parsing process.argv, help text and subcommands in a Node CLI (JS/TS) | MIT |
| Node.js argument parser with commands, validation, completion and generated help | [`yargs`](https://yargs.js.org) | Use instead of hand-written argv parsing, option validation and shell completion scripts (JS/TS) | MIT |
| Small, dependency-free framework for building Node.js command-line apps | [`cac`](https://github.com/cacjs/cac) | Use instead of hand-written argv parsing when a lightweight alternative to Commander is preferred (JS/TS) | MIT |
| Elegant, typed CLI builder from UnJS with lazy subcommands | [`citty`](https://github.com/unjs/citty) | Use instead of hand-written argv parsing and help output in TypeScript CLIs (JS/TS) | MIT |
| Composable Python package for building command-line interfaces with decorators | [`click`](https://click.palletsprojects.com) | Use instead of hand-written argparse subcommand trees, prompts and help formatting (Python) | BSD-3-Clause |
| Build Python CLIs from type-hinted functions, built on Click | [`typer`](https://typer.tiangolo.com) | Use instead of hand-declaring argparse options when function type hints can define the CLI (Python) | MIT |
| Go library for modern CLI applications with subcommands, flags and shell completion | [`cobra`](https://cobra.dev) | Use instead of hand-wiring the flag package into subcommand trees, help and completion in Go (Go) | Apache-2.0 |
| Declarative, simple package for building command-line apps in Go | [`urfave-cli`](https://cli.urfave.org) | Use instead of hand-wiring flag parsing and subcommands when Cobra is heavier than needed (Go) | MIT |
| Full-featured command-line argument parser for Rust with derive macros | [`clap`](https://github.com/clap-rs/clap) | Use instead of hand-parsing std::env::args, help text and shell completions in Rust (Rust) | MIT OR Apache-2.0 |

## CLI frameworks and config

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Framework for building large, plugin-capable TypeScript CLIs (from Salesforce/Heroku) | [`oclif`](https://oclif.io) | Use instead of building command discovery, plugins, help and auto-update plumbing for a multi-command CLI (JS/TS) | MIT |
| Go configuration library merging files, environment variables, flags and defaults | [`viper`](https://github.com/spf13/viper) | Use instead of hand-writing config precedence across YAML/TOML files, env vars and flags in Go (Go) | MIT |

## CLI prompts

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Styled interactive prompts (text, select, confirm, spinner) for Node CLIs | [`clack-prompts`](https://bomb.sh/docs/clack/basics/getting-started/) | Use instead of hand-writing readline prompt loops and spinners for setup wizards (JS/TS) | MIT |
| Collection of interactive command-line prompts for Node.js | [`inquirer`](https://github.com/SBoudrias/Inquirer.js) | Use instead of hand-writing list, checkbox, password and editor prompts with readline (JS/TS) | MIT |
| Python library for interactive command-line prompts (select, checkbox, confirm, text) | [`questionary`](https://github.com/tmbo/questionary) | Use instead of hand-written input() loops and menu rendering in Python CLIs (Python) | MIT |

## CLI output (colors, spinners, progress, tables)

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Terminal string styling with automatic color-support detection | [`chalk`](https://github.com/chalk/chalk) | Use instead of hand-writing ANSI escape codes and NO_COLOR/TTY detection (JS/TS) | MIT |
| Tiny, fast terminal color formatting library with no dependencies | [`picocolors`](https://github.com/alexeyraspopov/picocolors) | Use instead of hand-written ANSI color helpers when dependency size matters (JS/TS) | ISC |
| Elegant terminal spinner for long-running Node CLI tasks | [`ora`](https://github.com/sindresorhus/ora) | Use instead of hand-writing spinner frames, cursor hiding and success/failure symbols (JS/TS) | MIT |
| Python library for rich terminal output: tables, progress bars, syntax highlighting and tracebacks | [`rich`](https://rich.readthedocs.io) | Use instead of hand-formatting tables, progress bars and colored logs in Python CLIs (Python) | MIT |
| Style definitions for terminal layouts in Go: colors, borders, padding and alignment | [`lipgloss`](https://charm.land) | Use instead of hand-writing ANSI styling and box layout math in Go terminal output (Go) | MIT |
| Progress bars and spinners for Rust command-line applications | [`indicatif`](https://github.com/console-rs/indicatif) | Use instead of hand-writing progress rendering, ETA and multi-bar coordination in Rust CLIs (Rust) | MIT |

## Terminal UIs

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| React renderer for building interactive terminal UIs with components and Flexbox layout | [`ink`](https://github.com/vadimdemedes/ink) | Use instead of hand-managing ANSI cursor movement and redraws for rich interactive terminal apps (JS/TS) | MIT |
| Python framework for building full terminal user interfaces with widgets and CSS-like styling | [`textual`](https://textual.textualize.io) | Use instead of hand-written curses code for interactive Python terminal apps (Python) | MIT |
| Elm-architecture framework for building terminal user interfaces in Go | [`bubbletea`](https://charm.land) | Use instead of hand-managing raw terminal mode, input events and redraws for interactive Go CLIs (Go) | MIT |
| Rust library for building rich terminal user interfaces and dashboards | [`ratatui`](https://ratatui.rs) | Use instead of hand-drawing terminal widgets, layouts and buffers in Rust (Rust) | MIT |

## CLI distribution

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Official Node.js feature for packaging a bundled script into a single standalone executable | [`node-sea`](https://nodejs.org/api/single-executable-applications.html) | Use instead of the archived pkg tool or hand-rolled launchers when shipping a Node CLI as one binary — reference | MIT |
| Release automation that cross-compiles, archives, signs and publishes binaries (Go, Rust, Zig and more) | [`goreleaser`](https://goreleaser.com) | Use instead of hand-written release scripts for cross-platform builds, checksums, Homebrew taps and GitHub releases | MIT |
| Release tool that builds, packages and publishes Rust (and other) binaries with installers and CI config | [`cargo-dist`](https://axodotdev.github.io/cargo-dist/) | Use instead of hand-writing GitHub Actions matrices, archives and shell/PowerShell installers for Rust CLI releases | MIT OR Apache-2.0 |

## Game engines

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Free, open-source 2D and 3D game engine with an integrated editor, GDScript and C# | [`godot`](https://godotengine.org) | Use instead of writing a custom engine, scene graph, editor and export pipeline for a 2D/3D game | MIT |
| HTML5 2D game framework for Canvas and WebGL browser games | [`phaser`](https://phaser.io) | Use instead of hand-writing a game loop, sprite rendering, input, tweens and arcade physics for browser games (JS/TS) | MIT |
| Full-featured 3D game and rendering engine for the web with WebGL/WebGPU, physics and XR | [`babylonjs`](https://www.babylonjs.com) | Use instead of assembling a 3D engine (scene, materials, physics, input, XR) by hand for browser games (JS/TS) | Apache-2.0 |
| Open-source WebGL/WebGPU 3D game engine; the hosted editor is a separate service | [`playcanvas`](https://playcanvas.com) | Use instead of building a 3D runtime with entity-component structure, physics and asset loading for the web (JS/TS) | MIT |
| Data-driven ECS game engine written in Rust | [`bevy`](https://bevy.org) | Use instead of writing a custom ECS, renderer and asset pipeline for a Rust game (Rust) | MIT OR Apache-2.0 |
| Simple C library for videogame programming with bindings for many languages | [`raylib`](https://www.raylib.com) | Use instead of hand-wiring OpenGL, windowing, input and audio for small games and prototypes | Zlib |
| Framework for making 2D games in Lua | [`love2d`](https://love2d.org) | Use instead of writing windowing, graphics, audio and input layers by hand for a Lua 2D game | Zlib |
| Beginner-friendly JavaScript/TypeScript game library, the maintained fork of Kaboom.js | [`kaplay`](https://kaplayjs.com) | Use instead of hand-writing sprites, collisions and scenes for quick browser games and game jams; use it in place of the unmaintained Kaboom (JS/TS) | MIT |
| TypeScript-first 2D game engine for the web | [`excalibur`](https://excaliburjs.com) | Use instead of building actors, scenes, collisions and input for a TypeScript browser game by hand (JS/TS) | BSD-2-Clause |
| Free cross-platform 2D/3D game engine with a Lua scripting editor, stewarded by the Defold Foundation | [`defold`](https://defold.com) | Use instead of building a lightweight engine and export pipeline for mobile and web 2D games — license-review | LicenseRef-Defold-License |

## Game rendering and physics

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Fast 2D WebGL/WebGPU rendering engine for interactive graphics and games | [`pixijs`](https://pixijs.com) | Use instead of hand-writing WebGL sprite batching and scene graphs for 2D interactive content (JS/TS) | MIT |
| 2D rigid-body physics engine for the web | [`matter-js`](https://brm.io/matter-js/) | Use instead of hand-writing collision detection and rigid-body integration for 2D browser games (JS/TS) | MIT |
| 2D and 3D physics engine written in Rust with official JavaScript (WASM) bindings | [`rapier`](https://rapier.rs) | Use instead of hand-writing collision, joints and rigid-body simulation for Rust or JavaScript games (JS/TS) | Apache-2.0 |
