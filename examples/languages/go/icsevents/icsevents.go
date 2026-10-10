// SPDX-License-Identifier: Apache-2.0

// Package icsevents writes RFC 5545 VCALENDAR feeds for publishing events.
// Times are UTC "YYYY-MM-DDTHH:MM:SSZ" or all-day dates "YYYY-MM-DD".
package icsevents

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Event is one VEVENT. Description, Location and URL are optional (empty is omitted).
type Event struct {
	UID, DTStamp, Start, End, Summary string
	Description, Location, URL        string
}

var urlRE = regexp.MustCompile(`(?i)^https?://[^\s/?#]+\S*$`)

var escaper = strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\r\n", `\n`, "\n", `\n`)

func escape(text string) string { return escaper.Replace(text) }

func fold(line string, b *strings.Builder) {
	limit := 75
	for len(line) > limit {
		end := limit
		for line[end]&0xC0 == 0x80 { // never split a UTF-8 sequence
			end--
		}
		b.WriteString(line[:end])
		b.WriteString("\r\n ")
		line, limit = line[end:], 74
	}
	b.WriteString(line)
	b.WriteString("\r\n")
}

// when parses a value and reports whether it is a date (true) or UTC time (false).
func when(value, field string) (time.Time, bool, error) {
	if len(value) == 20 {
		if t, err := time.Parse("2006-01-02T15:04:05Z", value); err == nil {
			return t, false, nil
		}
	} else if len(value) == 10 {
		if t, err := time.Parse("2006-01-02", value); err == nil {
			return t, true, nil
		}
	}
	return time.Time{}, false, fmt.Errorf("icsevents: %s must be YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DD: %q", field, value)
}

func stamp(t time.Time, date bool) string {
	if date {
		return t.Format("20060102")
	}
	return t.Format("20060102T150405Z")
}

// Calendar serializes events to a CRLF-terminated, folded VCALENDAR string.
func Calendar(events []Event, prodID string) (string, error) {
	if prodID == "" {
		return "", errors.New("icsevents: prodID must be non-empty")
	}
	lines := []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:" + escape(prodID), "CALSCALE:GREGORIAN", "METHOD:PUBLISH"}
	for _, e := range events {
		if e.UID == "" || e.Summary == "" {
			return "", errors.New("icsevents: uid and summary must be non-empty")
		}
		ts, tsDate, err := when(e.DTStamp, "dtstamp")
		if err != nil {
			return "", err
		}
		if tsDate {
			return "", errors.New("icsevents: dtstamp must be a UTC time")
		}
		start, startDate, err := when(e.Start, "start")
		if err != nil {
			return "", err
		}
		end, endDate, err := when(e.End, "end")
		if err != nil {
			return "", err
		}
		if startDate != endDate {
			return "", errors.New("icsevents: start and end must both be UTC times or both be dates")
		}
		if !end.After(start) {
			return "", errors.New("icsevents: end must be after start")
		}
		param := ""
		if startDate {
			param = ";VALUE=DATE"
		}
		lines = append(lines, "BEGIN:VEVENT", "UID:"+escape(e.UID), "DTSTAMP:"+stamp(ts, false),
			"DTSTART"+param+":"+stamp(start, startDate), "DTEND"+param+":"+stamp(end, endDate),
			"SUMMARY:"+escape(e.Summary))
		if e.Description != "" {
			lines = append(lines, "DESCRIPTION:"+escape(e.Description))
		}
		if e.Location != "" {
			lines = append(lines, "LOCATION:"+escape(e.Location))
		}
		if e.URL != "" {
			if !urlRE.MatchString(e.URL) {
				return "", fmt.Errorf("icsevents: url must be an absolute http(s) URL: %q", e.URL)
			}
			lines = append(lines, "URL:"+e.URL)
		}
		lines = append(lines, "END:VEVENT")
	}
	lines = append(lines, "END:VCALENDAR")
	var b strings.Builder
	for _, line := range lines {
		fold(line, &b)
	}
	return b.String(), nil
}
