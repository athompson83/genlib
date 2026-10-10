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
    val vectors = listOf(
        Triple("*/15 * * * *", "2026-10-10T12:07:30Z", "2026-10-10T12:15:00Z"),
        Triple("0 9 * * 1-5", "2026-10-10T12:00:00Z", "2026-10-12T09:00:00Z"),
        Triple("30 2 1 * *", "2026-10-10T00:00:00Z", "2026-11-01T02:30:00Z"),
        Triple("0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29T00:00:00Z"),
        Triple("0 12 13 * 5", "2026-10-10T00:00:00Z", "2026-10-13T12:00:00Z"),
        Triple("59 23 31 12 *", "2026-12-31T23:59:00Z", "2027-12-31T23:59:00Z"),
        Triple("0 0 * * 0", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"),
        Triple("5,10 8-9 * * *", "2026-10-10T09:10:00Z", "2026-10-11T08:05:00Z"),
    )
    for ((expr, after, want) in vectors) eq(want, CronNext.nextRun(expr, after), "cron '$expr' after $after")
    eq("2026-10-11T00:00:00Z", CronNext.nextRun("0 0 * * 7", "2026-10-10T00:00:00Z"), "day-of-week 7 is Sunday")
    eq("2026-10-16T12:00:00Z", CronNext.nextRun("0 12 * * 5", "2026-10-13T12:00:00Z"), "dow only must match")
    eq("2026-10-10T12:20:00Z", CronNext.nextRun("20/20 * * * *", "2026-10-10T12:00:00Z"), "N/step starts at N")
    eq("2026-10-10T12:01:00Z", CronNext.nextRun("* * * * *", "2026-10-10T12:00:59.999Z"), "seconds truncated, strictly after")
    for (bad in listOf("* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8",
            "5-1 * * * *", "*/0 * * * *", "a * * * *", "1,,2 * * * *", "MON * * * *", "* * ? * *")) {
        throwsIae("rejects '$bad'") { CronNext.nextRun(bad, "2026-10-10T00:00:00Z") }
    }
    throwsIae("gives up after 5 years") { CronNext.nextRun("0 0 30 2 *", "2026-10-10T00:00:00Z") }
    throwsIae("rejects bad after") { CronNext.nextRun("* * * * *", "2026-10-10 00:00") }

    println("CronNextTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
