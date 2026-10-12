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

// Chi-square statistic of the 2x2 contingency table of two 0/1 assignments.
private fun chiSquare2x2(t: Array<DoubleArray>): Double {
    val n = t[0][0] + t[0][1] + t[1][0] + t[1][1]
    var chi = 0.0
    for (i in 0..1) for (j in 0..1) {
        val e = (t[i][0] + t[i][1]) * (t[0][j] + t[1][j]) / n
        chi += (t[i][j] - e) * (t[i][j] - e) / e
    }
    return chi
}

fun main() {
    eq(FeatureFlags.Result(true, "rollout", 849, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-1"), "flag case 0")
    eq(FeatureFlags.Result(false, "excluded", 5308, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-2"), "flag case 1")
    eq(FeatureFlags.Result(false, "excluded", 5247, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-3"), "flag case 2")
    eq(FeatureFlags.Result(false, "excluded", 9209, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "user-42"), "flag case 3")
    eq(FeatureFlags.Result(false, "excluded", 9060, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", rolloutPercent = 25.0), "alice@example.com"), "flag case 4")
    eq(FeatureFlags.Result(false, "deny", 849, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", allow = listOf("user-2"), deny = listOf("user-1"), rolloutPercent = 25.0), "user-1"), "flag case 5")
    eq(FeatureFlags.Result(true, "allow", 5308, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "new-checkout", allow = listOf("user-2"), deny = listOf("user-1"), rolloutPercent = 25.0), "user-2"), "flag case 6")
    eq(FeatureFlags.Result(false, "disabled", 8844, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "beta", enabled = false, allow = listOf("vip")), "vip"), "flag case 7")
    eq(FeatureFlags.Result(false, "excluded", 6875, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "banner", rolloutPercent = 0.0), "user-1"), "flag case 8")
    eq(FeatureFlags.Result(true, "rollout", 6875, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "banner", rolloutPercent = 100.0), "user-1"), "flag case 9")
    eq(FeatureFlags.Result(false, "excluded", 8197, null), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "banner", rolloutPercent = 12.34), "user-9"), "flag case 10")
    eq(FeatureFlags.Result(true, "rollout", 6435, "control"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u1"), "flag case 11")
    eq(FeatureFlags.Result(true, "rollout", 401, "annual-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u2"), "flag case 12")
    eq(FeatureFlags.Result(true, "rollout", 9955, "monthly-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u3"), "flag case 13")
    eq(FeatureFlags.Result(true, "rollout", 8249, "annual-first"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u4"), "flag case 14")
    eq(FeatureFlags.Result(true, "rollout", 6254, "control"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "u5"), "flag case 15")
    eq(FeatureFlags.Result(true, "rollout", 7068, "control"), FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "pricing-test", variants = listOf(FeatureFlags.Variant("control", 50), FeatureFlags.Variant("annual-first", 30), FeatureFlags.Variant("monthly-first", 20))), "\u00FCn\u00EFcode"), "flag case 16")
    throwsIae("flag invalid 0") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "bad key"), "u") }
    throwsIae("flag invalid 1") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "k", rolloutPercent = 101.0), "u") }
    throwsIae("flag invalid 2") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "k", rolloutPercent = 12.345), "u") }
    throwsIae("flag invalid 3") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "k", variants = listOf(FeatureFlags.Variant("a", 0))), "u") }
    throwsIae("flag invalid 4") { FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = ""), "u") }

    // Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments with similar keys
    // put every subject in the same half of both. The fmix32 finalizer must keep them independent.
    val ab = listOf(FeatureFlags.Variant("a", 1), FeatureFlags.Variant("b", 1))
    for ((k1, k2) in listOf("checkout-a" to "checkout-b", "exp1" to "exp2")) {
        val parity = Array(2) { DoubleArray(2) }
        val arms = Array(2) { DoubleArray(2) }
        for (i in 0 until 10000) {
            val u = "u$i"
            parity[FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = k1), u).bucket % 2][FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = k2), u).bucket % 2]++
            val a1 = if (FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = k1, variants = ab), u).variant == "b") 1 else 0
            val a2 = if (FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = k2, variants = ab), u).variant == "b") 1 else 0
            arms[a1][a2]++
        }
        val cp = chiSquare2x2(parity)
        val ca = chiSquare2x2(arms)
        check(cp < 10.83, "bucket parity $k1/$k2 chi-square $cp")
        check(ca < 10.83, "50/50 variants $k1/$k2 chi-square $ca")
    }
    val counts = IntArray(100)
    for (i in 0 until 10000) counts[FeatureFlags.evaluateFlag(FeatureFlags.Flag(key = "checkout-a"), "u$i").bucket % 100]++
    check(counts.all { kotlin.math.abs(it - 100) <= 40 }, "100 buckets each get 100 +/- 40 of 10000 subjects")

    println("FeatureFlagsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
