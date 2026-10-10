// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    val expected = listOf("0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta",
        "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0")
    val input = listOf("1.0.0-beta.11", "2.0.0", "1.0.0", "1.0.0-alpha.beta", "1.0.0-rc.1", "0.9.9",
        "1.0.0-alpha", "1.0.0+build.5", "1.0.0-beta.2", "1.0.0-alpha.1", "1.0.0-beta")
    eq(expected, input.sortedWith { a, b -> Semver.compare(a, b) }, "sort vector (stable sort)")
    eq(0, Semver.compare("1.0.0", "1.0.0+build.5"), "build metadata ignored")
    eq(-1, Semver.compare("1.0.0-alpha", "1.0.0"), "prerelease below release")
    eq(1, Semver.compare("1.0.0-alpha.beta", "1.0.0-alpha.1"), "alphanumeric above numeric")
    eq(1, Semver.compare("1.10.0", "1.9.0"), "numeric minor")

    val v = Semver.parse("1.2.3-rc.1+build.7")
    eq(listOf("rc", "1"), v.prerelease, "parse prerelease")
    eq("build.7", v.build, "parse build")
    eq("1.2.3-rc.1+build.7", v.toString(), "toString round trip")
    for (bad in listOf("1.2", "01.2.3", "1.02.3", "1.2.3-01", "1.2.3-", "1.2.3+", "v1.2.3", " 1.2.3", "1.2.3-a..b", "1.2.3.4")) {
        throwsIae("parse rejects '$bad'") { Semver.parse(bad) }
    }

    val satisfies = listOf(
        Triple("1.2.3", "^1.0.0", true), Triple("2.0.0", "^1.0.0", false), Triple("0.2.5", "^0.2.3", true),
        Triple("0.3.0", "^0.2.3", false), Triple("0.0.4", "^0.0.3", false), Triple("1.2.9", "~1.2.3", true),
        Triple("1.3.0", "~1.2.3", false), Triple("1.5.0", "1.x", true), Triple("1.5.0", ">=1.2.0 <1.5.0", false),
        Triple("1.4.9", ">=1.2.0 <1.5.0", true), Triple("3.1.0", "^1.0.0 || ^3.0.0", true),
        Triple("1.2.3-beta.2", "^1.2.3-beta.1", true), Triple("1.2.4-beta.1", "^1.2.3-beta.1", false),
        Triple("1.3.0-rc.1", "^1.2.0", false), Triple("1.2.0", "1.0.0 - 1.2.0", true), Triple("1.2.1", "1.0.0 - 1.2.0", false),
        Triple("0.0.1", "*", true), Triple("2.0.0", "<=1.x", false),
    )
    for ((version, range, want) in satisfies) eq(want, Semver.satisfies(version, range), "satisfies $version '$range'")
    check(Semver.satisfies("1.9.9", "<=1.x"), "<=1.x includes 1.9.9")
    check(Semver.satisfies("1.2.3", ">= 1.2.3"), "space after operator")
    check(Semver.satisfies("1.2.3", "=1.2.3") && !Semver.satisfies("1.2.4", "1.2.3"), "exact versions")
    check(!Semver.satisfies("1.0.0", ">1.x") && Semver.satisfies("2.0.0", ">1.x"), ">1.x desugars to >=2.0.0")
    check(Semver.satisfies("1.2.0", "~1.2") && !Semver.satisfies("1.3.0", "~1.2"), "~1.2")
    check(Semver.satisfies("0.2.9", "^0.2") && !Semver.satisfies("0.3.0", "^0.2"), "^0.2")
    check(!Semver.satisfies("1.0.0", "<1.x") && !Semver.satisfies("0.0.0", ">*"), "empty x-ranges")
    check(Semver.satisfies("1.9.0", "1.0 - 1") && !Semver.satisfies("2.0.0", "1.0 - 1"), "partial hyphen range")
    check(Semver.satisfies("0.1.0", ""), "empty range is any")
    throwsIae("invalid range") { Semver.satisfies("1.0.0", "^1.0.0.0") }
    throwsIae("invalid version") { Semver.satisfies("1.0", "*") }

    println("SemverTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
