// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun near(expected: Double, actual: Double, tol: Double, name: String) =
    check(Math.abs(expected - actual) <= tol, "$name expected <$expected> got <$actual>")

private fun nearAll(expected: DoubleArray, actual: DoubleArray, tol: Double, name: String) {
    check(expected.size == actual.size, "$name length")
    for (i in 0 until minOf(expected.size, actual.size)) near(expected[i], actual[i], tol, "$name[$i]")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq(false, BusinessDays.isBusinessDay("2026-10-10", listOf<String>(), listOf<String>("SA", "SU")), "is 0")
    eq(true, BusinessDays.isBusinessDay("2026-10-12", listOf<String>(), listOf<String>("SA", "SU")), "is 1")
    eq(false, BusinessDays.isBusinessDay("2026-12-25", listOf<String>("2026-12-25", "2026-12-28", "2027-01-01"), listOf<String>("SA", "SU")), "is 2")
    eq(false, BusinessDays.isBusinessDay("2026-10-16", listOf<String>(), listOf<String>("FR", "SA")), "is 3")
    eq("2026-10-12", BusinessDays.addBusinessDays("2026-10-09", 1, listOf<String>(), listOf<String>("SA", "SU")), "add 0")
    eq("2026-10-09", BusinessDays.addBusinessDays("2026-10-12", -1, listOf<String>(), listOf<String>("SA", "SU")), "add 1")
    eq("2026-10-12", BusinessDays.addBusinessDays("2026-10-10", 0, listOf<String>(), listOf<String>("SA", "SU")), "add 2")
    eq("2026-10-12", BusinessDays.addBusinessDays("2026-10-12", 0, listOf<String>(), listOf<String>("SA", "SU")), "add 3")
    eq("2026-12-30", BusinessDays.addBusinessDays("2026-12-23", 3, listOf<String>("2026-12-25", "2026-12-28", "2027-01-01"), listOf<String>("SA", "SU")), "add 4")
    eq("2026-12-22", BusinessDays.addBusinessDays("2026-12-31", -5, listOf<String>("2026-12-25", "2026-12-28", "2027-01-01"), listOf<String>("SA", "SU")), "add 5")
    eq("2028-02-29", BusinessDays.addBusinessDays("2028-02-28", 1, listOf<String>(), listOf<String>("SA", "SU")), "add 6")
    eq("2026-10-28", BusinessDays.addBusinessDays("2026-10-14", 10, listOf<String>(), listOf<String>("FR", "SA")), "add 7")
    eq("2026-12-31", BusinessDays.addBusinessDays("2026-01-01", 260, listOf<String>(), listOf<String>("SA", "SU")), "add 8")
    eq("2026-10-11", BusinessDays.addBusinessDays("2026-10-11", 0, listOf<String>(), listOf<String>()), "add 9")
    eq(21L, BusinessDays.businessDaysBetween("2026-10-01", "2026-11-01", listOf<String>("2026-10-12"), listOf<String>("SA", "SU")), "between 0")
    eq(-22L, BusinessDays.businessDaysBetween("2026-11-01", "2026-10-01", listOf<String>(), listOf<String>("SA", "SU")), "between 1")
    eq(0L, BusinessDays.businessDaysBetween("2026-10-12", "2026-10-12", listOf<String>(), listOf<String>("SA", "SU")), "between 2")
    eq(7L, BusinessDays.businessDaysBetween("2026-12-21", "2027-01-04", listOf<String>("2026-12-25", "2026-12-28", "2027-01-01"), listOf<String>("SA", "SU")), "between 3")
    eq(261L, BusinessDays.businessDaysBetween("2026-01-01", "2027-01-01", listOf<String>(), listOf<String>("SA", "SU")), "between 4")
    eq(21L, BusinessDays.businessDaysBetween("2026-10-01", "2026-10-31", listOf<String>(), listOf<String>("FR", "SA")), "between 5")
    eq(0L, BusinessDays.businessDaysBetween("2026-10-10", "2026-10-12", listOf<String>("2026-10-11"), listOf<String>("SA", "SU")), "between 6")
    throwsIae("invalid 0") { BusinessDays.addBusinessDays("2026-02-30", 1) }
    throwsIae("invalid 1") { BusinessDays.addBusinessDays("2026-1-01", 1) }
    throwsIae("invalid 2") { BusinessDays.addBusinessDays("2026-01-01", 100001) }
    eq(false, BusinessDays.isBusinessDay("2026-10-10"), "default weekend")
    eq(-22L, BusinessDays.businessDaysBetween("2026-11-01", "2026-10-01"), "default between")
    throwsIae("all seven weekend days") { BusinessDays.isBusinessDay("2026-10-10", listOf<String>(), listOf<String>("MO", "TU", "WE", "TH", "FR", "SA", "SU")) }
    throwsIae("unknown weekend day") { BusinessDays.isBusinessDay("2026-10-10", listOf<String>(), listOf<String>("XX")) }
    throwsIae("year zero") { BusinessDays.isBusinessDay("0000-01-01") }

    println("BusinessDaysTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
