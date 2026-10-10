// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

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
    val parse = listOf(
        "P1Y2M3DT4H5M6S" to IsoDuration.Parts(1, 2, 0, 3, 4, 5, 6000),
        "PT1H30M" to IsoDuration.Parts(hours = 1, minutes = 30),
        "P2W" to IsoDuration.Parts(weeks = 2),
        "PT0.5S" to IsoDuration.Parts(milliseconds = 500),
        "PT36H" to IsoDuration.Parts(hours = 36),
        "P0D" to IsoDuration.Parts(),
        "PT1.250S" to IsoDuration.Parts(milliseconds = 1250),
    )
    for ((s, want) in parse) eq(want, IsoDuration.parseDuration(s), "parse $s")
    for (bad in listOf("P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", "")) throwsIae("invalid $bad") { IsoDuration.parseDuration(bad) }
    for ((s, want) in listOf("PT1H30M" to 5400000L, "P2W" to 1209600000L, "P1DT0.5S" to 86400500L, "PT36H" to 129600000L)) {
        eq(want, IsoDuration.durationMilliseconds(IsoDuration.parseDuration(s)), "milliseconds $s")
    }
    for (ne in listOf("P1Y", "P1M")) throwsIae("not exact $ne") { IsoDuration.durationMilliseconds(IsoDuration.parseDuration(ne)) }
    val fmt = listOf(0L to "PT0S", 5400000L to "PT1H30M", 90061001L to "P1DT1H1M1.001S", 500L to "PT0.5S", 129600000L to "P1DT12H", 1209600000L to "P14D")
    for ((ms, want) in fmt) eq(want, IsoDuration.formatDuration(ms), "format $ms")
    throwsIae("format negative") { IsoDuration.formatDuration(-1) }
    throwsIae("component overflow") { IsoDuration.parseDuration("PT99999999999999999999S") }
    throwsIae("milliseconds overflow") { IsoDuration.durationMilliseconds(IsoDuration.parseDuration("P9999999999999999W")) }

    println("IsoDurationTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
