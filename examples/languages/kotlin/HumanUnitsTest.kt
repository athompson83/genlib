// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for human-units.
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
    eq("0 B", HumanUnits.formatBytes(0L, "si", 1), "formatBytes 0 si 1")
    eq("999 B", HumanUnits.formatBytes(999L, "si", 1), "formatBytes 999 si 1")
    eq("1 kB", HumanUnits.formatBytes(1000L, "si", 1), "formatBytes 1000 si 1")
    eq("1.5 KiB", HumanUnits.formatBytes(1536L, "iec", 1), "formatBytes 1536 iec 1")
    eq("1.5 kB", HumanUnits.formatBytes(1536L, "si", 1), "formatBytes 1536 si 1")
    eq("1 MB", HumanUnits.formatBytes(999950L, "si", 1), "formatBytes 999950 si 1")
    eq("999.9 kB", HumanUnits.formatBytes(999949L, "si", 1), "formatBytes 999949 si 1")
    eq("1 MiB", HumanUnits.formatBytes(1048576L, "iec", 2), "formatBytes 1048576 iec 2")
    eq("123.46 MB", HumanUnits.formatBytes(123456789L, "si", 2), "formatBytes 123456789 si 2")
    eq("118 MiB", HumanUnits.formatBytes(123456789L, "iec", 0), "formatBytes 123456789 iec 0")
    eq("8 EiB", HumanUnits.formatBytes(9223372036854775807L, "iec", 3), "formatBytes 9223372036854775807 iec 3")
    eq("1023 B", HumanUnits.formatBytes(1023L, "iec", 1), "formatBytes 1023 iec 1")
    eq("1 KiB", HumanUnits.formatBytes(1024L, "iec", 1), "formatBytes 1024 iec 1")
    eq("5 TB", HumanUnits.formatBytes(5000000000000L, "si", 1), "formatBytes 5000000000000 si 1")
    eq(0L, HumanUnits.parseBytes("0"), "parseBytes 0")
    eq(512L, HumanUnits.parseBytes("512"), "parseBytes 512")
    eq(1000L, HumanUnits.parseBytes("1kB"), "parseBytes 1kB")
    eq(1024L, HumanUnits.parseBytes("1 KiB"), "parseBytes 1 KiB")
    eq(1610612736L, HumanUnits.parseBytes("1.5 GiB"), "parseBytes 1.5 GiB")
    eq(2250000L, HumanUnits.parseBytes("2.25MB"), "parseBytes 2.25MB")
    eq(10L, HumanUnits.parseBytes(" 10 b "), "parseBytes  10 b ")
    eq(1001L, HumanUnits.parseBytes("1.0005 kB"), "parseBytes 1.0005 kB")
    eq(2L, HumanUnits.parseBytes("1.5"), "parseBytes 1.5")
    eq(1L, HumanUnits.parseBytes("0.5 B"), "parseBytes 0.5 B")
    eq(8070450532247928832L, HumanUnits.parseBytes("7 EiB"), "parseBytes 7 EiB")
    throwsIae("parseBytes invalid ") { HumanUnits.parseBytes("") }
    throwsIae("parseBytes invalid abc") { HumanUnits.parseBytes("abc") }
    throwsIae("parseBytes invalid 1 KB B") { HumanUnits.parseBytes("1 KB B") }
    throwsIae("parseBytes invalid 1.5.2 MB") { HumanUnits.parseBytes("1.5.2 MB") }
    throwsIae("parseBytes invalid -1 kB") { HumanUnits.parseBytes("-1 kB") }
    throwsIae("parseBytes invalid 1 kbit") { HumanUnits.parseBytes("1 kbit") }
    throwsIae("parseBytes invalid 1e3 B") { HumanUnits.parseBytes("1e3 B") }
    throwsIae("parseBytes invalid 9 EiB") { HumanUnits.parseBytes("9 EiB") }
    throwsIae("parseBytes invalid .5 kB") { HumanUnits.parseBytes(".5 kB") }
    eq("0ms", HumanUnits.formatDuration(0L), "formatDuration 0")
    eq("850ms", HumanUnits.formatDuration(850L), "formatDuration 850")
    eq("1s", HumanUnits.formatDuration(1000L), "formatDuration 1000")
    eq("45s", HumanUnits.formatDuration(45000L), "formatDuration 45000")
    eq("1m 5s", HumanUnits.formatDuration(65000L), "formatDuration 65000")
    eq("1h", HumanUnits.formatDuration(3600000L), "formatDuration 3600000")
    eq("1h 2m", HumanUnits.formatDuration(3725000L), "formatDuration 3725000")
    eq("1d 1h", HumanUnits.formatDuration(90061000L), "formatDuration 90061000")
    eq("2d", HumanUnits.formatDuration(172800000L), "formatDuration 172800000")
    eq("59s", HumanUnits.formatDuration(59999L), "formatDuration 59999")
    eq("just now", HumanUnits.relativeTime(0L), "relativeTime 0")
    eq("just now", HumanUnits.relativeTime(30L), "relativeTime 30")
    eq("just now", HumanUnits.relativeTime(-44L), "relativeTime -44")
    eq("in a minute", HumanUnits.relativeTime(45L), "relativeTime 45")
    eq("a minute ago", HumanUnits.relativeTime(-89L), "relativeTime -89")
    eq("in 2 minutes", HumanUnits.relativeTime(90L), "relativeTime 90")
    eq("in 3 minutes", HumanUnits.relativeTime(150L), "relativeTime 150")
    eq("45 minutes ago", HumanUnits.relativeTime(-2670L), "relativeTime -2670")
    eq("in an hour", HumanUnits.relativeTime(2700L), "relativeTime 2700")
    eq("in an hour", HumanUnits.relativeTime(5399L), "relativeTime 5399")
    eq("in 2 hours", HumanUnits.relativeTime(5400L), "relativeTime 5400")
    eq("21 hours ago", HumanUnits.relativeTime(-75600L), "relativeTime -75600")
    eq("in a day", HumanUnits.relativeTime(79200L), "relativeTime 79200")
    eq("in a day", HumanUnits.relativeTime(129599L), "relativeTime 129599")
    eq("in 2 days", HumanUnits.relativeTime(129600L), "relativeTime 129600")
    eq("in a month", HumanUnits.relativeTime(2246400L), "relativeTime 2246400")
    eq("2 months ago", HumanUnits.relativeTime(-3974400L), "relativeTime -3974400")
    eq("in 6 months", HumanUnits.relativeTime(15552000L), "relativeTime 15552000")
    eq("in a year", HumanUnits.relativeTime(27648000L), "relativeTime 27648000")
    eq("2 years ago", HumanUnits.relativeTime(-47347200L), "relativeTime -47347200")
    eq("in 2 years", HumanUnits.relativeTime(63115200L), "relativeTime 63115200")
    eq("in 10 years", HumanUnits.relativeTime(315569520L), "relativeTime 315569520")

    println("HumanUnitsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
