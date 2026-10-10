// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for feature-flags.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq(FeatureFlags.Result(false, "excluded", 4063, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-1"), "flag case 0")
    eq(FeatureFlags.Result(true, "rollout", 1682, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-2"), "flag case 1")
    eq(FeatureFlags.Result(false, "excluded", 9301, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-3"), "flag case 2")
    eq(FeatureFlags.Result(false, "excluded", 9926, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-42"), "flag case 3")
    eq(FeatureFlags.Result(false, "excluded", 2919, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "alice@example.com"), "flag case 4")
    eq(FeatureFlags.Result(false, "deny", 4063, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", allow = listOf("user-2"), deny = listOf("user-1"), rolloutPercent = 25.0), "user-1"), "flag case 5")
    eq(FeatureFlags.Result(true, "allow", 1682, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", allow = listOf("user-2"), deny = listOf("user-1"), rolloutPercent = 25.0), "user-2"), "flag case 6")
    eq(FeatureFlags.Result(false, "disabled", 3546, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "beta", enabled = false, allow = listOf("vip")), "vip"), "flag case 7")
    eq(FeatureFlags.Result(false, "excluded", 6646, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "banner", rolloutPercent = 0.0), "user-1"), "flag case 8")
    eq(FeatureFlags.Result(true, "rollout", 6646, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "banner", rolloutPercent = 100.0), "user-1"), "flag case 9")
    eq(FeatureFlags.Result(false, "excluded", 7598, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "banner", rolloutPercent = 12.34), "user-9"), "flag case 10")
    eq(FeatureFlags.Result(true, "rollout", 4196, "monthly-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u1"), "flag case 11")
    eq(FeatureFlags.Result(true, "rollout", 7053, "control"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u2"), "flag case 12")
    eq(FeatureFlags.Result(true, "rollout", 9434, "annual-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u3"), "flag case 13")
    eq(FeatureFlags.Result(true, "rollout", 1339, "annual-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u4"), "flag case 14")
    eq(FeatureFlags.Result(true, "rollout", 3720, "annual-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u5"), "flag case 15")
    eq(FeatureFlags.Result(true, "rollout", 9874, "control"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "\u00FCn\u00EFcode"), "flag case 16")
    throwsIae("flag invalid 0") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "bad key"), "u") }
    throwsIae("flag invalid 1") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "k", rolloutPercent = 101.0), "u") }
    throwsIae("flag invalid 2") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "k", rolloutPercent = 12.345), "u") }
    throwsIae("flag invalid 3") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "k", variants = listOf(FeatureFlags.Variant("a", 0))), "u") }
    throwsIae("flag invalid 4") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = ""), "u") }

    println("FeatureFlagsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
