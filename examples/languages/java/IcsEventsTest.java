// SPDX-License-Identifier: Apache-2.0
import java.util.List;

public final class IcsEventsTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        IcsEvents.Event e1 = new IcsEvents.Event("evt-1@example.com", "2026-10-10T12:00:00Z", "2026-10-20T15:00:00Z",
            "2026-10-20T16:30:00Z", "Office hours; Q&A, live",
            "Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again.",
            "Room 4, Main St.", "https://example.com/e/1");
        IcsEvents.Event e2 = IcsEvents.Event.of("evt-2@example.com", "2026-10-10T12:00:00Z", "2026-12-24", "2026-12-25", "Holiday");
        String expected = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"
            + "BEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\n"
            + "SUMMARY:Office hours\\; Q&A\\, live\r\n"
            + "DESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n"
            + " é\\, then more words so the second line also runs past seventy-four octets\r\n"
            + "  and folds again.\r\n"
            + "LOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\n"
            + "BEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\n"
            + "DTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        eq(expected, IcsEvents.icsCalendar(List.of(e1, e2), "-//Acme//Genlib//EN"), "vector ics");
        check(e1.description().chars().filter(c -> c == '\\').count() == 1, "description holds one backslash");

        String ts = "2026-10-10T12:00:00Z";
        throwsIae(() -> IcsEvents.icsCalendar(List.of(IcsEvents.Event.of("u", ts, "2026-10-20T15:00:00Z", "2026-10-20T15:00:00Z", "s")), "p"), "end equals start");
        throwsIae(() -> IcsEvents.icsCalendar(List.of(IcsEvents.Event.of("u", ts, "2026-10-20", "2026-10-21T00:00:00Z", "s")), "p"), "date start with UTC end");
        throwsIae(() -> IcsEvents.icsCalendar(List.of(IcsEvents.Event.of("", ts, "2026-10-20", "2026-10-21", "s")), "p"), "empty uid");
        throwsIae(() -> IcsEvents.icsCalendar(List.of(new IcsEvents.Event("u", ts, "2026-10-20", "2026-10-21", "s", null, null, "ftp://x")), "p"), "ftp url");
        throwsIae(() -> IcsEvents.icsCalendar(List.of(IcsEvents.Event.of("u", "2026-10-10", "2026-10-20", "2026-10-21", "s")), "p"), "date dtstamp");
        throwsIae(() -> IcsEvents.icsCalendar(List.of(IcsEvents.Event.of("u", ts, "2026-02-30", "2026-03-01", "s")), "p"), "invalid calendar date");
        throwsIae(() -> IcsEvents.icsCalendar(List.of(IcsEvents.Event.of("u", ts, "2026-10-20", "2026-10-21", "")), "p"), "empty summary");

        System.out.println("IcsEventsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
