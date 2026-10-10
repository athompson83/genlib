// SPDX-License-Identifier: Apache-2.0

package icsevents

import (
	"strings"
	"testing"
)

var events = []Event{
	{UID: "evt-1@example.com", DTStamp: "2026-10-10T12:00:00Z", Start: "2026-10-20T15:00:00Z", End: "2026-10-20T16:30:00Z",
		Summary: "Office hours; Q&A, live",
		Description: "Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the " +
			"second line also runs past seventy-four octets and folds again.",
		Location: "Room 4, Main St.", URL: "https://example.com/e/1"},
	{UID: "evt-2@example.com", DTStamp: "2026-10-10T12:00:00Z", Start: "2026-12-24", End: "2026-12-25", Summary: "Holiday"},
}

const vector = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n" +
	"BEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\n" +
	"DTEND:20261020T163000Z\r\nSUMMARY:Office hours\\; Q&A\\, live\r\n" +
	"DESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n" +
	" é\\, then more words so the second line also runs past seventy-four octets\r\n" +
	"  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\n" +
	"BEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\n" +
	"DTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"

func TestVector(t *testing.T) {
	got, err := Calendar(events, "-//Acme//Genlib//EN")
	if err != nil || got != vector {
		t.Fatalf("got %q err %v", got, err)
	}
	for _, line := range strings.Split(got, "\r\n") {
		if len(line) > 75 {
			t.Fatalf("line over 75 octets: %q", line)
		}
	}
}

func TestErrors(t *testing.T) {
	changes := []func(*Event){
		func(e *Event) { e.End = e.Start },
		func(e *Event) { e.Start, e.End = "2026-10-20", "2026-10-21T00:00:00Z" },
		func(e *Event) { e.UID = "" },
		func(e *Event) { e.URL = "ftp://x" },
		func(e *Event) { e.DTStamp = "2026-10-10" },
		func(e *Event) { e.Start = "2026-02-30" },
	}
	for i, change := range changes {
		e := events[0]
		change(&e)
		if _, err := Calendar([]Event{e}, "-//Acme//Genlib//EN"); err == nil {
			t.Fatalf("change %d accepted", i)
		}
	}
}
