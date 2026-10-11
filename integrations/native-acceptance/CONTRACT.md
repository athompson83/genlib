# Native acceptance and presentation states

Original Genlib source and fixtures are Apache-2.0. Maestro CLI and Patrol are Apache-2.0; Swift Snapshot Testing and permission_handler are MIT. Dependencies are fetched from their own registries; their implementations are not vendored. Maestro Studio and Maestro Cloud have separate terms and are unnecessary for these profiles.

## Deterministic observable behavior

The disposable Flutter app has a public local fixture identity, `fixture@example.invalid` / `fixture-only`. Its sign-in state includes a transient loading label, rejection and successful navigation. It never creates a real remote session or sends credentials. Sign-out clears fixture identity and state and invalidates any in-flight simulated sync.

The inventory screen validates a 1–200-character title, adds an item, navigates to details and changes completion. A settings screen controls deterministic online/offline state and injects a one-shot connection failure. Offline edits queue by revision and survive navigation and mobile background/foreground. Reconnecting attempts a sync; failure keeps local changes and exposes a retry; successful retry drains all revisions without duplicates, including edits made during an earlier request. The simulated remote service and local state are in memory. Process death, durable storage, actual network reachability and production authentication are outside this acceptance fixture.

Camera permission uses `permission_handler` 13.0.2 and the real OS request/settings APIs. The UI shows unknown, granted, denied and blocked states. A blocked state can open system settings, followed by a deliberate permission recheck. No camera image is captured. Widget tests inject permission responses; Patrol requires a fresh real permission prompt; Maestro has distinct allow and deny profiles. A fixture permission denial must not prevent ordinary inventory use.

## Create a disposable host

The selected headless CI SDK is Flutter 3.47.7 stable, commit `abaf9c523780a608bd46686fd5e53740a07077f8`; the source minimum is Flutter 3.32/Dart 3.8. `tool-versions.json` records verified release references, without claiming execution. With that toolchain, run:

```sh
node flutter/create-fixture.mjs /tmp/genlib-native-fixture
cd /tmp/genlib-native-fixture
flutter pub get
flutter test test/inventory_test.dart
```

The scaffold requires a new directory, creates Android/iOS hosts with `--no-pub`, then copies original source/tests and pinned direct dependencies. It refuses an existing directory. No receiving application is rewritten. In an existing app, deliberately merge selected source and tests instead. Flutter's generated package/Gradle locks belong to the new host and should be committed after successful resolution.

The test file contains three widget flows (identity and inventory navigation, permission denial/recovery, failed offline reconnect/retry) plus two controller tests (overlapping online edits and sign-out during upload). No test converts an absent native prerequisite into a successful result.

For either device framework, merge `flutter/native/AndroidManifest.fragment.xml` into the Android main manifest and `flutter/native/Info.plist.fragment.xml` into iOS Runner's property list. Enable `PERMISSION_CAMERA=1` inside the existing iOS Podfile post-install build-configuration loop, as shown in `Podfile.fragment.rb`; do not add a duplicate post-install block. Native declarations are required for the real permission API to work. Compile a receiving Android/iOS app after merging these settings.

## Patrol and Maestro device gates

Patrol pins package 4.10.0 and CLI 4.8.0. For Android, merge `flutter/native/android.gradle.kts` into the generated Android app Gradle file and copy `MainActivityTest.java` into the matching Android test package. Java 17 and the Android SDK/emulator are separate prerequisites. For iOS, add RunnerUITests in Xcode, use `RunnerUITests.m`, inherit the Runner pods with the provided fragment, align deployment/configuration settings and include the target in the test scheme. Target UUIDs and signing teams belong to the receiving app. [Official setup and compatibility](https://patrol.leancode.co/documentation/compatibility-table).

In the configured fixture, install the selected CLI, run `patrol doctor`, reset its camera permission and run:

```sh
dart pub global activate patrol_cli 4.8.0
patrol test -t patrol_test/inventory_test.dart
```

Patrol checks rejected/successful sign-in, a real OS permission prompt, offline editing, details/completion, background/foreground restoration, injected reconnect failure, retry and sign-out. The test fails when no fresh permission dialog appears; it does not silently treat an old permission grant as new coverage.

Maestro CLI 2.11.0 is pinned by the `cli-2.11.0` upstream release. Build and install the disposable fixture before running Maestro from this pack:

```sh
maestro test -e APP_ID=dev.genlib.genlib_inventory maestro/inventory.yaml
maestro test -e APP_ID=dev.genlib.genlib_inventory maestro/permission-denied.yaml
```

Select the actual iOS bundle ID on iOS. Each flow clears fixture app state, so use only the disposable test host. The main flow explicitly grants camera access; the second sets denial and asserts inventory remains usable. Maestro requires Java 17+; iOS uses macOS/Xcode and a simulator. Do not infer physical iOS support from Android support. Review accessibility labels and keyboard/viewport behavior on every selected platform. Screenshots contain test data and belong under the receiving CI's artifact-retention policy.

## Swift presentation snapshots

`swift test --package-path swift` runs a deterministic textual snapshot against an original reviewed text baseline. Swift 6.1+ and SnapshotTesting 1.19.6 are the selected profile. `InventoryDashboard` contains actual ready, loading and error/retry presentations; its loading view is deterministic rather than an animated frame sampled at an arbitrary time.

Add `swift/ios/InventoryRowSnapshotTests.swift` to an iOS XCTest host that imports the package. It defines five image assertions: light, dark, large accessibility text, loading and error. The helper fixes iPhone 13 layout and `en_US` locale and selects appearance/Dynamic Type deliberately. Pin Xcode and simulator OS as well. No fabricated PNG baseline is included. `.never` intentionally fails when a baseline is absent; first record/review each image on the exact selected runner, then retain those reviewed baselines with the host. Recording a new baseline is a review action, not a CI success substitute.

## Verification scope

The scaffold JavaScript syntax was checked. Flutter/Dart, Android/iOS devices, Swift and Xcode were unavailable locally, so widget/controller/device execution, native linking, visual baseline review, signing and device-farm runs are not claimed. This pack remains experimental. Root/receiving CI can run the real widget/controller and Swift textual gates independently; later results must identify their exact runtime. Device acceptance and reviewed image baselines remain separate gates even after a headless test passes.
