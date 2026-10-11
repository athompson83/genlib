// SPDX-License-Identifier: Apache-2.0

package bizdays

import "testing"

func TestIs(t *testing.T) {
	if got, err := IsBusinessDay("2026-10-10", []string{}, []string{"SA", "SU"}); err != nil || got != false {
		t.Errorf("IsBusinessDay(%s) = %v, %v", "2026-10-10", got, err)
	}
	if got, err := IsBusinessDay("2026-10-12", []string{}, []string{"SA", "SU"}); err != nil || got != true {
		t.Errorf("IsBusinessDay(%s) = %v, %v", "2026-10-12", got, err)
	}
	if got, err := IsBusinessDay("2026-12-25", []string{"2026-12-25", "2026-12-28", "2027-01-01"}, []string{"SA", "SU"}); err != nil || got != false {
		t.Errorf("IsBusinessDay(%s) = %v, %v", "2026-12-25", got, err)
	}
	if got, err := IsBusinessDay("2026-10-16", []string{}, []string{"FR", "SA"}); err != nil || got != false {
		t.Errorf("IsBusinessDay(%s) = %v, %v", "2026-10-16", got, err)
	}
}

func TestAdd(t *testing.T) {
	for _, c := range []struct {
		date              string
		n                 int
		holidays, weekend []string
		want              string
	}{
		{"2026-10-09", 1, []string{}, []string{"SA", "SU"}, "2026-10-12"},
		{"2026-10-12", -1, []string{}, []string{"SA", "SU"}, "2026-10-09"},
		{"2026-10-10", 0, []string{}, []string{"SA", "SU"}, "2026-10-12"},
		{"2026-10-12", 0, []string{}, []string{"SA", "SU"}, "2026-10-12"},
		{"2026-12-23", 3, []string{"2026-12-25", "2026-12-28", "2027-01-01"}, []string{"SA", "SU"}, "2026-12-30"},
		{"2026-12-31", -5, []string{"2026-12-25", "2026-12-28", "2027-01-01"}, []string{"SA", "SU"}, "2026-12-22"},
		{"2028-02-28", 1, []string{}, []string{"SA", "SU"}, "2028-02-29"},
		{"2026-10-14", 10, []string{}, []string{"FR", "SA"}, "2026-10-28"},
		{"2026-01-01", 260, []string{}, []string{"SA", "SU"}, "2026-12-31"},
		{"2026-10-11", 0, []string{}, []string{}, "2026-10-11"},
	} {
		if got, err := AddBusinessDays(c.date, c.n, c.holidays, c.weekend); err != nil || got != c.want {
			t.Errorf("AddBusinessDays(%s, %d) = %s, %v, want %s", c.date, c.n, got, err, c.want)
		}
	}
}

func TestBetween(t *testing.T) {
	for _, c := range []struct {
		start, end        string
		holidays, weekend []string
		want              int64
	}{
		{"2026-10-01", "2026-11-01", []string{"2026-10-12"}, []string{"SA", "SU"}, 21},
		{"2026-11-01", "2026-10-01", []string{}, []string{"SA", "SU"}, -22},
		{"2026-10-12", "2026-10-12", []string{}, []string{"SA", "SU"}, 0},
		{"2026-12-21", "2027-01-04", []string{"2026-12-25", "2026-12-28", "2027-01-01"}, []string{"SA", "SU"}, 7},
		{"2026-01-01", "2027-01-01", []string{}, []string{"SA", "SU"}, 261},
		{"2026-10-01", "2026-10-31", []string{}, []string{"FR", "SA"}, 21},
		{"2026-10-10", "2026-10-12", []string{"2026-10-11"}, []string{"SA", "SU"}, 0},
	} {
		if got, err := BusinessDaysBetween(c.start, c.end, c.holidays, c.weekend); err != nil || got != c.want {
			t.Errorf("BusinessDaysBetween(%s, %s) = %d, %v, want %d", c.start, c.end, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	if _, err := AddBusinessDays("2026-02-30", 1, nil, DefaultWeekend); err == nil {
		t.Errorf("AddBusinessDays(%s, 1) should fail", "2026-02-30")
	}
	if _, err := AddBusinessDays("2026-1-01", 1, nil, DefaultWeekend); err == nil {
		t.Errorf("AddBusinessDays(%s, 1) should fail", "2026-1-01")
	}
	if _, err := AddBusinessDays("2026-01-01", 100001, nil, DefaultWeekend); err == nil {
		t.Errorf("AddBusinessDays(%s, 100001) should fail", "2026-01-01")
	}
	if _, err := IsBusinessDay("2026-10-10", nil, []string{"MO", "TU", "WE", "TH", "FR", "SA", "SU"}); err == nil {
		t.Error("all-week weekend should fail")
	}
	if _, err := IsBusinessDay("2026-10-10", nil, []string{"XX"}); err == nil {
		t.Error("unknown weekday should fail")
	}
	if _, err := AddBusinessDays("9999-12-31", 1, nil, DefaultWeekend); err == nil {
		t.Error("overflow past 9999 should fail")
	}
}
