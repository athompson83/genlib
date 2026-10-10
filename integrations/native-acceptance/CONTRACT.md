# Native acceptance profile

Original Genlib source and fixtures are Apache-2.0. Maestro CLI and Patrol are Apache-2.0; Swift Snapshot Testing is MIT. Dependencies are fetched from their own registries; their source is not vendored here. Maestro Studio is closed source and Maestro Cloud is a separate paid service; neither is needed by these profiles.

## Observable behavior and setup

The disposable Flutter inventory app rejects empty titles, creates an item, and toggles completion using accessible labels. Its widget test verifies these behaviors. Patrol adds a real mobile background/foreground round trip; this does not test process-death persistence. Maestro drives the same installed fixture through accessibility text. Change app identifiers and selectors deliberately for the receiving application.

With Flutter 3.32+ / Dart 3.8+, run `node flutter/create-fixture.mjs /tmp/genlib-native-fixture` to create a **new** Android/iOS host without dependency installation. Then in that new directory run `flutter pub get` and `flutter test test/inventory_test.dart`. The scaffold command replaces only files in the new generated fixture, never an existing application. For an existing app, merge the library and selected tests manually.

For Android Patrol, merge `flutter/native/android.gradle.kts` into the generated Android app Gradle file and put `MainActivityTest.java` in `android/app/src/androidTest/java/dev/genlib/genlib_inventory/`. Ensure its package matches the host MainActivity. Install the compatible CLI with `dart pub global activate patrol_cli 4.8.0`, run `patrol doctor`, boot an emulator, and run `patrol test -t patrol_test/inventory_test.dart`. The pinned Patrol package is 4.10.0; SDK/build tools and an emulator are required. Java 17 is the portable baseline for the Android toolchain. Gradle/Flutter dependency locks belong to the generated host and should be committed after verification.

For iOS, create a RunnerUITests XCTest UI target in Xcode, use `RunnerUITests.m`, inherit pods with the supplied Podfile fragment, align deployment targets/configurations with Runner, and include the target in the test scheme. The repository cannot ship an app-specific signing team or Xcode target UUID. Follow the [official setup](https://patrol.leancode.co/documentation) for the selected Flutter host layout. This explicit host integration is required before `patrol test` can work; the profile does not claim a prebuilt Xcode project. [Pinned CLI/package compatibility](https://patrol.leancode.co/documentation/compatibility-table).

For Maestro, build/install the fixture on Android or an iOS simulator, then run `maestro test -e APP_ID=dev.genlib.genlib_inventory maestro/inventory.yaml` (use the iOS bundle ID on iOS). This flow clears the fixture app's data; use only a disposable fixture/test account. Maestro's CLI requires Java 17+; iOS requires macOS/Xcode and a simulator. Physical iOS support must not be inferred from Android support. Review accessibility labels on each selected OS. Screenshots can contain test data and should use the receiving CI's artifact retention policy.

## Swift snapshots

`swift test --package-path swift` runs a deterministic textual snapshot against the included reviewed baseline. Swift 6.1+ is required by this profile. The SwiftUI row is a reusable presentation component. Add `swift/ios/InventoryRowSnapshotTests.swift` to an iOS XCTest target for a visual snapshot. Pin Xcode, simulator OS/model, appearance, locale, and Dynamic Type. No fabricated PNG baseline is included: recording and reviewing an image on the selected runner is required, and `.never` intentionally fails when the image baseline is absent. Recording is a deliberate local change, not a CI success substitute.

## Verification status

Flutter/Dart, Android/iOS devices, Swift and Xcode are unavailable in the implementation environment. These source/configuration profiles are experimental; no native build, emulator test, visual baseline, signing, or device-farm run is claimed. The listed commands are real gates and must fail when prerequisites or assertions fail. Native runtime validation must be recorded before promoting this pack to tested.
