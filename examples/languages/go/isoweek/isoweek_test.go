// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package isoweek

import (
	"errors"
	"testing"
)

func TestISOWeek(t *testing.T) {
	for _, c := range []struct {
		y, m, d, wy, w, wd int
		text               string
	}{
		{2021, 1, 3, 2020, 53, 7, "2020-W53-7"},
		{2021, 1, 4, 2021, 1, 1, "2021-W01-1"},
		{2020, 12, 31, 2020, 53, 4, "2020-W53-4"},
		{2026, 10, 11, 2026, 41, 7, "2026-W41-7"},
		{2008, 12, 29, 2009, 1, 1, "2009-W01-1"},
		{2010, 1, 3, 2009, 53, 7, "2009-W53-7"},
		{2015, 12, 31, 2015, 53, 4, "2015-W53-4"},
		{2016, 1, 1, 2015, 53, 5, "2015-W53-5"},
		{2024, 12, 30, 2025, 1, 1, "2025-W01-1"},
		{1, 1, 1, 1, 1, 1, "0001-W01-1"},
		{9999, 12, 31, 9999, 52, 5, "9999-W52-5"},
	} {
		wy, w, wd, err := ISOWeek(c.y, c.m, c.d)
		if err != nil || wy != c.wy || w != c.w || wd != c.wd {
			t.Errorf("ISOWeek(%d, %d, %d) = %d %d %d %v", c.y, c.m, c.d, wy, w, wd, err)
		}
		if s, err := Format(c.y, c.m, c.d); err != nil || s != c.text {
			t.Errorf("Format(%d, %d, %d) = %q, %v", c.y, c.m, c.d, s, err)
		}
		if y, m, d, err := FromISOWeek(c.wy, c.w, c.wd); err != nil || y != c.y || m != c.m || d != c.d {
			t.Errorf("FromISOWeek(%d, %d, %d) = %d %d %d %v", c.wy, c.w, c.wd, y, m, d, err)
		}
		if y, m, d, err := Parse(c.text); err != nil || y != c.y || m != c.m || d != c.d {
			t.Errorf("Parse(%q) = %d %d %d %v", c.text, y, m, d, err)
		}
	}
	for _, bad := range [][3]int{{2021, 2, 29}, {0, 1, 1}, {10000, 1, 1}, {2026, 13, 1}, {2026, 4, 31}} {
		if _, _, _, err := ISOWeek(bad[0], bad[1], bad[2]); !errors.Is(err, ErrInvalid) {
			t.Errorf("ISOWeek(%v) error = %v", bad, err)
		}
	}
}

func TestWeeksInYear(t *testing.T) {
	for _, c := range [][2]int{
		{2015, 53},
		{2016, 52},
		{2020, 53},
		{2021, 52},
		{2026, 53},
		{2032, 53},
		{2037, 53},
	} {
		if got, err := WeeksInYear(c[0]); err != nil || got != c[1] {
			t.Errorf("WeeksInYear(%d) = %d, %v", c[0], got, err)
		}
	}
	if _, err := WeeksInYear(0); err == nil {
		t.Error("WeeksInYear(0) accepted")
	}
}

func TestFromISOWeek(t *testing.T) {
	for _, c := range [][6]int{
		{2020, 53, 5, 2021, 1, 1},
		{2026, 1, 1, 2025, 12, 29},
		{2009, 1, 1, 2008, 12, 29},
	} {
		if y, m, d, err := FromISOWeek(c[0], c[1], c[2]); err != nil || y != c[3] || m != c[4] || d != c[5] {
			t.Errorf("FromISOWeek(%v) = %d %d %d %v", c, y, m, d, err)
		}
	}
	for _, bad := range [][3]int{{2021, 53, 1}, {2026, 0, 1}, {2026, 1, 0}, {2026, 1, 8}, {0, 1, 1}, {9999, 52, 6}} {
		if _, _, _, err := FromISOWeek(bad[0], bad[1], bad[2]); err == nil {
			t.Errorf("FromISOWeek(%v) accepted", bad)
		}
	}
}

func TestParse(t *testing.T) {
	for _, c := range []struct {
		in      string
		y, m, d int
	}{
		{"2026-W41-7", 2026, 10, 11},
		{"2026W417", 2026, 10, 11},
		{"2026-W41", 2026, 10, 5},
		{"2020-W53-5", 2021, 1, 1},
	} {
		if y, m, d, err := Parse(c.in); err != nil || y != c.y || m != c.m || d != c.d {
			t.Errorf("Parse(%q) = %d %d %d %v", c.in, y, m, d, err)
		}
	}
	for _, bad := range []string{"2021-W53-1", "2026-W00-1", "2026-W10-8", "26-W10-1", "2026-w10-1", "2026-W1-1"} {
		if _, _, _, err := Parse(bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("Parse(%q) error = %v", bad, err)
		}
	}
}
