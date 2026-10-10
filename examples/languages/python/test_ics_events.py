# SPDX-License-Identifier: Apache-2.0
import unittest

from ics_events import ics_calendar

EVENTS = [
    {"uid": "evt-1@example.com", "dtstamp": "2026-10-10T12:00:00Z", "start": "2026-10-20T15:00:00Z",
     "end": "2026-10-20T16:30:00Z", "summary": "Office hours; Q&A, live",
     "description": "Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the "
                    "second line also runs past seventy-four octets and folds again.",
     "location": "Room 4, Main St.", "url": "https://example.com/e/1"},
    {"uid": "evt-2@example.com", "dtstamp": "2026-10-10T12:00:00Z", "start": "2026-12-24", "end": "2026-12-25",
     "summary": "Holiday"},
]
ICS = ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"
       "BEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\n"
       "DTEND:20261020T163000Z\r\nSUMMARY:Office hours\\; Q&A\\, live\r\n"
       "DESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n"
       " é\\, then more words so the second line also runs past seventy-four octets\r\n"
       "  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\n"
       "BEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\n"
       "DTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")


class IcsTests(unittest.TestCase):
    def test_vector(self):
        out = ics_calendar(EVENTS, "-//Acme//Genlib//EN")
        self.assertEqual(out, ICS)
        for line in out.encode("utf-8").split(b"\r\n"):
            self.assertLessEqual(len(line), 75)

    def test_errors(self):
        base = EVENTS[0]
        for change in ({"end": base["start"]}, {"start": "2026-10-20", "end": "2026-10-21T00:00:00Z"},
                       {"uid": ""}, {"url": "ftp://x"}, {"dtstamp": "2026-10-10"}, {"start": "2026-02-30"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                ics_calendar([{**base, **change}], "-//Acme//Genlib//EN")


if __name__ == "__main__":
    unittest.main()
