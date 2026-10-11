// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

/** Equality plus identical toString, so map entry order is checked too. */
private fun eqOrd(expected: Any?, actual: Any?, name: String) {
    eq(expected, actual, name)
    eq(expected.toString(), actual.toString(), "$name (order)")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

fun main() {
    eq(IsoWeek.WeekDate(2020, 53, 7), IsoWeek.isoWeek(2021, 1, 3), "isoWeek 0")
    eq("2020-W53-7", IsoWeek.formatIsoWeek(2021, 1, 3), "format 0")
    eq(IsoWeek.Date(2021, 1, 3), IsoWeek.fromIsoWeek(2020, 53, 7), "round trip 0")
    eq(IsoWeek.WeekDate(2021, 1, 1), IsoWeek.isoWeek(2021, 1, 4), "isoWeek 1")
    eq("2021-W01-1", IsoWeek.formatIsoWeek(2021, 1, 4), "format 1")
    eq(IsoWeek.Date(2021, 1, 4), IsoWeek.fromIsoWeek(2021, 1, 1), "round trip 1")
    eq(IsoWeek.WeekDate(2020, 53, 4), IsoWeek.isoWeek(2020, 12, 31), "isoWeek 2")
    eq("2020-W53-4", IsoWeek.formatIsoWeek(2020, 12, 31), "format 2")
    eq(IsoWeek.Date(2020, 12, 31), IsoWeek.fromIsoWeek(2020, 53, 4), "round trip 2")
    eq(IsoWeek.WeekDate(2026, 41, 7), IsoWeek.isoWeek(2026, 10, 11), "isoWeek 3")
    eq("2026-W41-7", IsoWeek.formatIsoWeek(2026, 10, 11), "format 3")
    eq(IsoWeek.Date(2026, 10, 11), IsoWeek.fromIsoWeek(2026, 41, 7), "round trip 3")
    eq(IsoWeek.WeekDate(2009, 1, 1), IsoWeek.isoWeek(2008, 12, 29), "isoWeek 4")
    eq("2009-W01-1", IsoWeek.formatIsoWeek(2008, 12, 29), "format 4")
    eq(IsoWeek.Date(2008, 12, 29), IsoWeek.fromIsoWeek(2009, 1, 1), "round trip 4")
    eq(IsoWeek.WeekDate(2009, 53, 7), IsoWeek.isoWeek(2010, 1, 3), "isoWeek 5")
    eq("2009-W53-7", IsoWeek.formatIsoWeek(2010, 1, 3), "format 5")
    eq(IsoWeek.Date(2010, 1, 3), IsoWeek.fromIsoWeek(2009, 53, 7), "round trip 5")
    eq(IsoWeek.WeekDate(2015, 53, 4), IsoWeek.isoWeek(2015, 12, 31), "isoWeek 6")
    eq("2015-W53-4", IsoWeek.formatIsoWeek(2015, 12, 31), "format 6")
    eq(IsoWeek.Date(2015, 12, 31), IsoWeek.fromIsoWeek(2015, 53, 4), "round trip 6")
    eq(IsoWeek.WeekDate(2015, 53, 5), IsoWeek.isoWeek(2016, 1, 1), "isoWeek 7")
    eq("2015-W53-5", IsoWeek.formatIsoWeek(2016, 1, 1), "format 7")
    eq(IsoWeek.Date(2016, 1, 1), IsoWeek.fromIsoWeek(2015, 53, 5), "round trip 7")
    eq(IsoWeek.WeekDate(2025, 1, 1), IsoWeek.isoWeek(2024, 12, 30), "isoWeek 8")
    eq("2025-W01-1", IsoWeek.formatIsoWeek(2024, 12, 30), "format 8")
    eq(IsoWeek.Date(2024, 12, 30), IsoWeek.fromIsoWeek(2025, 1, 1), "round trip 8")
    eq(IsoWeek.WeekDate(1, 1, 1), IsoWeek.isoWeek(1, 1, 1), "isoWeek 9")
    eq("0001-W01-1", IsoWeek.formatIsoWeek(1, 1, 1), "format 9")
    eq(IsoWeek.Date(1, 1, 1), IsoWeek.fromIsoWeek(1, 1, 1), "round trip 9")
    eq(IsoWeek.WeekDate(9999, 52, 5), IsoWeek.isoWeek(9999, 12, 31), "isoWeek 10")
    eq("9999-W52-5", IsoWeek.formatIsoWeek(9999, 12, 31), "format 10")
    eq(IsoWeek.Date(9999, 12, 31), IsoWeek.fromIsoWeek(9999, 52, 5), "round trip 10")
    eq(53, IsoWeek.weeksInYear(2015), "weeksInYear 0")
    eq(52, IsoWeek.weeksInYear(2016), "weeksInYear 1")
    eq(53, IsoWeek.weeksInYear(2020), "weeksInYear 2")
    eq(52, IsoWeek.weeksInYear(2021), "weeksInYear 3")
    eq(53, IsoWeek.weeksInYear(2026), "weeksInYear 4")
    eq(53, IsoWeek.weeksInYear(2032), "weeksInYear 5")
    eq(53, IsoWeek.weeksInYear(2037), "weeksInYear 6")
    eq(IsoWeek.Date(2021, 1, 1), IsoWeek.fromIsoWeek(2020, 53, 5), "fromIsoWeek 0")
    eq(IsoWeek.Date(2025, 12, 29), IsoWeek.fromIsoWeek(2026, 1, 1), "fromIsoWeek 1")
    eq(IsoWeek.Date(2008, 12, 29), IsoWeek.fromIsoWeek(2009, 1, 1), "fromIsoWeek 2")
    eq(IsoWeek.Date(2026, 10, 11), IsoWeek.parseIsoWeek("2026-W41-7"), "parse 0")
    eq(IsoWeek.Date(2026, 10, 11), IsoWeek.parseIsoWeek("2026W417"), "parse 1")
    eq(IsoWeek.Date(2026, 10, 5), IsoWeek.parseIsoWeek("2026-W41"), "parse 2")
    eq(IsoWeek.Date(2021, 1, 1), IsoWeek.parseIsoWeek("2020-W53-5"), "parse 3")
    throwsIae("invalid 0") { IsoWeek.parseIsoWeek("2021-W53-1") }
    throwsIae("invalid 1") { IsoWeek.parseIsoWeek("2026-W00-1") }
    throwsIae("invalid 2") { IsoWeek.parseIsoWeek("2026-W10-8") }
    throwsIae("invalid 3") { IsoWeek.parseIsoWeek("26-W10-1") }
    throwsIae("invalid 4") { IsoWeek.parseIsoWeek("2026-w10-1") }
    throwsIae("invalid 5") { IsoWeek.parseIsoWeek("2026-W1-1") }
    throwsIae("invalid date 2021-02-29") { IsoWeek.isoWeek(2021, 2, 29) }
    throwsIae("result past year 9999") { IsoWeek.fromIsoWeek(9999, 52, 7) }

    println("IsoWeekTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
