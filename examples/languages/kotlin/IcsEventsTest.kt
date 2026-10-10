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
    val e1 = IcsEvents.Event(
        "evt-1@example.com", "2026-10-10T12:00:00Z", "2026-10-20T15:00:00Z", "2026-10-20T16:30:00Z", "Office hours; Q&A, live",
        description = "Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again.",
        location = "Room 4, Main St.", url = "https://example.com/e/1",
    )
    val e2 = IcsEvents.Event("evt-2@example.com", "2026-10-10T12:00:00Z", "2026-12-24", "2026-12-25", "Holiday")
    val expected = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n" +
        "BEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\n" +
        "SUMMARY:Office hours\\; Q&A\\, live\r\n" +
        "DESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n" +
        " é\\, then more words so the second line also runs past seventy-four octets\r\n" +
        "  and folds again.\r\n" +
        "LOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\n" +
        "DTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    eq(expected, IcsEvents.icsCalendar(listOf(e1, e2), "-//Acme//Genlib//EN"), "vector ics")
    eq(1, e1.description!!.count { it == '\\' }, "description holds one backslash")

    val ts = "2026-10-10T12:00:00Z"
    throwsIae("end equals start") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("u", ts, "2026-10-20T15:00:00Z", "2026-10-20T15:00:00Z", "s")), "p") }
    throwsIae("date start with UTC end") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("u", ts, "2026-10-20", "2026-10-21T00:00:00Z", "s")), "p") }
    throwsIae("empty uid") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("", ts, "2026-10-20", "2026-10-21", "s")), "p") }
    throwsIae("ftp url") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("u", ts, "2026-10-20", "2026-10-21", "s", url = "ftp://x")), "p") }
    throwsIae("date dtstamp") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("u", "2026-10-10", "2026-10-20", "2026-10-21", "s")), "p") }
    throwsIae("invalid calendar date") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("u", ts, "2026-02-30", "2026-03-01", "s")), "p") }
    throwsIae("empty summary") { IcsEvents.icsCalendar(listOf(IcsEvents.Event("u", ts, "2026-10-20", "2026-10-21", "")), "p") }

    println("IcsEventsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
