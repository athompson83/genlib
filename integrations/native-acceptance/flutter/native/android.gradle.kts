// SPDX-License-Identifier: Apache-2.0
// Merge these blocks into the generated Android app build.gradle.kts.
android {
    defaultConfig {
        testInstrumentationRunner = "pl.leancode.patrol.PatrolJUnitRunner"
        testInstrumentationRunnerArguments["clearPackageData"] = "true"
    }
    testOptions { execution = "ANDROIDX_TEST_ORCHESTRATOR" }
}
dependencies {
    androidTestUtil("androidx.test:orchestrator:1.6.1")
}
