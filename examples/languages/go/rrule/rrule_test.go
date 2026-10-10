// SPDX-License-Identifier: Apache-2.0

package rrule

import (
	"reflect"
	"testing"
)

func TestCases(t *testing.T) {
	for _, c := range []struct {
		start, rule string
		want        []string
	}{
		{"2026-01-31T09:00:00Z", "FREQ=MONTHLY;COUNT=5", []string{"2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z", "2026-08-31T09:00:00Z"}},
		{"2026-10-12T09:30:00Z", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7", []string{"2026-10-12T09:30:00Z", "2026-10-14T09:30:00Z", "2026-10-16T09:30:00Z", "2026-10-19T09:30:00Z", "2026-10-21T09:30:00Z", "2026-10-23T09:30:00Z", "2026-10-26T09:30:00Z"}},
		{"2026-10-01T00:00:00Z", "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z", []string{"2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-10T00:00:00Z"}},
		{"2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4", []string{"2026-01-30T12:00:00Z", "2026-02-27T12:00:00Z", "2026-03-27T12:00:00Z", "2026-04-24T12:00:00Z"}},
		{"2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6", []string{"2026-01-13T12:00:00Z", "2026-01-27T12:00:00Z", "2026-02-10T12:00:00Z", "2026-02-24T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-24T12:00:00Z"}},
		{"2026-01-15T08:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6", []string{"2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z", "2026-03-31T08:00:00Z", "2026-04-01T08:00:00Z"}},
		{"2028-02-29T00:00:00Z", "FREQ=YEARLY;COUNT=3", []string{"2028-02-29T00:00:00Z", "2032-02-29T00:00:00Z", "2036-02-29T00:00:00Z"}},
		{"2026-03-10T10:00:00Z", "FREQ=YEARLY;BYMONTH=3,9;COUNT=5", []string{"2026-03-10T10:00:00Z", "2026-09-10T10:00:00Z", "2027-03-10T10:00:00Z", "2027-09-10T10:00:00Z", "2028-03-10T10:00:00Z"}},
		{"2026-10-14T18:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3", []string{"2026-10-27T18:00:00Z", "2026-11-10T18:00:00Z", "2026-11-24T18:00:00Z"}},
		{"2026-10-14T18:00:00Z", "FREQ=WEEKLY;COUNT=2", []string{"2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"}},
		{"2026-01-31T09:00:00Z", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z", []string{"2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z"}},
	} {
		got, err := Expand(c.start, c.rule, DefaultLimit)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Expand(%q, %q) = %v, %v", c.start, c.rule, got, err)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, rule := range []string{"FREQ=HOURLY", "COUNT=3", "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z", "FREQ=WEEKLY;BYDAY=1MO", "FREQ=DAILY;BYDAY=MO", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=MONTHLY;BYSETPOS=1", "FREQ=WEEKLY;INTERVAL=0", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1", "FREQ=YEARLY;UNTIL=2026-12-31", "FREQ=DAILY;FREQ=DAILY", "FREQ=WEEKLY;BYDAY=XX",
		"", "FREQ=MONTHLY;BYDAY=0MO", "FREQ=MONTHLY;BYDAY=6MO", "FREQ=WEEKLY;COUNT=-3", "FREQ=YEARLY;BYMONTH=-1", "FREQ=MONTHLY;BYMONTHDAY=0"} {
		if got, err := Expand("2026-01-01T00:00:00Z", rule, DefaultLimit); err == nil {
			t.Errorf("Expand(%q) = %v, want error", rule, got)
		}
	}
	for _, start := range []string{"2026-01-01 00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T00:00:00"} {
		if _, err := Expand(start, "FREQ=DAILY", 1); err == nil {
			t.Errorf("dtstart %q accepted", start)
		}
	}
	for _, limit := range []int{0, 1001} {
		if _, err := Expand("2026-01-01T00:00:00Z", "FREQ=DAILY", limit); err == nil {
			t.Errorf("limit %d accepted", limit)
		}
	}
}

func TestLimits(t *testing.T) {
	if got, _ := Expand("2026-01-01T00:00:00Z", "FREQ=DAILY", 3); len(got) != 3 {
		t.Errorf("limit 3 gave %d", len(got))
	}
	if got, _ := Expand("2026-01-01T00:00:00Z", "FREQ=DAILY", DefaultLimit); len(got) != DefaultLimit {
		t.Errorf("default limit gave %d", len(got))
	}
	if got, err := Expand("2026-02-29T00:00:00Z", "FREQ=YEARLY", 5); err == nil {
		t.Errorf("invalid date accepted: %v", got)
	}
	if got, _ := Expand("2026-01-01T00:00:00Z", "FREQ=DAILY;UNTIL=20251231T000000Z", 5); len(got) != 0 {
		t.Errorf("UNTIL before dtstart gave %v", got)
	}
	if got, _ := Expand("9999-12-30T00:00:00Z", "FREQ=DAILY", 5); len(got) != 2 {
		t.Errorf("year 9999 bound gave %v", got)
	}
}
